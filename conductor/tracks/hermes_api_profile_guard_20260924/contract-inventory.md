<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Contract inventory: Hermes API profile guard

Task 1.1 record. Sources: `agents/hermes/runtime-config-guard.py`,
`agents/hermes/start.sh`, `agents/hermes/Dockerfile`, and the ClawShell caller
`app/services/sandbox_privileged_exec.py` on `hermes-profile-boundary`.

## Default-profile strict anchor

- Path: `/etc/nemoclaw/hermes.config-hash`, written at image build
  (`Dockerfile` ~1147): `sha256sum` lines for `/sandbox/.hermes/config.yaml`
  and `/sandbox/.hermes/.env`, then a
  `# nemoclaw-hermes-mcp-state-v1 intended=<mcp> applied=<mcp>` line computed
  by `build-hermes-mcp-digest.py`. Mode `root:root 0444`.
- Compatibility copy at `/sandbox/.hermes/.config-hash`, `sandbox:sandbox
  0640`. The guard's `both` mode advances compat first and the root-owned
  strict anchor last; a crash between them fails the next startup.
- `_parse_config_hash` binds each digest line to the absolute config/env
  paths it names. An anchor naming `/sandbox/.hermes/...` is malformed for
  `--hermes-dir /sandbox/.hermes/profiles/api` — the observed
  `refusing malformed Hermes config hash`.
- Anchor file validation (`_validate_regular`): regular file, no symlink,
  `nlink == 1`, not group/world-writable. **Ownership is not checked** —
  a sandbox-owned `0600` file passes. Root-control today is deployment
  convention (`/etc/nemoclaw` is root-owned), not guard enforcement.

## Restart seal and mutation lock

- State file: `/run/nemoclaw/hermes-restart-seal.json` (root-owned `/run`,
  tmpfs — per-boot). Sealed names: `config.yaml`, `.env`, `.config-hash`
  (`SEALED_FILE_NAMES`).
- Mutation lock path is derived: `dirname(state_file) +
  "/hermes-config-mutation.lock"`. Two profiles sharing `/run/nemoclaw`
  therefore share one lock — acceptable serialization, but a per-profile
  state directory is an option if independent locking is wanted.
- `seal_restart` freezes the parent path for the transaction: it records
  parent and `hermes_dir` inode metadata, `fchown`s both to the caller's
  euid (root in production) and `fchmod`s the parent to `0755` (`0700` for
  shields-mutable). It refuses set-id parent modes, immutable/append inode
  flags, symlinked children, and raced inodes.
- Durable orphan detection: a `.nemoclaw-hermes-restart-seal` marker inside
  the sealed dir plus root ownership of the `/sandbox` parent let the next
  container detect an interrupted seal even after `/run` is lost.
- `unseal_restart` restores recorded metadata; `config-write` phases route
  through `_recover_config_write_transaction` first.

## Ownership layout (image build)

| Path | Owner | Mode | Survives |
|---|---|---|---|
| `/sandbox/.hermes` | `sandbox:sandbox` | `3770` (setgid+sticky) | restart, rebuild |
| `/sandbox/.hermes/profiles` | `sandbox:sandbox` | `0770` | restart, rebuild |
| `/sandbox/.hermes/profiles/dashboard-home` | `sandbox:sandbox` | `0770` | restart, rebuild |
| `/etc/nemoclaw/` | `root:root` | `0755` | restart; lost on recreate |
| `/run/nemoclaw/` | `root:root` | `0711` | nothing (tmpfs) |
| `/sandbox/.nemoclaw` | `root:root` | `1755` sticky | restart, rebuild (on `/sandbox`) |
| `/sandbox/.nemoclaw/blueprints` | `root:root` | `0755` | restart, rebuild |

The image already uses the root-owned-sticky-parent pattern:
`/sandbox/.nemoclaw` is `root:root 1755` with named sandbox-writable
children. The locked-root posture for shields uses `root:sandbox 3770` —
the sticky bit lets the group write while only entry owners can rename or
delete. Both precedents apply to protecting `profiles/api` and its parent.

## Startup and action gating

- Container `ENTRYPOINT` is `nemoclaw-start`; under OpenShell, PID 1 is the
  `openshell-sandbox` supervisor, which launches `nemoclaw-start` as a
  supervised non-root process (`_openshell_supervised_nonroot_start_is_live`).
- Readiness lease: `/run/nemoclaw/hermes-startup-ready`, `root:root 0600`,
  `v2 <pid1 start-time> <pid namespace inode>`; published by
  `publish_startup_ready`, verified live against `/proc`.
- `_validate_action_readiness` splits actions:
  - startup actions (`ensure-api-key`, `refresh-hashes`,
    `inspect-mcp-integrity`, `commit-mcp-applied`, `provider-placeholders`,
    `publish-startup-ready`, `recover-prestate-lock`) — PID 1 startup
    transaction or the supervised non-root path only.
  - host actions (`seal-restart`, `write-config`, shields transitions,
    `run-state-dir-transition`, `inspect-mutation-owner`,
    `unseal-restart`) — require the startup-ready lease, or a demonstrably
    non-root PID 1 (the macOS VM path cannot run root transactions).
- Installed-at-`/usr/local/lib/nemoclaw` is enforced
  (`INSTALLED_RUNTIME_CONFIG_GUARD`); local source fixtures retain a
  compatibility path for tests.
- The entrypoint seals restart inputs before launch and unseals on exit via
  traps (`seal_hermes_restart_inputs` / `unseal_hermes_restart_inputs` in
  `start.sh` ~2211).

## Caller contract (ClawShell, current)

- `docker|podman exec --user root --interactive <container> python3 -I
  /usr/local/lib/nemoclaw/hermes-runtime-config-guard.py write-config
  --hermes-dir /sandbox/.hermes/profiles/api --hash-file
  /etc/nemoclaw/hermes.config-hash --state-file
  /run/nemoclaw/hermes-restart-seal.json --expected-config-sha256 <hex>`;
  replacement config bytes on stdin. Container identity is bound by
  `openshell.ai/sandbox-name` + `openshell.ai/sandbox-id` labels plus a
  managed marker.
- Failure observed 2026-09-24: the passed anchor names default paths, so
  `_parse_config_hash` rejects it — correct fail-closed behavior. The fix is
  not "pass the profile's sandbox-owned `.config-hash`" (untrusted) but a
  root-owned api anchor plus a profile-scoped transaction.

## Backend assumptions to probe (Task 1.4)

- Docker/Podman driver path: `docker exec --user root` already works — the
  observed `[SECURITY]` refusal reached the caller through it.
- `NEMOCLAW_DARWIN_VM_COMPAT=1` builds `chmod -R a+rwX /sandbox/.hermes`,
  and the macOS VM backend remaps rootfs ownership to the host uid — probe
  whether uid-0 ownership and sticky-parent protection are meaningful there.
  `/sandbox/.nemoclaw` itself is **not** in that compat chmod list.
- Probe what runtime state Hermes writes inside a profile directory
  (sessions, logs, runtime, cache) so the root-owned `api` dir can pre-create
  sandbox-writable children.
- Decide: api seal state shares the `/run/nemoclaw` mutation lock, or a
  dedicated `/run/nemoclaw/api/` directory.
