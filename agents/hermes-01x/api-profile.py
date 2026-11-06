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

Both print one JSON object on stdout. Unlike the 0.0.x root guard there is no
root-sealed anchor: the admin side owns and may edit the whole profile, and
the api side is kept out of it by Landlock.
"""

from __future__ import annotations

import importlib.util
import json
import os
import secrets
import stat
import sys

API_ROOT = "/sandbox/.hermes-api"
PROFILES_DIR = f"{API_ROOT}/profiles"
API_HOME = f"{PROFILES_DIR}/api"
SHARED_STATE_LINK = f"{API_ROOT}/shared-state.db"
SHARED_STATE_TARGET = "profiles/api/state/shared-state.db"

GUARD_PATH = "/usr/local/lib/nemoclaw/hermes-runtime-config-guard.py"
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
    if _write_new(os.path.join(API_HOME, "config.yaml"), guard._api_config_bytes(), 0o600):
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


def main(argv: list[str]) -> int:
    if len(argv) != 1 or argv[0] not in ("bootstrap", "verify"):
        print(json.dumps({"ok": False, "problems": ["usage: hermes-api-profile.py bootstrap|verify"]}))
        return 2
    if os.geteuid() == 0:
        print(json.dumps({"ok": False, "problems": ["run as the sandbox user, not root"]}))
        return 2
    os.umask(0o077)
    try:
        result = bootstrap() if argv[0] == "bootstrap" else verify()
    except (LayoutError, OSError) as exc:
        result = {"ok": False, "problems": [str(exc)]}
    print(json.dumps(result, sort_keys=True))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
