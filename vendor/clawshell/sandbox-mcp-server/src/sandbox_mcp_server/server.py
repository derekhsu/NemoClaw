"""
MCP Server for sandbox file upload.

Uses FastMCP framework with stdio transport.
"""

import json
import os
import stat
from uuid import uuid4
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastmcp import FastMCP

from .gateway_client import GatewayClient, GatewayError


HERMES_API_HOME = Path("/sandbox/.hermes-api/profiles/api")
_API_RESERVED = frozenset({"config.yaml", "SOUL.md", "AGENTS.md", "USER.md", "IDENTITY.md", "TOOLS.md", "MEMORY.md", "sessions", "runtime", "memory", "skills", "logs", "cron", "deliveries"})
_MAX_DELIVERY_BYTES = 50 * 1024 * 1024


def _stage_api_delivery(path: Path) -> Path:
    """Copy API-owned artifacts without following caller-controlled symlinks."""
    source = path if path.is_absolute() else HERMES_API_HOME / path
    try:
        parts = source.relative_to(HERMES_API_HOME).parts
    except ValueError as exc:
        raise ValueError("API delivery source is outside its profile") from exc
    if not parts or any(p == ".." or p.startswith(".") for p in parts) or parts[0] in _API_RESERVED:
        raise ValueError("API delivery source is private profile state")
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    opened = []
    try:
        current = os.open(HERMES_API_HOME, flags)
        opened.append(current)
        for part in parts[:-1]:
            current = os.open(part, flags, dir_fd=current)
            opened.append(current)
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=current)
        opened.append(fd)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or info.st_nlink != 1:
            raise ValueError("API delivery requires an API-owned regular file")
        if info.st_size > _MAX_DELIVERY_BYTES:
            raise ValueError("API delivery file exceeds the size limit")
        home_fd = opened[0]
        try:
            os.mkdir("deliveries", 0o755, dir_fd=home_fd)
        except FileExistsError:
            pass
        delivery_fd = os.open("deliveries", flags, dir_fd=home_fd)
        opened.append(delivery_fd)
        if os.fstat(delivery_fd).st_uid != os.geteuid():
            raise ValueError("API delivery directory has an unexpected owner")
        os.fchmod(delivery_fd, 0o755)
        token = uuid4().hex
        os.mkdir(token, 0o755, dir_fd=delivery_fd)
        folder_fd = os.open(token, flags, dir_fd=delivery_fd)
        opened.append(folder_fd)
        os.fchmod(folder_fd, 0o755)
        target_fd = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=folder_fd)
        opened.append(target_fd)
        total = 0
        while chunk := os.read(fd, 1024 * 1024):
            total += len(chunk)
            if total > _MAX_DELIVERY_BYTES:
                os.unlink(parts[-1], dir_fd=folder_fd)
                raise ValueError("API delivery file exceeds the size limit")
            view = memoryview(chunk)
            while view:
                view = view[os.write(target_fd, view):]
        os.fchmod(target_fd, 0o644)
        return HERMES_API_HOME / "deliveries" / token / parts[-1]
    finally:
        for descriptor in reversed(opened):
            os.close(descriptor)


def _resolve_upload_path(file_path: str) -> Path:
    path = Path(file_path)
    if path.is_absolute():
        return path

    candidates = [Path.cwd() / path]

    home = os.getenv("HOME")
    if home:
        candidates.append(Path(home) / ".openclaw" / "workspace" / path)

    candidates.append(Path("/sandbox/.openclaw/workspace") / path)

    for candidate in candidates:
        if candidate.exists():
            return candidate

    return candidates[0]


def _debug_log(event: str, **fields: Any) -> None:
    if os.getenv("CLAWSHELL_UPLOADER_PROFILE") == "api":
        return
    log_path = Path("/sandbox/.openclaw/logs/sandbox-mcp-debug.log")
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "ts": datetime.now(UTC).isoformat(),
            "event": event,
            **fields,
        }
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        return


def create_server() -> FastMCP:
    """
    Create and configure FastMCP server.

    Returns:
        Configured FastMCP instance with tools registered.
    """
    mcp = FastMCP("sandbox-file-uploader")

    @mcp.tool()
    def upload_file(file_path: str, description: str | None = None) -> str:
        """
        Automatically upload user-facing files created or updated in the sandbox
        workspace to Gateway, because files inside the sandbox are not directly
        accessible to the user. Call this tool whenever the user asks to
        download, retrieve, export, view, or receive a file from this sandbox —
        the returned link is the only way for them to obtain it — and whenever
        you create or modify a file intended for user delivery. If the user
        explicitly asks for a file, upload it again even if it was uploaded
        before. After upload, immediately provide the returned download URL to
        the user verbatim: reproduce the complete signed URL
        character-for-character, and never abbreviate, truncate, elide, or
        reformat it — including inside a Markdown link target. Avoid temporary,
        intermediate, or internal-only files.

        Args:
            file_path: Absolute or relative path to file in sandbox
            description: Optional description of the file (uses filename if not provided)

        Returns:
            Markdown link to the uploaded file

        Example:
            upload_file("/workspace/report.pdf", "Monthly Report")
            # Returns: "[Monthly Report](/download/abc-123)"
        """
        # Resolve file path
        if os.getenv("CLAWSHELL_UPLOADER_PROFILE") == "api":
            try:
                if os.getenv("HERMES_HOME") != str(HERMES_API_HOME):
                    raise ValueError("API uploader requires its fixed profile home")
                path = _stage_api_delivery(Path(file_path))
            except (OSError, ValueError):
                return "Error: API file is not eligible for delivery"
        else:
            path = _resolve_upload_path(file_path)
        _debug_log(
            "tool_upload_file_invoked",
            file_path=file_path,
            resolved_path=str(path),
            cwd=str(Path.cwd()),
            description=description,
        )

        # Check if file exists
        if not path.exists():
            _debug_log("tool_upload_file_not_found", file_path=file_path, resolved_path=str(path))
            return f"Error: File not found: {file_path}"

        if not path.is_file():
            _debug_log("tool_upload_file_not_file", file_path=file_path, resolved_path=str(path))
            return f"Error: Path is not a file: {file_path}"

        # Use filename as description if not provided
        file_description = description or path.name

        try:
            # Create Gateway client from environment, use context manager to ensure closure
            with GatewayClient.from_env() as client:
                result = client.upload_file(
                    file_path=str(path),
                    description=file_description,
                )

            download_url = result.get("download_url", "")

            if not download_url:
                _debug_log("tool_upload_file_missing_download_url", result=result)
                return "Error: Gateway response did not include a download URL"

            _debug_log("tool_upload_file_success", resolved_path=str(path))
            return (
                f"[{file_description}]({download_url})\n\n"
                "Present the download URL to the user exactly as written — "
                "copy the complete signed URL verbatim with no truncation, "
                "abbreviation, or elision."
            )

        except GatewayError as e:
            _debug_log("tool_upload_file_gateway_error", error=str(e), resolved_path=str(path))
            return f"Error: {e}"
        except OSError as e:
            _debug_log("tool_upload_file_os_error", error=str(e), resolved_path=str(path))
            return f"Error: File I/O error during upload: {e}"
        except Exception as e:
            _debug_log(
                "tool_upload_file_unexpected_error",
                error=f"{type(e).__name__}: {e}",
                resolved_path=str(path),
            )
            return f"Error: Unexpected error during upload: {type(e).__name__}: {e}"

    return mcp


def main() -> None:
    """Run MCP server with stdio transport."""
    mcp = create_server()
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
