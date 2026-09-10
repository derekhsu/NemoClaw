"""stdio MCP server that delivers sandbox files through ClawShell Gateway."""

import os
from pathlib import Path

from fastmcp import FastMCP

from .gateway_client import GatewayClient, GatewayError


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


def create_server() -> FastMCP:
    """Create the fixed sandbox-file-uploader MCP server."""
    mcp = FastMCP("sandbox-file-uploader")

    @mcp.tool()
    def upload_file(file_path: str, description: str | None = None) -> str:
        """Upload a user-facing sandbox file and return its signed link.

        Call this after creating or modifying a file intended for user delivery.
        Do not use it for temporary or internal-only files.
        """
        path = _resolve_upload_path(file_path)
        if not path.exists():
            return f"Error: File not found: {file_path}"
        if not path.is_file():
            return f"Error: Path is not a file: {file_path}"

        try:
            with GatewayClient.from_env() as client:
                result = client.upload_file(str(path))
        except GatewayError as error:
            return f"Error: {error}"
        except OSError as error:
            return f"Error: File I/O error during upload: {error}"
        except Exception as error:
            return f"Error: Unexpected error during upload: {type(error).__name__}: {error}"

        download_url = result.get("download_url")
        if not isinstance(download_url, str) or not download_url:
            return "Error: Gateway response did not include a download URL"
        return f"[{description or path.name}]({download_url})"

    return mcp


def main() -> None:
    """Run the MCP server with its stdio transport."""
    create_server().run(transport="stdio")


if __name__ == "__main__":
    main()
