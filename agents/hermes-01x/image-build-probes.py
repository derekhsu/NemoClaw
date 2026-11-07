# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

"""Builder-independent assertions for the managed Hermes image."""

from __future__ import annotations

import sys
from collections.abc import Callable
from pathlib import Path

sys.path.insert(0, "/usr/local/lib/nemoclaw")


def _verify_profile_config_policy(config: dict, expected: dict[str, object]) -> None:
    from managed_policy import policy_value

    for path, value in expected.items():
        # Hermes v0.21.3 ignores session_reset: gateway sessions never reset by
        # time, so config-less profiles carry no value to compare.
        if path.startswith("session_reset."):
            continue
        actual = policy_value(config, path)
        assert actual == value, (path, actual, value)


def verify_profile_policy() -> None:
    from types import SimpleNamespace

    from cli import CLI_CONFIG
    from hermes_cli import config as hermes_config
    from hermes_cli.config import load_config_readonly
    from hermes_cli.update_cmd_maint import _resolve_pre_update_backup_mode
    from managed_policy import load_managed_policy, profile_default_values
    from tools.browser_tool_eval_policy import (
        _allow_unsafe_browser_evaluate,
        _restrict_browser_evaluate,
    )
    from tui_gateway.server import _load_show_reasoning

    policy = load_managed_policy()
    expected = profile_default_values(policy)
    config = load_config_readonly()
    _verify_profile_config_policy(config, expected)
    assert CLI_CONFIG["display"]["show_reasoning"] == expected["display.show_reasoning"]
    assert _allow_unsafe_browser_evaluate() == expected["browser.allow_unsafe_evaluate"]
    assert _restrict_browser_evaluate() == expected["browser.restrict_evaluate"]
    assert _load_show_reasoning() == expected["display.show_reasoning"]
    original_load_config = hermes_config.load_config
    try:

        def fail_config_load():
            raise RuntimeError("nemoclaw build probe")

        hermes_config.load_config = fail_config_load
        args = SimpleNamespace(no_backup=False, backup=False)
        expected_backup_mode = (
            "off"
            if expected["updates.pre_update_backup"] is False
            else str(expected["updates.pre_update_backup"])
        )
        assert _resolve_pre_update_backup_mode(args) == expected_backup_mode
    finally:
        hermes_config.load_config = original_load_config


def verify_gateway_runtime_metadata() -> None:
    from gateway.status import (
        _get_gateway_lock_path,
        _get_pid_path,
        _get_process_hermes_home,
        _get_runtime_status_path,
    )

    home = _get_process_hermes_home()
    runtime = home / "runtime"
    assert _get_pid_path() == runtime / "gateway.pid"
    assert _get_gateway_lock_path() == runtime / "gateway.lock"
    assert _get_runtime_status_path() == runtime / "gateway_state.json"
    assert all(
        path.parent == runtime
        for path in (
            _get_pid_path(),
            _get_gateway_lock_path(),
            _get_runtime_status_path(),
        )
    )
    assert isinstance(home, Path)


def verify_gateway_process_identity() -> None:
    from gateway.status import (
        _gateway_command_subcommand,
        looks_like_gateway_command_line,
        looks_like_gateway_runtime_command_line,
    )

    renamed = "/opt/hermes/.venv/bin/python /usr/local/bin/hermes.real gateway run"
    upstream = "/opt/hermes/.venv/bin/python /usr/local/bin/hermes gateway run"

    assert looks_like_gateway_command_line(renamed)
    assert looks_like_gateway_runtime_command_line(renamed)
    assert _gateway_command_subcommand(renamed) == "run"
    assert _gateway_command_subcommand(
        "/opt/hermes/.venv/bin/python /usr/local/bin/hermes.real gateway restart"
    ) == "restart"

    assert looks_like_gateway_command_line(upstream)
    assert not looks_like_gateway_command_line(
        "/opt/hermes/.venv/bin/python /usr/local/bin/hermes.real gateway status"
    )
    assert not looks_like_gateway_command_line(
        "/opt/hermes/.venv/bin/python /usr/local/bin/hermes.real dashboard"
    )
    assert not looks_like_gateway_command_line("python -m tui_gateway run")
    assert not looks_like_gateway_command_line(
        "/opt/hermes/.venv/bin/python /usr/local/bin/hermes.realish gateway run"
    )


def verify_neutral_platform_inertness() -> None:
    import socket

    from gateway.config import Platform, load_gateway_config

    original_connect = socket.socket.connect
    original_create_connection = socket.create_connection

    def reject_network(*_args, **_kwargs):
        raise AssertionError("neutral Hermes configuration attempted a network connection")

    socket.socket.connect = reject_network
    socket.create_connection = reject_network
    try:
        config = load_gateway_config()
    finally:
        socket.socket.connect = original_connect
        socket.create_connection = original_create_connection
    bundled_plugins = {
        manifest.parent.name
        for manifest in Path("/opt/hermes/plugins/platforms").glob("*/plugin.yaml")
    }
    built_in_optional = {
        platform.value
        for platform in Platform
        if platform.value not in {"api_server", "local"}
    }
    expected = bundled_plugins | built_in_optional
    assert "google_chat" in expected, expected
    assert "whatsapp_cloud" in expected, expected

    for name in expected:
        platform = Platform(name)
        platform_config = config.platforms.get(platform)
        assert platform_config is not None, name
        assert platform_config.enabled is False, (name, platform_config)
        assert platform_config.token is None, (name, platform_config.token)
        assert platform_config.api_key is None, (name, platform_config.api_key)
        assert platform_config.extra == {}, (name, platform_config.extra)


def verify_cron_runtime_source() -> None:
    import cron.executions
    import cron.incidents
    from hermes_cli.backup import _QUICK_STATE_FILES
    from hermes_constants import get_hermes_home

    expected = get_hermes_home().resolve() / "runtime" / "cron-executions.db"
    # Hermes v2026.9.14 keeps EXECUTIONS_FILE as an optional override and
    # resolves the production path lazily so a dashboard-entered profile cannot
    # leak executions into the import-time home. Prove the lazy resolution —
    # in executions._connect and the shared incidents._db_path — lands under
    # runtime/cron-executions.db rather than asserting the override constant.
    assert cron.executions.EXECUTIONS_FILE is None
    conn = cron.executions._connect()
    try:
        assert expected.exists(), expected
    finally:
        conn.close()
    assert cron.incidents._db_path() == expected
    assert "runtime/cron-executions.db" in _QUICK_STATE_FILES
    assert "cron/executions.db" not in _QUICK_STATE_FILES


def verify_session_preview() -> None:
    from hermes_state import SessionDB

    db = SessionDB()
    session_id = "nemoclaw-preview-smoke"
    db.create_session(session_id, "cli")
    db.append_message(session_id, "user", "NEMOCLAW_PREVIEW_FIRST")
    db.append_message(session_id, "assistant", "ack")
    db.append_message(session_id, "user", "NEMOCLAW_PREVIEW_LATEST")
    rows = db.list_sessions_rich(limit=1)
    assert rows and rows[0]["id"] == session_id, rows
    assert rows[0]["preview"] == "NEMOCLAW_PREVIEW_LATEST", rows


def verify_session_delete() -> None:
    from hermes_state import SessionDB

    db = SessionDB()
    # The source patch and the managed policy both select SQLite memory mode.
    temp_store = db._conn.execute("PRAGMA temp_store").fetchone()
    assert temp_store is not None and tuple(temp_store)[0] == 2, temp_store
    session_id = "nemoclaw-session-delete-smoke"
    db.create_session(session_id, "cli")
    db.append_message(session_id, "user", "probe message 1")
    db.append_message(session_id, "assistant", "probe reply")
    deleted = db.delete_session(session_id)
    assert deleted, f"delete_session returned {deleted!r}"
    rows = db.list_sessions_rich(limit=10)
    assert not any(r["id"] == session_id for r in rows), "session still present after delete"


def verify_mcp_http_proxy() -> None:
    import os

    from tools import mcp_tool_transport as transport

    source = Path(transport.__file__).read_text(encoding="utf-8")
    assert source.count("**_nemoclaw_env_proxy(url))") == 2, "MCP HTTP transports lack the proxy"
    names = ("http_proxy", "https_proxy", "all_proxy", "no_proxy")
    saved = {name: os.environ.get(name) for variant in names for name in (variant, variant.upper())}
    try:
        for name in saved:
            os.environ.pop(name, None)
        assert transport._nemoclaw_env_proxy("https://gateway.example/mcp/") == {}
        os.environ["https_proxy"] = "http://10.200.0.1:3128"
        os.environ["no_proxy"] = "localhost,127.0.0.1"
        proxied = transport._nemoclaw_env_proxy("https://gateway.example/mcp/")
        assert proxied == {"proxy": "http://10.200.0.1:3128"}, proxied
        assert transport._nemoclaw_env_proxy("http://127.0.0.1:8642/mcp") == {}
    finally:
        for name, value in saved.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


def verify_discord_recovery_source() -> None:
    source = Path("/opt/hermes/plugins/platforms/discord/recovery.py").read_text(
        encoding="utf-8"
    )
    assert source.count('_DB_FILENAME = "discord_message_recovery.db"') == 1
    assert source.count('directory = self._hermes_home / "gateway"') == 1
    assert source.count("os.chmod(path, 0o600)") == 0
    assert source.count("os.chmod(path, 0o660)") == 1


def verify_langfuse_credentials() -> None:
    import importlib.util

    path = "/opt/hermes/plugins/observability/langfuse/__init__.py"
    spec = importlib.util.spec_from_file_location("nemoclaw_langfuse_contract", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    validate = module._validate_langfuse_key
    assert validate("HERMES_LANGFUSE_PUBLIC_KEY", "pk-lf-public") is None
    assert validate("HERMES_LANGFUSE_SECRET_KEY", "sk-lf-secret") is None
    assert (
        validate(
            "HERMES_LANGFUSE_PUBLIC_KEY",
            "openshell:resolve:env:LANGFUSE_PUBLIC_KEY",
        )
        is None
    )
    assert (
        validate(
            "HERMES_LANGFUSE_SECRET_KEY",
            "openshell:resolve:env:v1_LANGFUSE_SECRET_KEY",
        )
        is None
    )
    assert (
        validate(
            "HERMES_LANGFUSE_PUBLIC_KEY",
            "openshell:resolve:env:LANGFUSE_SECRET_KEY",
        )
        is not None
    )
    assert (
        validate(
            "HERMES_LANGFUSE_SECRET_KEY",
            "openshell:resolve:env:v1_LANGFUSE_PUBLIC_KEY",
        )
        is not None
    )


def verify_dashboard_policy(path: Path) -> None:
    import yaml
    from managed_policy import load_managed_policy, policy_value

    config = yaml.safe_load(path.read_text(encoding="utf-8"))
    policy = load_managed_policy()
    for dotted_path in policy["managed_paths"]:
        expected = policy_value(policy["config"], dotted_path)
        actual = policy_value(config, dotted_path)
        assert actual == expected, (dotted_path, actual, expected)
    path.unlink()


def verify_cron_create() -> None:
    from cron.executions import create_execution

    created = create_execution(
        "nemoclaw-cross-uid-create-probe",
        source="nemoclaw-image-build",
    )
    assert created["job_id"] == "nemoclaw-cross-uid-create-probe"
    assert created["status"] == "claimed"


def verify_cron_backup() -> None:
    import os
    import sqlite3
    import stat
    import subprocess

    path = Path("/sandbox/.hermes/runtime/cron-executions.db")
    staged = path.with_name(".nemoclaw-cron-executions-staged")
    staged.unlink(missing_ok=True)
    source = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30)
    target = sqlite3.connect(staged, timeout=30)
    try:
        assert source.execute(
            "SELECT job_id, status FROM executions"
        ).fetchone() == ("nemoclaw-cross-uid-create-probe", "claimed")
        source.backup(target)
        assert target.execute("PRAGMA quick_check").fetchone() == ("ok",)
    finally:
        target.close()
        source.close()
    # The gateway belongs to the sandbox group and must reopen this replacement ledger for writing.
    subprocess.run(["chmod", "0660", "--", str(staged)], check=True)
    assert stat.S_IMODE(staged.stat().st_mode) == 0o660
    os.replace(staged, path)
    for suffix in ("-wal", "-shm"):
        path.with_name(f"{path.name}{suffix}").unlink(missing_ok=True)


def verify_cron_reopen() -> None:
    from cron.executions import create_execution, list_executions

    created = create_execution(
        "nemoclaw-cross-uid-reopen-probe",
        source="nemoclaw-image-build",
    )
    assert created["job_id"] == "nemoclaw-cross-uid-reopen-probe"
    assert {row["job_id"] for row in list_executions(limit=10)} == {
        "nemoclaw-cross-uid-create-probe",
        "nemoclaw-cross-uid-reopen-probe",
    }


def verify_discord_create() -> None:
    from plugins.platforms.discord.recovery import DiscordRecoveryStore

    store = DiscordRecoveryStore(Path("/sandbox/.hermes"))

    def create_probe(conn):
        conn.execute(
            "CREATE TABLE IF NOT EXISTS nemoclaw_identity_probe "
            "(value TEXT NOT NULL)"
        )
        conn.execute("DELETE FROM nemoclaw_identity_probe")
        conn.execute(
            "INSERT INTO nemoclaw_identity_probe(value) VALUES (?)",
            ("gateway-created",),
        )
        return True

    assert store.call(create_probe, default=False) is True


def verify_discord_backup() -> None:
    import os
    import sqlite3
    import stat
    import subprocess

    path = Path("/sandbox/.hermes/gateway/discord_message_recovery.db")
    staged = path.with_name(".nemoclaw-discord-recovery-staged")
    staged.unlink(missing_ok=True)
    source = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30)
    target = sqlite3.connect(staged, timeout=30)
    try:
        assert source.execute(
            "SELECT value FROM nemoclaw_identity_probe"
        ).fetchone() == ("gateway-created",)
        source.backup(target)
        assert target.execute("PRAGMA quick_check").fetchone() == ("ok",)
    finally:
        target.close()
        source.close()
    # The gateway belongs to the sandbox group and must reopen this replacement ledger for writing.
    subprocess.run(["chmod", "0660", "--", str(staged)], check=True)
    assert stat.S_IMODE(staged.stat().st_mode) == 0o660
    os.replace(staged, path)


def verify_discord_reopen() -> None:
    from plugins.platforms.discord.recovery import DiscordRecoveryStore

    store = DiscordRecoveryStore(Path("/sandbox/.hermes"))

    def reopen_probe(conn):
        conn.execute(
            "UPDATE nemoclaw_identity_probe SET value = ?",
            ("gateway-reopened",),
        )
        return conn.execute(
            "SELECT value FROM nemoclaw_identity_probe"
        ).fetchone()

    assert store.call(reopen_probe) == ("gateway-reopened",)


RUNTIME_CONFIG_GUARD = "/usr/local/lib/nemoclaw/hermes-runtime-config-guard.py"
CAP_DAC_OVERRIDE = 1
CAP_FSETID = 4


def _effective_capabilities() -> int:
    for line in Path("/proc/self/status").read_text(encoding="utf-8").splitlines():
        if line.startswith("CapEff:"):
            return int(line.split()[1], 16)
    raise AssertionError("CapEff is missing from /proc/self/status")


def _load_runtime_config_guard():
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "nemoclaw_runtime_config_guard_probe", RUNTIME_CONFIG_GUARD
    )
    assert spec is not None and spec.loader is not None
    guard = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = guard
    spec.loader.exec_module(guard)
    return guard


def _metadata(path: str) -> tuple[int, int, int]:
    import os
    import stat

    st = os.lstat(path)
    return st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode)


def _apply_metadata(target: str, source: str) -> None:
    import os

    uid, gid, mode = _metadata(source)
    os.chown(target, uid, gid)
    # chown can clear set-id bits, so chmod follows it.
    os.chmod(target, mode)


def verify_guard_without_dac_override() -> None:
    """Prove root guard writes need neither CAP_DAC_OVERRIDE nor CAP_FSETID.

    OpenShell 0.0.92 with podman drops both capabilities from every sandbox,
    so ClawShell's root exec of the guard is held to ordinary permission bits
    (NemoClaw #21). Run the api profile bootstrap, its retry, normalize,
    write-config and verify, plus a default-profile write-config against a
    copy of /sandbox/.hermes, in a process without both capabilities. Then
    remove every artifact so first boot still seals a fresh api profile.
    """
    import contextlib
    import hashlib
    import io
    import os
    import shutil
    import tempfile

    assert os.geteuid() == 0 and os.getegid() == 0
    caps = _effective_capabilities()
    dropped = (1 << CAP_DAC_OVERRIDE) | (1 << CAP_FSETID)
    assert not caps & dropped, f"probe must run without DAC_OVERRIDE/FSETID: {caps:#x}"

    guard = _load_runtime_config_guard()
    # main() joins these groups before dispatching any action.
    guard._join_managed_runtime_groups()
    api_dir = guard.HERMES_API_PROFILE_DIR
    profiles_dir = os.path.dirname(api_dir)
    api_root = os.path.dirname(profiles_dir)
    sealed_artifacts = (api_dir, guard.HERMES_API_ANCHOR_FILE, guard.HERMES_API_RECORD_FILE)
    for path in sealed_artifacts:
        assert not os.path.lexists(path), path
    chain = {path: _metadata(path) for path in (api_root, profiles_dir)}
    assert set(chain.values()) == {(0, 0, 0o711)}, chain

    scratch = tempfile.mkdtemp(prefix="nemoclaw-guard-probe-")
    try:
        guard.HERMES_API_STATE_FILE = os.path.join(scratch, "hermes-api-restart-seal.json")
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            guard.bootstrap_api_profile()
            guard.bootstrap_api_profile()
            guard.normalize_api_profile()
            config = Path(api_dir, "config.yaml").read_bytes()
            guard.write_api_config_transaction(hashlib.sha256(config).hexdigest(), config)
            guard.verify_api_profile()
        assert output.getvalue().split() == [
            "bootstrapped=1",
            "verified=1",
            "normalized=1",
            "verified=1",
        ], output.getvalue()
        assert not os.path.lexists(guard.HERMES_API_STATE_FILE)

        # Default profile: seal, replace, and restore /sandbox/.hermes
        # metadata on a copy, so the image's own sealed files stay untouched.
        sandbox_copy = os.path.join(scratch, "sandbox")
        hermes_copy = os.path.join(sandbox_copy, ".hermes")
        os.mkdir(sandbox_copy, 0o700)
        os.mkdir(hermes_copy, 0o700)
        for name in ("config.yaml", ".env"):
            target = os.path.join(hermes_copy, name)
            shutil.copyfile(f"/sandbox/.hermes/{name}", target, follow_symlinks=False)
            _apply_metadata(target, f"/sandbox/.hermes/{name}")
        strict_text = Path("/etc/nemoclaw/hermes.config-hash").read_text(encoding="utf-8")
        copied_text = strict_text.replace("  /sandbox/.hermes/", f"  {hermes_copy}/")
        assert copied_text != strict_text
        hash_copy = os.path.join(scratch, "hermes.config-hash")
        for target, source in (
            (hash_copy, "/etc/nemoclaw/hermes.config-hash"),
            (os.path.join(hermes_copy, ".config-hash"), "/sandbox/.hermes/.config-hash"),
        ):
            Path(target).write_text(copied_text, encoding="utf-8")
            _apply_metadata(target, source)
        _apply_metadata(hermes_copy, "/sandbox/.hermes")
        _apply_metadata(sandbox_copy, "/sandbox")
        before = {
            path: _metadata(path)
            for path in (
                sandbox_copy,
                hermes_copy,
                *(os.path.join(hermes_copy, name) for name in guard.SEALED_FILE_NAMES),
            )
        }
        assert before[hermes_copy] == _metadata("/sandbox/.hermes"), before
        assert before[sandbox_copy] == _metadata("/sandbox"), before
        state_dir = os.path.join(scratch, "run")
        os.mkdir(state_dir, 0o700)
        state_file = os.path.join(state_dir, "hermes-restart-seal.json")
        config = Path(hermes_copy, "config.yaml").read_bytes()
        guard.write_config_transaction(
            hermes_copy, hash_copy, state_file, hashlib.sha256(config).hexdigest(), config
        )
        after = {path: _metadata(path) for path in before}
        assert after == before, (before, after)
        assert not os.path.lexists(state_file)
        assert not os.path.lexists(
            os.path.join(hermes_copy, guard.RESTART_ORPHAN_MARKER_NAME)
        )
    finally:
        # The copies end up sandbox-owned; hand them back to root to remove them.
        for current, dirs, files in os.walk(scratch):
            for name in (*dirs, *files):
                os.chown(os.path.join(current, name), 0, 0, follow_symlinks=False)
        shutil.rmtree(scratch)
        if os.path.isdir(api_dir):
            shutil.rmtree(api_dir)
        for path in sealed_artifacts[1:]:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(path)
    for path in sealed_artifacts:
        assert not os.path.lexists(path), path
    assert {path: _metadata(path) for path in chain} == chain


COMMANDS: dict[str, Callable[[], None]] = {
    "cron-backup": verify_cron_backup,
    "cron-create": verify_cron_create,
    "cron-reopen": verify_cron_reopen,
    "cron-runtime-source": verify_cron_runtime_source,
    "discord-backup": verify_discord_backup,
    "discord-create": verify_discord_create,
    "discord-recovery-source": verify_discord_recovery_source,
    "discord-reopen": verify_discord_reopen,
    "gateway-process-identity": verify_gateway_process_identity,
    "gateway-runtime-metadata": verify_gateway_runtime_metadata,
    "guard-without-dac-override": verify_guard_without_dac_override,
    "langfuse-credentials": verify_langfuse_credentials,
    "mcp-http-proxy": verify_mcp_http_proxy,
    "neutral-platform-inertness": verify_neutral_platform_inertness,
    "profile-policy": verify_profile_policy,
    "session-delete": verify_session_delete,
    "session-preview": verify_session_preview,
}


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[1] == "dashboard-policy":
        verify_dashboard_policy(Path(argv[2]))
        return 0
    if len(argv) != 2 or argv[1] not in COMMANDS:
        commands = ", ".join(sorted([*COMMANDS, "dashboard-policy"]))
        raise SystemExit(f"usage: {Path(argv[0]).name} <command> [path]\ncommands: {commands}")
    COMMANDS[argv[1]]()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
