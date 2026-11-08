#!/usr/bin/env python3
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Exec a command inside the Hermes api-profile confinement (derekhsu/NemoClaw#52).

OpenShell 0.1.x runs every process as the `sandbox` UID, so the api profile
can no longer be separated from the admin side by UID. This launcher confines
the api side instead, irrevocably and for every descendant:

- Landlock (filesystem): the api HERMES_HOME is read-only; only its state
  subdirectories, its private tmp/ and workspace/ are writable. Nothing else
  under /sandbox is reachable, so the default profile (/sandbox/.hermes) and
  every other admin file stay unreadable and unwritable.
- seccomp: path-based chmod/chown/utime calls report success without running,
  and path-based xattr writes fail. Landlock does not mediate file metadata, so
  without this the api side could change modes or times on admin files.

What this does NOT confine (OpenShell 0.1.7 brokers connect/bind through its
own seccomp supervisor, which bypasses Landlock TCP rules; Unix socket connect
is not mediated by Landlock ABI 5; signals need ABI 6): loopback TCP, Unix
sockets and signals to same-UID processes. Admin-side services must therefore
authenticate with secrets the api side cannot read (#52, 2026-11-07).

Usage: api-landlock-exec.py <HERMES_HOME> [--keep-env NAME]... -- <argv...>

Fails closed: any setup error exits 70 before the target runs. Must be started
single-threaded (it is: CPython runs no extra threads before main()).
"""

from __future__ import annotations

import ctypes
import errno
import os
import platform
import stat
import struct
import sys

EXIT_REFUSED = 70

# ── Landlock ─────────────────────────────────────────────────────────────
SYS_LANDLOCK = {"x86_64": (444, 445, 446), "aarch64": (444, 445, 446)}
LANDLOCK_CREATE_RULESET_VERSION = 1
LANDLOCK_RULE_PATH_BENEATH = 1
REQUIRED_ABI = 5

EXECUTE = 1 << 0
WRITE_FILE = 1 << 1
READ_FILE = 1 << 2
READ_DIR = 1 << 3
REMOVE_DIR = 1 << 4
REMOVE_FILE = 1 << 5
MAKE_CHAR = 1 << 6
MAKE_DIR = 1 << 7
MAKE_REG = 1 << 8
MAKE_SOCK = 1 << 9
MAKE_FIFO = 1 << 10
MAKE_BLOCK = 1 << 11
MAKE_SYM = 1 << 12
REFER = 1 << 13
TRUNCATE = 1 << 14
IOCTL_DEV = 1 << 15
HANDLED_FS_ABI5 = (1 << 16) - 1
FILE_ONLY_RIGHTS = EXECUTE | WRITE_FILE | READ_FILE | TRUNCATE | IOCTL_DEV

READ_EXEC = EXECUTE | READ_FILE | READ_DIR
READ_ONLY = READ_FILE | READ_DIR
# Writable state trees. No device nodes and no IOCTL_DEV; REFER so Hermes can
# rename within and between its own state trees (never into the read-only
# HERMES_HOME, which grants no MAKE_* right).
STATE_TREE = (
    READ_FILE | READ_DIR | WRITE_FILE | TRUNCATE | REMOVE_DIR | REMOVE_FILE
    | MAKE_DIR | MAKE_REG | MAKE_SOCK | MAKE_FIFO | MAKE_SYM | REFER
)

SYSTEM_READ_EXEC = (
    "/usr",
    "/lib",
    "/lib64",
    "/bin",
    "/sbin",
    "/opt/hermes",
    "/opt/uv-python",
    "/proc",
    # Root-owned venv of the api profile's local uploader (an MCP child of the
    # api gateway, so it runs inside this domain); the api side cannot modify it.
    "/sandbox/.venvs/sandbox-mcp-server",
)
# /etc is granted entry by entry so admin material under /etc (for example
# /etc/nemoclaw) stays unreadable to the api side.
ETC_READ_ONLY = (
    "/etc/ld.so.cache",
    "/etc/ld.so.conf",
    "/etc/ld.so.conf.d",
    "/etc/localtime",
    "/etc/timezone",
    "/etc/passwd",
    "/etc/group",
    "/etc/nsswitch.conf",
    "/etc/host.conf",
    "/etc/hosts",
    "/etc/resolv.conf",
    "/etc/gai.conf",
    "/etc/protocols",
    "/etc/services",
    "/etc/mime.types",
    "/etc/os-release",
    "/etc/ssl",
    "/etc/ca-certificates",
    "/etc/ca-certificates.conf",
    "/etc/openshell-tls",
    "/etc/python3",
)
# OpenShell 0.1.x terminates TLS at its L7 proxy and mounts the matching CA
# bundle here (SSL_CERT_FILE and the image's certifi symlink point into it).
# Public CA material only; without it every HTTPS call from the api side fails
# certificate verification.
OPENSHELL_CA_READ_ONLY = ("/run/openshell-supervisor-ca/material",)
DEVICE_RULES = (
    ("/dev/null", READ_FILE | WRITE_FILE),
    ("/dev/zero", READ_FILE),
    ("/dev/urandom", READ_FILE),
    ("/dev/random", READ_FILE),
)
# drain_control opens this root-owned directory to prove the NemoClaw
# cron-restore drain marker is absent. List-only: file contents stay closed.
NEMOCLAW_STATE_LIST_ONLY = "/sandbox/.nemoclaw"

# Writable subdirectories of the api HERMES_HOME. The top level itself is
# read-only; every top-level state file Hermes writes is an admin-made symlink
# into state/ (see hermes-api-profile.py).
WRITABLE_SUBDIRS = (
    "state",
    "runtime",
    "logs",
    "cache",
    ".cache",
    "sessions",
    "memories",
    "audio_cache",
    "image_cache",
    "backups",
    "bin",
    "cron",
    "hooks",
    "pairing",
    "platforms",
    "tmp",
    "workspace",
    # The local uploader stages each API delivery here (deliveries/<token>/<name>)
    # and ClawShell snapshots it by descriptor without following symlinks.
    "deliveries",
)

# ── seccomp ──────────────────────────────────────────────────────────────
PR_SET_NO_NEW_PRIVS = 38
PR_SET_SECCOMP = 22
SECCOMP_MODE_FILTER = 2
SECCOMP_RET_ALLOW = 0x7FFF0000
SECCOMP_RET_ERRNO = 0x00050000
SECCOMP_RET_KILL_PROCESS = 0x80000000
AUDIT_ARCH = {"x86_64": 0xC000003E, "aarch64": 0xC00000B7}
# Path-based metadata writes. "fake" returns 0 without running the syscall so
# Hermes' own best-effort chmod/utime calls keep working; "deny" returns EPERM.
# utimensat with a NULL path is futimens() on an already-open fd and stays
# allowed (opening the file was already subject to Landlock).
METADATA_SYSCALLS = {
    "x86_64": {
        "fake": (90, 268, 452, 92, 94, 260, 132, 235, 261),  # chmod fchmodat fchmodat2 chown lchown fchownat utime utimes futimesat
        "utimensat": 280,
        "deny": (188, 189, 197, 198),  # setxattr lsetxattr removexattr lremovexattr
    },
    "aarch64": {
        "fake": (53, 452, 54),  # fchmodat fchmodat2 fchownat
        "utimensat": 88,
        "deny": (5, 6, 14, 15),  # setxattr lsetxattr removexattr lremovexattr
    },
}

# ── environment ──────────────────────────────────────────────────────────
ENV_ALLOWLIST = (
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
    "GIT_SSL_CAINFO",
    "NODE_EXTRA_CA_CERTS",
    "HERMES_CONTAINER",
)
FIXED_PATH = "/opt/hermes/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"


class _RulesetAttr(ctypes.Structure):
    _fields_ = [("handled_access_fs", ctypes.c_uint64)]


class _PathBeneath(ctypes.Structure):
    _pack_ = 1
    _fields_ = [("allowed_access", ctypes.c_uint64), ("parent_fd", ctypes.c_int32)]


class _SockFprog(ctypes.Structure):
    _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.c_void_p)]


_libc = ctypes.CDLL(None, use_errno=True)
_libc.syscall.restype = ctypes.c_long


def _refuse(message: str) -> "NoReturn":  # noqa: F821
    print(f"[api-landlock] {message}; refusing to start", file=sys.stderr, flush=True)
    os._exit(EXIT_REFUSED)


def _errno_name() -> str:
    return errno.errorcode.get(ctypes.get_errno(), "?")


def _arch() -> str:
    machine = platform.machine()
    if machine not in SYS_LANDLOCK or machine not in AUDIT_ARCH:
        _refuse(f"unsupported architecture {machine}")
    if ctypes.sizeof(_PathBeneath) != 12 or ctypes.sizeof(_RulesetAttr) != 8:
        _refuse("unexpected Landlock struct layout")
    return machine


def _add_path_rule(sys_add: int, ruleset: int, path: str, access: int, *, required: bool) -> None:
    try:
        fd = os.open(path, os.O_PATH | os.O_CLOEXEC | os.O_NOFOLLOW)
    except FileNotFoundError:
        if required:
            _refuse(f"required path missing: {path}")
        return
    except OSError as exc:
        _refuse(f"cannot open {path}: {exc.strerror}")
    try:
        st = os.fstat(fd)
        if stat.S_ISLNK(st.st_mode):
            # Merged-/usr layouts make /lib, /bin, /sbin symlinks into /usr,
            # which is granted on its own. Never follow a symlinked rule path.
            if required:
                _refuse(f"refusing symlinked rule path {path}")
            return
        if not stat.S_ISDIR(st.st_mode):
            access &= FILE_ONLY_RIGHTS
        rule = _PathBeneath(access, fd)
        if _libc.syscall(sys_add, ruleset, LANDLOCK_RULE_PATH_BENEATH, ctypes.byref(rule), 0) != 0:
            _refuse(f"landlock_add_rule {path}: {_errno_name()}")
    finally:
        os.close(fd)


def _apply_landlock(machine: str, home: str) -> None:
    sys_create, sys_add, sys_restrict = SYS_LANDLOCK[machine]
    abi = _libc.syscall(sys_create, None, 0, LANDLOCK_CREATE_RULESET_VERSION)
    if abi < REQUIRED_ABI:
        _refuse(f"Landlock ABI {abi} is below the required {REQUIRED_ABI}")
    attr = _RulesetAttr(HANDLED_FS_ABI5)
    ruleset = _libc.syscall(sys_create, ctypes.byref(attr), ctypes.sizeof(attr), 0)
    if ruleset < 0:
        _refuse(f"landlock_create_ruleset: {_errno_name()}")
    try:
        for path in SYSTEM_READ_EXEC:
            _add_path_rule(sys_add, ruleset, path, READ_EXEC, required=path in ("/usr", "/opt/hermes"))
        for path in ETC_READ_ONLY + OPENSHELL_CA_READ_ONLY:
            _add_path_rule(sys_add, ruleset, path, READ_ONLY, required=False)
        for path, access in DEVICE_RULES:
            _add_path_rule(sys_add, ruleset, path, access, required=path == "/dev/null")
        _add_path_rule(sys_add, ruleset, NEMOCLAW_STATE_LIST_ONLY, READ_DIR, required=False)
        _add_path_rule(sys_add, ruleset, home, READ_ONLY, required=True)
        for sub in WRITABLE_SUBDIRS:
            _add_path_rule(sys_add, ruleset, os.path.join(home, sub), STATE_TREE, required=True)
        if _libc.prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
            _refuse(f"prctl(PR_SET_NO_NEW_PRIVS): {_errno_name()}")
        if _libc.syscall(sys_restrict, ruleset, 0) != 0:
            _refuse(f"landlock_restrict_self: {_errno_name()}")
    finally:
        os.close(ruleset)


def _bpf(code: int, jt: int, jf: int, k: int) -> bytes:
    return struct.pack("HBBI", code, jt, jf, k)


def _seccomp_program(machine: str) -> bytes:
    ld_w_abs, jeq_k, ret_k = 0x20, 0x15, 0x06
    table = METADATA_SYSCALLS[machine]
    fake = SECCOMP_RET_ERRNO | 0
    deny = SECCOMP_RET_ERRNO | errno.EPERM
    prog = [
        _bpf(ld_w_abs, 0, 0, 4),  # seccomp_data.arch
        _bpf(jeq_k, 1, 0, AUDIT_ARCH[machine]),
        _bpf(ret_k, 0, 0, SECCOMP_RET_KILL_PROCESS),
        _bpf(ld_w_abs, 0, 0, 0),  # seccomp_data.nr
    ]
    if machine == "x86_64":
        # x32 syscalls share AUDIT_ARCH_X86_64 with bit 30 set; refuse them so
        # the number checks below cannot be bypassed.
        jge_k = 0x35
        prog += [_bpf(jge_k, 0, 1, 0x40000000), _bpf(ret_k, 0, 0, SECCOMP_RET_KILL_PROCESS)]
    for nr in table["fake"]:
        prog += [_bpf(jeq_k, 0, 1, nr), _bpf(ret_k, 0, 0, fake)]
    for nr in table["deny"]:
        prog += [_bpf(jeq_k, 0, 1, nr), _bpf(ret_k, 0, 0, deny)]
    # utimensat(dirfd, path, times, flags): fake unless path (args[1]) is NULL.
    # args[1] low word at offset 24, high word at 28 (little endian).
    prog += [
        _bpf(jeq_k, 0, 5, table["utimensat"]),
        _bpf(ld_w_abs, 0, 0, 24),
        _bpf(jeq_k, 0, 2, 0),
        _bpf(ld_w_abs, 0, 0, 28),
        _bpf(jeq_k, 1, 0, 0),
        _bpf(ret_k, 0, 0, fake),
    ]
    prog.append(_bpf(ret_k, 0, 0, SECCOMP_RET_ALLOW))
    return b"".join(prog)


def _apply_seccomp(machine: str) -> None:
    program = _seccomp_program(machine)
    buffer = ctypes.create_string_buffer(program, len(program))
    fprog = _SockFprog(len(program) // 8, ctypes.cast(buffer, ctypes.c_void_p).value)
    if _libc.prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, ctypes.byref(fprog), 0, 0) != 0:
        _refuse(f"seccomp filter: {_errno_name()}")


def _validate_home(home: str) -> None:
    if not os.path.isabs(home) or os.path.realpath(home) != home:
        _refuse("HERMES_HOME must be an absolute, symlink-free path")
    st = os.lstat(home)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.geteuid():
        _refuse("HERMES_HOME must be a directory owned by the current user")
    for sub in WRITABLE_SUBDIRS:
        path = os.path.join(home, sub)
        try:
            sub_st = os.lstat(path)
        except FileNotFoundError:
            _refuse(f"writable dir missing: {path}")
        if not stat.S_ISDIR(sub_st.st_mode):
            _refuse(f"writable path is not a real directory: {path}")


def _sanitized_env(home: str, keep: list[str]) -> dict[str, str]:
    env = {name: os.environ[name] for name in ENV_ALLOWLIST if name in os.environ}
    for name in keep:
        if name in os.environ:
            env[name] = os.environ[name]
    env.update(
        {
            "PATH": FIXED_PATH,
            "HOME": home,
            "HERMES_HOME": home,
            # The patched Hermes (patch-agent-home-state-symlink.py) then takes
            # HERMES_HOME as the agent home instead of the session DB directory.
            "NEMOCLAW_HERMES_PIN_AGENT_HOME": "1",
            "TMPDIR": os.path.join(home, "tmp"),
            "PYTHONNOUSERSITE": "1",
        }
    )
    return env


def _reset_fds() -> None:
    devnull = os.open("/dev/null", os.O_RDONLY)
    os.dup2(devnull, 0)
    os.close(devnull)
    os.closerange(3, os.sysconf("SC_OPEN_MAX") if os.sysconf("SC_OPEN_MAX") > 0 else 65536)


def _parse(argv: list[str]) -> tuple[str, list[str], list[str]]:
    if len(argv) < 3:
        _refuse("usage: api-landlock-exec.py <HERMES_HOME> [--keep-env NAME]... -- <argv...>")
    home, rest, keep = argv[0], argv[1:], []
    while rest and rest[0] == "--keep-env":
        if len(rest) < 2 or not rest[1].replace("_", "").isalnum():
            _refuse("--keep-env needs an environment variable name")
        keep.append(rest[1])
        rest = rest[2:]
    if not rest or rest[0] != "--" or len(rest) < 2:
        _refuse("missing -- <argv...>")
    return home, keep, rest[1:]


def main() -> None:
    home, keep, target = _parse(sys.argv[1:])
    machine = _arch()
    _validate_home(home)
    env = _sanitized_env(home, keep)
    _reset_fds()
    os.chdir(os.path.join(home, "workspace"))
    os.umask(0o077)
    _apply_landlock(machine, home)
    _apply_seccomp(machine)
    try:
        os.execve(target[0], target, env)
    except OSError as exc:
        _refuse(f"exec {target[0]}: {exc.strerror}")


if __name__ == "__main__":
    main()
