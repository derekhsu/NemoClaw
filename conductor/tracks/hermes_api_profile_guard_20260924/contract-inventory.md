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
| `/run/nemoclaw/` | `root:root` | `0755` | nothing (tmpfs) |
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

## Parent-path protection decision (Task 1.4)

Probed on the published image `sha256:ea54c5ff…` (docker driver, overlayfs;
`sandbox` is uid 998 / gid 999; `su`/`runuser` present).

### Findings

- `chattr +i` is unavailable — `cap_linux_immutable` is not in the
  container's bounding set. File immutability is not a mechanism.
- A root-owned file inside a sandbox-writable directory can be unlinked and
  replaced — file ownership alone is not enough.
- A `root:sandbox 1770` (sticky, group-writable) directory gives exactly the
  required split: the sandbox group can create its runtime files and unlink
  its own entries, but cannot edit, unlink, or rename root-owned sealed
  files. `/sandbox/.hermes` already uses `sandbox:sandbox 3770`; the api
  profile flips the owner to root.
- A `root:sandbox 0750` `profiles/` directory lets the sandbox group
  traverse and read profile homes but not create, rename, or delete profile
  directories. Runtime `hermes profile create/delete/rename` as the sandbox
  user is blocked — intended: the image contract fixes the profile set
  (default, `api`, `dashboard-home`).
- Hermes treats `profiles/<name>` as that profile's `HERMES_HOME` — the api
  runtime writes `state.db`, `sessions/`, and similar at the profile root,
  so `profiles/api` itself must stay group-writable (hence sticky).
- `/sandbox/.hermes` must remain `sandbox:sandbox` — the default profile's
  gateway writes `state.db`, `gateway.lock`, `sessions/`, `logs/` there.
  A sandbox user can still swap `profiles` beneath it on a writable backend;
  on overlayfs an image-layer directory rename returns EXDEV and `mv`'s
  copy fallback cannot displace root-owned contents. Either way the
  ownership+digest checks below detect a forged replacement.
- The existing state-lock plan (`/usr/local/share/nemoclaw/
  state-lock-plan.json`) already lists `profiles` under `readOnlyRoots` with
  `profiles/dashboard-home` as the writable carve-out — root-owning
  `profiles` is consistent with the established shields-lock model. Phase 2
  must decide whether `profiles/api` needs a `writableSubpaths` entry so
  the api runtime can keep state during locked shields transitions.

### Decision (revised 2026-09-24 — three-uid model)

The operator's requirement: api config/env are modifiable by the default
side but never by api-server-driven operations — which may include a
terminal tool. Same-uid tool contexts make that boundary impossible at the
FS or policy layer, so the api profile gets its own uid and process.

Actors: `root` (guard only), `sandbox` uid 998 (default side — operator
tools; owns and fully manages api profile contents), `gateway` uid 999
(main gateway: default + dashboard-home profiles, unchanged),
`hermesapi` uid 997 (new user; dedicated api-profile gateway process).

- `profiles/` → `sandbox:sandbox 0771`: 998 keeps profile management;
  997 traverses (other-x) but cannot list or create.
- `profiles/api/` → `sandbox:api 3770` (sticky+setgid): 998 is dir owner —
  full control including atomic-replace edits; 997 creates/manages only its
  own runtime files and cannot unlink or rename files it does not own.
- `config.yaml`, `.env` → `sandbox:api 0640`: 998 writes (the
  operator-modifiable surface); 997 reads (its own config and key);
  999 has no access (api is a separate process — the main gateway never
  reads it).
- `.clawshell-tool-policy.json`, `.config-hash` → `root:api 0440`:
  997/998 read; only the root guard writes. The policy is the enforcement
  keystone and stays root-sealed.
- Runtime files (`state.db`, `sessions/`, uploads) are created by 997
  inside the profile dir; setgid keeps them group-`api`.
- `.hermes` stays `sandbox:sandbox 3770` — 997 is not in the `sandbox`
  group and cannot even traverse the default profile home.
- Persistent api anchor + bootstrap record live under root-owned sticky
  `/sandbox/.nemoclaw/` (`hermes-api.config-hash`,
  `hermes-api-profile.json`) — anchor and profile share `/sandbox`'s
  lifecycle. The anchor pins the fixed policy digest and the structural
  contract (ownership, modes, path identity); `config.yaml`/`.env` content
  digests are not pinned because operator edits are legitimate.
- Ephemeral api seal state uses `/run/nemoclaw/hermes-api-restart-seal.json`
  and deliberately shares the `/run/nemoclaw` mutation lock with the
  default profile — one restart domain, so config mutations serialize.
- Detection remains mandatory: every api transaction and startup verifies
  the uid/mode matrix on `profiles`, `api`, and each managed file plus the
  policy digest against the anchor. A forged or re-owned copy always fails
  the check — no sandbox uid has `cap_chown`.
- `NEMOCLAW_DARWIN_VM_COMPAT` / macOS ownership remap collapses the uid
  distinction, so prevention cannot be assumed there; the ownership
  verification still runs and fails closed. The boundary guarantee is
  scoped to the container-runtime backend — matches the spec's
  detect-and-refuse clause.
- The existing state-lock plan lists `profiles` under `readOnlyRoots` with
  `profiles/dashboard-home` writable. Phase 2 decides whether
  `profiles/api` needs a `writableSubpaths` carve-out so the 997 runtime
  keeps state writes during locked shields transitions.

**Superseded**: the earlier single-uid decision (`profiles/` root-owned,
sealed files `root:sandbox 0640`) predates the operator requirement that
the default side can modify api config; it is recorded in git history.

## Dedicated-process spike (published image ea54c5ff, 2026-09-24)

Verified live inside the published image:

- `HERMES_HOME=<root>/profiles/api hermes gateway run` under a stepped-down
  uid serves the profile standalone: `/health` → 200, `/v1/models` without
  key → 401, with the home's `API_SERVER_KEY` → 200.
- The same process natively answers the `/p/api/` prefix:
  `profile_matches_home("api")` resolves `get_profile_dir("api")` to
  `<root>/profiles/api` == `HERMES_HOME` (the `profiles/<name>` parent rule
  in `get_default_hermes_root`). Verified: `/p/api/health` → 200,
  `/p/api/v1/models` + key → 200, `/p/other/*` → 404 (fails closed).
- A minimal standalone home needs only `config.yaml` + `.env`; Hermes
  creates runtime state under `HERMES_HOME` itself.
- The api profile's `config.yaml` must carry
  `platforms.api_server.enabled: true` with a fixed internal port — the
  inverse of the multiplexed model, where ClawShell pins
  `api_server.enabled: false` because the main gateway owns the listener.
  This is a Phase 3 caller-contract change: the image bootstrap and the
  ClawShell config template must both emit the enabled, fixed-port form.
- Public-port split: `socat` is a TCP forwarder and cannot split by path.
  No proxy binary ships in the image; `aiohttp` 3.14.3 is already in the
  hermes venv, so a small supervised prefix proxy (`/p/api/*` → api port,
  everything else → main gateway port, prefix preserved, streaming
  responses) is the front layer.
- Defense in depth for free: `profiles/api/` owned `sandbox:api` is not
  traversable by the main-gateway uid (not in group `api`), so the main
  gateway cannot multiplex the api profile even if `multiplex_profiles`
  is enabled by operator config — `profiles_to_serve` cannot read the
  home.
- Step-down reuses the existing pattern:
  `setpriv --reuid=hermesapi --regid=api --init-groups` with the same
  bounding-set drop the gateway prefix uses.
