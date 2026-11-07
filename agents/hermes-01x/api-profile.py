#!/usr/bin/env python3
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Create and verify the Hermes api profile layout for OpenShell 0.1.x (#52).

Runs as the sandbox UID on the admin side (OpenShell exec), never under the
api-profile Landlock domain. The layout is what hermes-api-landlock-exec.py
confines the api side to:

  /sandbox/.hermes-api/                      admin only
    shared-state.db -> profiles/api/state/shared-state.db
    profiles/api/   = HERMES_HOME            api side: read-only
      config.yaml .env SOUL.md skills/       admin-edited
      <top-level state file> -> state/<name>  admin-made symlinks
      <writable subdirs>                     api side: read/write

  hermes-api-profile.py bootstrap   create missing pieces (idempotent; never
                                    overwrites existing config, .env, SOUL.md)
  hermes-api-profile.py verify      check the layout; exit 0 only when sound
  hermes-api-profile.py write-config --expected-config-sha256 <hex>
                                    replace config.yaml with stdin when its
                                    current SHA-256 matches (compare-and-swap);
                                    the image-owned policy sections are pinned
  hermes-api-profile.py register-uploader | inspect-uploader
                                    add (or check) the fixed local uploader MCP
                                    entry; stdin is {"gateway_url", "sandbox_id",
                                    "replace_existing": true}

All print one JSON object on stdout. Unlike the 0.0.x root guard there is no
root-sealed anchor: the admin side owns and may edit the whole profile, and
the api side is kept out of it by Landlock.
"""

from __future__ import annotations

import contextlib
import fcntl
import hashlib
import importlib.util
import json
import os
import re
import secrets
import stat
import sys
import tempfile

API_ROOT = "/sandbox/.hermes-api"
PROFILES_DIR = f"{API_ROOT}/profiles"
API_HOME = f"{PROFILES_DIR}/api"
SHARED_STATE_LINK = f"{API_ROOT}/shared-state.db"
SHARED_STATE_TARGET = "profiles/api/state/shared-state.db"

GUARD_PATH = "/usr/local/lib/nemoclaw/hermes-runtime-config-guard.py"
MCP_TRANSACTION_PATH = "/usr/local/lib/nemoclaw/hermes-mcp-config-transaction.py"
LAUNCHER_PATH = "/usr/local/lib/nemoclaw/hermes-api-landlock-exec.py"

# Every top-level file Hermes v0.21.3 writes in the api HERMES_HOME (measured
# on OpenShell 0.1.7, #52). Each is an admin-made symlink into state/ because
# the api side cannot create entries at the top level.
STATE_SYMLINKS = (
    "state.db",
    "state.db.auto-maintenance.lock",
    "state.db.fts_rebuild.lock",
    "response_store.db",
    "runs_idempotency.db",
    "install_id",
    ".install_id.lock",
    ".update_check",
    ".tirith-install-failed",
    "gateway-starts.log",
    "channel_directory.json",
)
DESIGN_FILES = ("config.yaml", ".env", "SOUL.md")
DESIGN_DIRS = ("skills",)
API_KEY_PREFIX = "API_SERVER_KEY="
WRITE_LOCK = f"{API_ROOT}/.write-config.lock"
UPLOADER_SERVER = "sandbox-file-uploader"
UPLOADER_TOOLSET = "mcp-sandbox-file-uploader"
# OpenShell 0.1.x credential placeholders are opaque per-provider tokens
# (e.g. openshell:resolve:env:sb8f2f7d...), not the variable name, so the
# uploader's GATEWAY_API_KEY is copied from this process's own environment:
# ClawShell runs register-uploader through an OpenShell exec, which carries the
# attached gateway provider's placeholder (stable across key rotation).
PLACEHOLDER = re.compile(r"^openshell:resolve:env:[A-Za-z_][A-Za-z0-9_]{0,127}$")
# CA variables the uploader's HTTP client may need. Hermes leaves an unresolved
# ${VAR} verbatim, so each is written as a literal path, and only when it names
# an existing file or directory at registration time.
UPLOADER_CA_VARS = ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE")
MAX_PAYLOAD_BYTES = 8192
MAX_CONFIG_BYTES = 1 << 20
SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")


class LayoutError(Exception):
    pass


def _load(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise LayoutError(f"cannot load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _writable_subdirs() -> tuple[str, ...]:
    return tuple(_load("hermes_api_landlock_exec", LAUNCHER_PATH).WRITABLE_SUBDIRS)


def _lstat(path: str) -> os.stat_result | None:
    try:
        return os.lstat(path)
    except FileNotFoundError:
        return None


def _ensure_dir(path: str) -> None:
    st = _lstat(path)
    if st is None:
        os.mkdir(path, 0o700)
        return
    if not stat.S_ISDIR(st.st_mode):
        raise LayoutError(f"{path} exists and is not a real directory")
    if st.st_uid != os.geteuid():
        raise LayoutError(f"{path} is not owned by the sandbox user")
    if stat.S_IMODE(st.st_mode) & 0o077:
        os.chmod(path, 0o700)


def _write_new(path: str, data: bytes, mode: int) -> bool:
    """Create *path* exclusively; leave an existing file untouched."""
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, mode)
    except FileExistsError:
        st = os.lstat(path)
        if not stat.S_ISREG(st.st_mode):
            raise LayoutError(f"{path} exists and is not a regular file") from None
        return False
    with os.fdopen(fd, "wb") as handle:
        handle.write(data)
    return True


def _ensure_symlink(path: str, target: str) -> None:
    st = _lstat(path)
    if st is None:
        os.symlink(target, path)
        return
    if not stat.S_ISLNK(st.st_mode) or os.readlink(path) != target:
        raise LayoutError(f"{path} must be a symlink to {target}")


def bootstrap() -> dict:
    guard = _load("hermes_runtime_config_guard", GUARD_PATH)
    created: list[str] = []
    for path in (API_ROOT, PROFILES_DIR, API_HOME):
        _ensure_dir(path)
    for sub in DESIGN_DIRS + _writable_subdirs():
        path = os.path.join(API_HOME, sub)
        if _lstat(path) is None:
            created.append(sub)
        _ensure_dir(path)
    if _write_new(os.path.join(API_HOME, "config.yaml"), _render(guard, guard._api_config_bytes()), 0o600):
        created.append("config.yaml")
    key = secrets.token_urlsafe(32)
    if _write_new(os.path.join(API_HOME, ".env"), f"{API_KEY_PREFIX}{key}\n".encode(), 0o600):
        created.append(".env")
    if _write_new(os.path.join(API_HOME, "SOUL.md"), guard.HERMES_API_SOUL_BYTES, 0o600):
        created.append("SOUL.md")
    for name in STATE_SYMLINKS:
        path = os.path.join(API_HOME, name)
        if _lstat(path) is None:
            created.append(name)
        _ensure_symlink(path, f"state/{name}")
    _ensure_symlink(SHARED_STATE_LINK, SHARED_STATE_TARGET)
    result = verify()
    result["created"] = created
    return result


def _api_key_present(env_path: str) -> bool:
    with open(env_path, "r", encoding="utf-8") as handle:
        for line in handle:
            if line.startswith(API_KEY_PREFIX) and len(line.strip()) > len(API_KEY_PREFIX):
                return True
    return False


def verify() -> dict:
    uid = os.geteuid()
    problems: list[str] = []
    writable = _writable_subdirs()
    for path in (API_ROOT, PROFILES_DIR, API_HOME):
        st = _lstat(path)
        if st is None or not stat.S_ISDIR(st.st_mode) or st.st_uid != uid:
            problems.append(f"{path}: missing, not a directory, or not owned by the sandbox user")
        elif stat.S_IMODE(st.st_mode) & 0o077:
            problems.append(f"{path}: group/other permissions must be cleared")
    if problems:
        return {"ok": False, "problems": problems}
    expected = set(DESIGN_FILES) | set(DESIGN_DIRS) | set(writable) | set(STATE_SYMLINKS)
    for name in sorted(os.listdir(API_HOME)):
        if name not in expected:
            problems.append(f"unexpected top-level entry: {name}")
    for name in DESIGN_FILES:
        st = _lstat(os.path.join(API_HOME, name))
        if st is None or not stat.S_ISREG(st.st_mode) or st.st_uid != uid:
            problems.append(f"{name}: missing or not a regular sandbox-owned file")
        elif st.st_nlink != 1:
            problems.append(f"{name}: hardlinked")
    for name in DESIGN_DIRS + writable:
        st = _lstat(os.path.join(API_HOME, name))
        if st is None or not stat.S_ISDIR(st.st_mode) or st.st_uid != uid:
            problems.append(f"{name}/: missing or not a real sandbox-owned directory")
    for name in STATE_SYMLINKS:
        path = os.path.join(API_HOME, name)
        st = _lstat(path)
        if st is None or not stat.S_ISLNK(st.st_mode) or os.readlink(path) != f"state/{name}":
            problems.append(f"{name}: must be a symlink to state/{name}")
    st = _lstat(SHARED_STATE_LINK)
    if st is None or not stat.S_ISLNK(st.st_mode) or os.readlink(SHARED_STATE_LINK) != SHARED_STATE_TARGET:
        problems.append(f"{SHARED_STATE_LINK}: must be a symlink to {SHARED_STATE_TARGET}")
    env_path = os.path.join(API_HOME, ".env")
    if not problems and not _api_key_present(env_path):
        problems.append(".env: API_SERVER_KEY is missing")
    return {"ok": not problems, "profile_dir": API_HOME, "problems": problems}


class ConfigConflict(LayoutError):
    pass


def _read_regular(path: str) -> bytes:
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise LayoutError(f"{path} is not a regular file")
        with os.fdopen(fd, "rb", closefd=False) as handle:
            return handle.read(MAX_CONFIG_BYTES + 1)
    finally:
        os.close(fd)


def _pin_runtime_contract(guard, data: bytes) -> bytes:
    """Keep the settings the api runtime depends on, whatever the caller sent.

    - ``platforms.api_server``: the listener the prefix proxy expects.
    - ``kanban.dispatch_in_gateway: false``: the kanban dispatcher keeps its
      board under the shared Hermes root (``/sandbox/.hermes-api/kanban*``),
      outside the api side's Landlock domain; it would fail every tick.
    """
    import yaml  # Hermes venv dependency; only the write path needs it

    try:
        document = yaml.safe_load(data.decode("utf-8"))
    except (UnicodeDecodeError, yaml.YAMLError) as exc:
        raise LayoutError(f"refusing malformed Hermes api config input: {exc}") from None
    if not isinstance(document, dict):
        raise LayoutError("refusing non-mapping Hermes api config input")
    platforms = document.get("platforms")
    platforms = dict(platforms) if isinstance(platforms, dict) else {}
    api_server = platforms.get("api_server")
    api_server = dict(api_server) if isinstance(api_server, dict) else {}
    extra = api_server.get("extra")
    extra = dict(extra) if isinstance(extra, dict) else {}
    extra.update({"port": guard.HERMES_API_INTERNAL_PORT, "host": "127.0.0.1"})
    api_server.update({"enabled": True, "extra": extra})
    platforms["api_server"] = api_server
    document["platforms"] = platforms
    kanban = document.get("kanban")
    kanban = dict(kanban) if isinstance(kanban, dict) else {}
    kanban["dispatch_in_gateway"] = False
    document["kanban"] = kanban
    return yaml.safe_dump(document, sort_keys=False, allow_unicode=True).encode("utf-8")


def _render(guard, document_bytes: bytes) -> bytes:
    try:
        return guard._api_overlay_managed_sections(_pin_runtime_contract(guard, document_bytes))
    except LayoutError:
        raise
    except Exception as exc:  # noqa: BLE001 - the guard raises its own error type
        raise LayoutError(str(exc)) from None


def _locked_replace(transform) -> tuple[bytes, bool]:
    """Replace config.yaml with transform(current_bytes) under the writer lock.

    ``transform`` returns the new bytes, or None to leave the file unchanged.
    The temp file lives in the admin-only API_ROOT so an interrupted write
    never leaves a stray entry in the api HERMES_HOME. Returns the bytes now
    on disk and whether they changed.
    """
    lock_fd = os.open(WRITE_LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX)
        state = verify()
        if not state["ok"]:
            raise LayoutError("; ".join(state["problems"]))
        config_path = os.path.join(API_HOME, "config.yaml")
        current = _read_regular(config_path)
        if len(current) > MAX_CONFIG_BYTES:
            raise LayoutError("current api config is too large")
        rendered = transform(current)
        if rendered is None or rendered == current:
            return current, False
        fd, tmp_path = tempfile.mkstemp(dir=API_ROOT, prefix=".config.yaml.", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as handle:
                os.fchmod(handle.fileno(), 0o600)
                handle.write(rendered)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_path, config_path)
        except BaseException:
            # The temp file is already gone when os.replace() moved it into place
            # before the failure; only a leftover temp file needs removing.
            with contextlib.suppress(FileNotFoundError):
                os.unlink(tmp_path)
            raise
        dir_fd = os.open(API_HOME, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
        return rendered, True
    finally:
        os.close(lock_fd)


def write_config(expected_sha256: str, data: bytes) -> dict:
    """Compare-and-swap the api config.yaml with the policy sections pinned.

    The caller (ClawShell, through an ordinary OpenShell exec as the sandbox
    user) owns model routing and providers; the image owns the managed policy
    sections, which are overwritten here whatever the submitted document says.
    The api runtime must be restarted afterwards for the gateway to load the
    new config.
    """
    if not SHA256_HEX.fullmatch(expected_sha256):
        raise LayoutError("--expected-config-sha256 must be 64 lowercase hex digits")
    if len(data) > MAX_CONFIG_BYTES:
        raise LayoutError("config input is too large")
    guard = _load("hermes_runtime_config_guard", GUARD_PATH)
    rendered = _render(guard, data)

    def transform(current: bytes) -> bytes:
        if hashlib.sha256(current).hexdigest() != expected_sha256:
            raise ConfigConflict("api config changed after it was read; read it again and retry")
        return rendered

    written, _ = _locked_replace(transform)
    return {"ok": True, "profile_dir": API_HOME, "config_sha256": hashlib.sha256(written).hexdigest()}


def _uploader_entry(payload: dict) -> dict:
    """Build the fixed uploader MCP entry from the image's reviewed builder."""
    helper = _load("hermes_mcp_config_transaction", MCP_TRANSACTION_PATH)
    try:
        helper._validate_local_uploader_payload("add-local-uploader", payload)
        if helper.CLAW_SHELL_SCOPE_RE.fullmatch(payload["sandbox_id"]) is None:
            raise ValueError("the uploader requires a signed sandbox scope")
        entry = helper._managed_local_uploader_candidate(payload)
    except (ValueError, TypeError, KeyError) as exc:
        raise LayoutError(f"invalid uploader payload: {exc}") from None
    env = {
        key: value
        for key, value in entry["env"].items()
        if key in ("GATEWAY_URL", "SANDBOX_ID")
    }
    # OpenShell 0.1.x mediates egress transparently: no proxy variables. The
    # gateway credential is the placeholder OpenShell swaps at egress.
    placeholder = os.environ.get("GATEWAY_API_KEY", "")
    if not PLACEHOLDER.fullmatch(placeholder):
        raise LayoutError(
            "GATEWAY_API_KEY is not an OpenShell credential placeholder; attach the gateway provider"
        )
    env["GATEWAY_API_KEY"] = placeholder
    for name in UPLOADER_CA_VARS:
        value = os.environ.get(name, "")
        if value.startswith("/") and os.path.exists(value) and "$" not in value:
            env[name] = value
    env["CLAWSHELL_UPLOADER_PROFILE"] = "api"
    env["HERMES_HOME"] = API_HOME
    entry["env"] = env
    return entry


def _with_uploader(document: dict, entry: dict) -> dict:
    updated = dict(document)
    servers = updated.get("mcp_servers")
    servers = dict(servers) if isinstance(servers, dict) else {}
    servers[UPLOADER_SERVER] = entry
    updated["mcp_servers"] = servers
    toolsets = updated.get("platform_toolsets")
    toolsets = dict(toolsets) if isinstance(toolsets, dict) else {}
    api_tools = toolsets.get("api_server")
    # Keep every tool the admin granted; only make sure the uploader is there.
    api_tools = list(api_tools) if isinstance(api_tools, list) else ["file"]
    if UPLOADER_TOOLSET not in api_tools:
        api_tools.append(UPLOADER_TOOLSET)
    toolsets["api_server"] = api_tools
    updated["platform_toolsets"] = toolsets
    return updated


def _uploader_matched(document: object, entry: dict) -> bool:
    if not isinstance(document, dict):
        return False
    servers = document.get("mcp_servers")
    toolsets = document.get("platform_toolsets")
    api_tools = toolsets.get("api_server") if isinstance(toolsets, dict) else None
    return (
        isinstance(servers, dict)
        and servers.get(UPLOADER_SERVER) == entry
        and isinstance(api_tools, list)
        and UPLOADER_TOOLSET in api_tools
    )


def uploader(action: str, payload_bytes: bytes) -> dict:
    """Register or inspect the api profile's fixed local uploader.

    The uploader is an MCP child of the Landlock-confined api gateway, so it
    runs inside the api side's domain. Registration is a read-modify-write
    under the same lock as write-config, so a concurrent writer cannot be lost.
    """
    import yaml  # Hermes venv dependency

    if len(payload_bytes) > MAX_PAYLOAD_BYTES:
        raise LayoutError("uploader payload is too large")
    try:
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise LayoutError(f"uploader payload is not JSON: {exc}") from None
    if not isinstance(payload, dict):
        raise LayoutError("uploader payload must be a JSON object")
    entry = _uploader_entry(payload)
    if action == "inspect-uploader":
        state = verify()
        if not state["ok"]:
            raise LayoutError("; ".join(state["problems"]))
        document = yaml.safe_load(_read_regular(os.path.join(API_HOME, "config.yaml")).decode("utf-8"))
        matched = _uploader_matched(document, entry)
        return {"ok": True, "state": "matched" if matched else "missing"}
    guard = _load("hermes_runtime_config_guard", GUARD_PATH)

    def transform(current: bytes) -> bytes | None:
        try:
            document = yaml.safe_load(current.decode("utf-8"))
        except (UnicodeDecodeError, yaml.YAMLError) as exc:
            raise LayoutError(f"current api config is malformed: {exc}") from None
        if not isinstance(document, dict):
            raise LayoutError("current api config is not a mapping")
        if _uploader_matched(document, entry):
            return None
        updated = _with_uploader(document, entry)
        return _render(guard, yaml.safe_dump(updated, sort_keys=False, allow_unicode=True).encode("utf-8"))

    _, changed = _locked_replace(transform)
    return {"ok": True, "state": "matched", "changed": changed}


USAGE = (
    "usage: hermes-api-profile.py bootstrap|verify|register-uploader|inspect-uploader|"
    "write-config --expected-config-sha256 <hex> (config or uploader payload on stdin)"
)


def main(argv: list[str]) -> int:
    is_write = (
        len(argv) == 3 and argv[0] == "write-config" and argv[1] == "--expected-config-sha256"
    )
    simple = ("bootstrap", "verify", "register-uploader", "inspect-uploader")
    if not is_write and (len(argv) != 1 or argv[0] not in simple):
        print(json.dumps({"ok": False, "problems": [USAGE]}))
        return 2
    if os.geteuid() == 0:
        print(json.dumps({"ok": False, "problems": ["run as the sandbox user, not root"]}))
        return 2
    os.umask(0o077)
    try:
        if is_write:
            result = write_config(argv[2], sys.stdin.buffer.read(MAX_CONFIG_BYTES + 1))
        elif argv[0] in ("register-uploader", "inspect-uploader"):
            result = uploader(argv[0], sys.stdin.buffer.read(MAX_PAYLOAD_BYTES + 1))
        elif argv[0] == "bootstrap":
            result = bootstrap()
        else:
            result = verify()
    except ConfigConflict as exc:
        print(json.dumps({"ok": False, "conflict": True, "problems": [str(exc)]}, sort_keys=True))
        return 3
    except (LayoutError, OSError) as exc:
        result = {"ok": False, "problems": [str(exc)]}
    print(json.dumps(result, sort_keys=True))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
