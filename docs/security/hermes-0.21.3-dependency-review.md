<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Hermes 0.21.3 dependency and compatibility review

Review date: 2026-10-30

## Decision

Pin the NemoClaw Hermes runtime to the published, non-draft, non-prerelease `v2026.9.14` release, whose package version is `0.21.3`.
This replaces `v2026.8.27` (`0.20.6`), covers all four adjacent stable release ranges, and matches the Hermes release that upstream NemoClaw pins (NVIDIA/NemoClaw#11817).
Later upstream Hermes releases (`v2026.9.21`, `v2026.9.24`, and the `v0.22.x` line) are outside this review.

This fork keeps its own Hermes integration layer.
The upgrade retargets the fork's patches to the 0.21.3 source and selectively adopts upstream NemoClaw's 0.21.3 compatibility changes; it does not replace the fork's `agents/hermes` tree with upstream.
NemoClaw continues to preserve manual command approval, the fail-closed browser evaluation denylist, the complete outgoing session-reset policy, hidden reasoning and commentary channels, disabled in-place update side effects, and its managed curator retention, and now emits configuration schema 44.

The selected Python graph is hardened before installation with a reviewed, exact-source patch that updates the published dependency metadata and frozen lock together.
Hermes 0.21.3 natively carries the reviewed `aiohttp==3.14.3`, `cryptography==50.0.0`, `mcp==2.0.0`, `Pillow==12.3.0`, `starlette==1.3.1`, `tornado==6.5.8`, and `python-multipart==0.0.32` selections.
The patch still floors the two remaining deltas: `httpx2==2.12.0` plus its exact `httpcore2==2.12.0` transitive in the dev, mcp, and computer-use extras, and `alibabacloud-dingtalk==2.2.54` in the dingtalk extra.
It also carries upstream NemoClaw's four 0.21.3 source compatibility fixes: the exact `agent-browser@0.26.0` NPX fallback, the exact Hindsight lazy-install pin, one-shot completion waits scoped to the turn's task, and the cron tick lock in writable runtime state.
The base image build runs `uv pip check` and separately checks the installed versions.
The base image also keeps the hash-verified `python-multipart==0.0.32` install as a build-time re-assertion of the reviewed wheel and sdist digests.
The base image builds on the digest-pinned `node:24.22.1-trixie-slim` image and installs exact uv `0.11.33`; build-time assertions reject version drift before Hermes is installed.

## Reviewed identities

| Identity | Value |
| --- | --- |
| Current release | `v2026.8.27` / `0.20.6` |
| Current source commit | `5fc308a70719a83cccdbba4c0e39c23f5a8239d5` |
| Target release | `v2026.9.14` / `0.21.3` |
| Target annotated tag object | `7a963716b81be13ba513d4f127633b7da493aff2` |
| Target source commit | `345cd2b057a452236de401d3534b8502a7465e8d` |
| Target source archive SHA-256 | `47df72ebd3f9c96d806a94541163f7fe7d7ce5b84f85c1d3787e6dfeea1d7834` |
| Target npm cross-check integrity | `sha512-LvPt2/1z6hm4pTRJu34F6uAkBVSlSt94QeZp8fMBLFqASU9/wv7iMODSGMzF1WmrpNENXYGMnWN8s9hi/EUM5Q==` |
| Target npm tarball SHA-1 | `fae082e1f76fff3b1959940d9e9cdc1033c89d5f` |
| Target Node.js release | `24.22.1` |
| Target uv release | `0.11.33` |
| Target publish date | `2026-09-14` |

The authoritative source release is `NousResearch/hermes-agent` tag `v2026.9.14`.
The tag reference resolves to annotated tag object `7a963716b81be13ba513d4f127633b7da493aff2`, which peels to source commit `345cd2b057a452236de401d3534b8502a7465e8d`.
The GitHub release `Hermes Agent v0.21.3 (v2026.9.14)` is published, non-draft, and non-prerelease at `2026-09-14T16:04:14Z`.
NemoClaw builds from the SHA-256-pinned GitHub source archive rather than installing registry artifacts.
The `hermes-agent@0.21.3` npm package is only an independent registry-integrity cross-check.

## Complete source range ledger

| Adjacent range | Commits | Changed files | NemoClaw-relevant result |
| --- | ---: | ---: | --- |
| `v2026.8.27` (`5fc308a70`) to `v2026.8.31` (`29112bef0`) | 911 | 1,895 | Gateway lifecycle and platform increments. |
| `v2026.8.31` (`29112bef0`) to `v2026.9.7` (`2237be355`) | 5,995 | 4,364 | Second decomposition wave: `gateway/run_shutdown.py`, `gateway/config_env.py`, `hermes_state_sessions.py`, `hermes_state_telegram.py`, `tools/browser_tool_eval_policy.py`, `tools/browser_tool_install.py`, and `hermes_cli/update_cmd_maint.py` split out. |
| `v2026.9.7` (`2237be355`) to `v2026.9.11` (`939e45c91`) | 986 | 1,650 | One-shot `--resume` support lands, which retires the `resumed_oneshot` translation. |
| `v2026.9.11` (`939e45c91`) to `v2026.9.14` (`345cd2b05`) | 1,039 | 2,642 | Release stabilization for `0.21.3`. |

The adjacent ranges contain 8,931 source commits; the end-to-end diff touches 7,369 files.
Python remains `>=3.11,<3.14`, and the JavaScript runtime accepts Node.js `^22.22.0 || ^24.11.0 || >=26.0.0`, so NemoClaw's Python 3.13 and digest-pinned Node.js `24.22.1` runtime remain compatible.

## Semantic migration and retained workarounds

Hermes configuration schema moves from 39 to 44.
Migrations v40 (`model_catalog.ttl_hours`), v41 (legacy Bot Mode section in `SOUL.md`), v42 (`cron.model_drift_guard`), and v43 (`gateway.multiplex_profile_allowlist`) are no-ops on NemoClaw's generated shape.
Migration v44 rewrites `curator.stale_after_days` 30 to 14 and `curator.archive_after_days` 90 to 30 when the old defaults are present, and NemoClaw's generated configuration pins exactly those values.
With a schema 39 stamp, Hermes 0.21.3 startup migration therefore rewrites `config.yaml`, shortens managed skill retention, and trips the managed drift guard; a probe against the installed 0.21.3 migration code confirmed both effects.
The generator now emits schema 44 directly, which keeps the file byte-identical through `migrate_config()` and keeps the managed curator retention authoritative.

The retained authorization and policy migrations are unchanged in intent: `approvals.mode: manual`, `browser.restrict_evaluate: true` with `allow_unsafe_evaluate: false`, the complete `session_reset` policy, `display.show_reasoning: false`, `display.show_commentary: false`, and disabled `updates` side effects all remain explicit generated pins.
The managed policy additionally pins `database.temp_store: 2`, which Hermes 0.21.3 honors natively through `apply_database_pragmas()`.
Fresh `hermes profile create <name>` homes still omit `config.yaml`, so the hash-bound exact-source profile-policy patcher remains in place; for 0.21.3 it binds the config defaults, browser tool, browser evaluation policy, gateway, classic CLI, TUI gateway, TUI config methods, agent initialization, and update-maintenance sources.

The second decomposition wave changed where the retained patches anchor:
the cron restore-drain patch now also binds `gateway/run_shutdown.py`, where external drain entry moved;
the session-preview ordering fix now spans `hermes_state_common.py`, `hermes_state_sessions.py`, and `hermes_state_telegram.py`, and keeps automatically titled rows from hiding the latest turn in `hermes_cli/sessions_cmd.py`;
the cron execution-ledger relocation keeps covering the shared `cron/incidents.py` fallback, which upstream NemoClaw's 0.21.3 patch omits;
the SQLite temp-store fix now targets `SessionDB._open_writer_conn`;
the Langfuse placeholder patch keeps the fork's revision-prefixed placeholder form and does not adopt upstream's new HTTPS-only base-URL gate, which would be a behavior change for existing deployments.
Every retained patcher keeps its exact-source, hash-gated, fail-closed contract, and every patched output was reproduced from the `v2026.9.14` source.

Hermes 0.21.3 routes every built-in and plugin environment-enablement path through the `_enabled_explicit` marker, so ambient credentials no longer flip `enabled` on an explicitly disabled platform.
Its table-driven credential steps still copy those credentials into the disabled platform's `extra` and `token`.
The neutral managed image requires disabled platforms to stay complete and credential-free, so the neutral-platform patch is retained and retargeted to the `gateway.config._apply_env_overrides` delegate; the `neutral-platform-inertness` build probe fails on the unpatched 0.21.3 source and passes with the patch.

The `resumed_oneshot` CLI adapter translation (#5254) is retired: Hermes 0.21.3 resumes and continues one-shot turns in the selected session natively.
The adapter now records only the provider and model composition translation and targets Hermes `0.21.3`; the version guard that rejects a stale compatibility workaround set now targets `0.21.3`.

## Selected Python dependency graph

Evaluating the frozen lock for Linux CPython 3.13 with the image extras (`anthropic`, `messaging`, `web`, `pty`, `mcp`) selects 97 unique third-party package names; the same method selects 95 for the previous pin.
Hermes 0.21.3 adds `firecrawl-anydoc==0.2.4` and `pillow-heif==1.5.0`, and moves `brotlicffi` to `1.2.0.2`, `nemo-relay` to `0.8.3`, `slack-sdk` to `3.44.1`, and `tornado` to `6.5.8`.
Tornado `6.5.8` is the version upstream now selects, and it resolves four advisories that applied to `6.5.7`.
The previous review's `python-multipart==0.0.27` exposure (GHSA-5rvq-cxj2-64vf CPU denial of service, GHSA-6jv3-5f52-599m parser differential, GHSA-v9pg-7xvm-68hf) stays closed: the frozen lock resolves `0.0.32`, and the base image keeps a hash-verified install of the reviewed wheel and sdist digests.
The aiohttp `3.14.3` floor keeps prior fixes including GHSA-cq5v-8q36-5273 and GHSA-g6cj-pr64-35w5.
The `mcp==2.0.0` line and its `source-distribution-only` build constraint are unchanged.

Two residual deltas remain and are floored by the exact-source patch:

- `httpx2==2.12.0` and `httpcore2==2.12.0`: Hermes 0.21.3 still pins `httpx2==2.7.0` in the dev, mcp, and computer-use extras, and that release plus its exact `httpcore2==2.7.0` transitive carry GHSA-7mj9-2mp8-4m2p (SOCKS TLS downgrade), GHSA-8xx6-hgc6-gc2m (unbounded decompression), GHSA-f2fp-rgf2-35cp (quadratic SSE buffering), GHSA-h4x7-gw46-3wm6 (multipart header injection), and GHSA-pf96-p4fj-6566 (CL/TE smuggling). `httpx2 2.12.0` is the lowest release that clears all five advisories and requires `httpcore2==2.12.0`.
- `alibabacloud-dingtalk==2.2.54`: the dingtalk extra still pins `2.2.42`; the patch floors it at the previously reviewed `2.2.54` release so the frozen lock cannot resolve the older build.

A point-in-time OSV query on 2026-10-30 reports advisories for 11 selected packages in both the previous and the target graph (127 advisory identifiers for the previous pin, 123 for the target).
No package introduces a new advisory identifier through this upgrade; the only change is the four identifiers resolved by Tornado `6.5.8`.
The remaining identifiers affect `aiohttp`, `anyio`, `brotlicffi`, `certifi`, `mcp`, `multidict`, `opentelemetry-api`, `Pillow`, `PyJWT`, `tornado`, and `urllib3`, apply equally to the current production pin, and are recorded as pre-existing residual debt in `HERMES-28`.

## Concern ledger

| ID | Severity | Disposition | Evidence and remaining gate |
| --- | --- | --- | --- |
| `HERMES-1` | High | Pin and test | The verified target tag object, peeled commit, source SHA-256, CalVer-to-semver mapping, npm registry cross-check, and publication state are recorded and bound by `test/hermes-dependency-review.test.ts`. |
| `HERMES-4` | High | Migrate and test | The versioned adapter now owns only separate provider and model composition and targets Hermes 0.21.3; the validator passes against the installed 0.21.3 parser. |
| `HERMES-5` | Medium | Guard and test | Every retained compatibility patch was compared with target source, retargeted across the second decomposition wave, hash-bound, and exercised by focused regression and image build probes. |
| `HERMES-6` | High | Migrate, guard, test, and runtime-proof | Default-profile cron and Discord ledgers keep online SQLite backup. The cron execution ledger and the shared incident fallback remain relocated to `runtime/cron-executions.db`; the cron tick lock now also lives in writable runtime state. |
| `HERMES-7` | High | Test and runtime-proof | The MCP client runtime and Streamable HTTP availability checks pass against the installed 0.21.3 runtime. `mcp__server__tool` naming, managed-tool discovery, and invocation remain a live E2E gate. |
| `HERMES-8` | High | Guard and runtime-proof | Optional upstream secret sources stay disabled, `--safe-mode` does not broaden the generated environment allowlist, and the live environment boundary must reject raw credentials. |
| `HERMES-9` | High | Pin and test | The selected Python delta adds no advisory regression: the two floored selections clear their advisories and Tornado `6.5.8` resolves four advisories. |
| `HERMES-10` | High | Pin and test | The exact-source patch updates Hermes metadata and its frozen lock together and fails the base image build on dependency inconsistency or installed-version drift. |
| `HERMES-13` | Medium | Document bounded residual | Static `state_files` entries online-back up the default profile only. Cron or Discord ledgers created under `profiles/<name>` remain in the raw `profiles` tar capture (default-profile versus named-profile scope is unchanged by this upgrade). |
| `HERMES-14` | High | Migrate and test | The browser evaluation denylist remains opt-in upstream. Generated configuration writes `browser.restrict_evaluate: true`, and the 0.21.3 evaluation-policy module keeps a missing raw value restricted. |
| `HERMES-15` | Medium | Migrate and test | Generated configuration explicitly writes the complete bounded reset and notification policy. |
| `HERMES-16` | High | Migrate and test | Generated configuration explicitly disables reasoning and commentary. |
| `HERMES-17` | High | Migrate and test | Generated configuration explicitly disables in-place update state duplication and the mutable secondary download. |
| `HERMES-18` | High | Migrate and test | The image hash-binds the exact `v2026.9.14` config-defaults, browser, browser-evaluation-policy, gateway, classic-CLI, TUI, TUI-config, agent-init, and update-maintenance sources, patches their fail-safe defaults, and probes a real config-less profile. |
| `HERMES-21` | Medium | Document inherited bounded residual | The runtime-metadata workaround still does not retarget every direct upstream metadata consumer; the 0.21.3 retarget adds no regression to the supported host-managed default-gateway lifecycle. |
| `HERMES-22` | High | Patch, pin, test, and runtime-proof | The WhatsApp proxy-agent patch applies unchanged to the 0.21.3 bridge; live WhatsApp E2E through the OpenShell proxy remains a merge gate. |
| `HERMES-25` | High | Migrate, test, and runtime-proof | A schema 39 stamp lets v44 rewrite the managed curator retention and `config.yaml`. Generated configuration emits schema 44; the installed 0.21.3 `migrate_config()` leaves it byte-identical. |
| `HERMES-26` | High | Retain patch and test | Hermes 0.21.3 keeps explicit disables disabled but copies ambient credentials into the disabled platform object. The retargeted neutral-platform patch restores complete disabled objects in the neutral image. |
| `HERMES-27` | Medium | Retire and test | The `resumed_oneshot` translation is removed because 0.21.3 resumes one-shot turns natively; the wrapper and adapter no longer carry it. |
| `HERMES-28` | Medium | Document pre-existing residual | The OSV advisories on 11 selected packages predate this upgrade and apply equally to the current production pin. Remediating them requires dependency floors beyond this version bump and is tracked separately. |

Unresolved upgrade-created high-impact concerns: `0`.

The remaining gates are repository CI, the Hermes image build and validation workflow, documentation review, security review, and protected Hermes E2E.

## Verification and remaining gates

### Source and Test Evidence

- GitHub release state identifies stable tag `v2026.9.14`, annotated tag object `7a963716b81be13ba513d4f127633b7da493aff2`, and source commit `345cd2b057a452236de401d3534b8502a7465e8d`.
- Every patched source file was reproduced from the `v2026.9.14` source in Dockerfile order, run through its patcher, and hash-compared against the Dockerfile-committed digests; the pre-patch source digests match upstream NemoClaw's 0.21.3 values.
- The image build probes for session preview, session delete, cron runtime, gateway runtime metadata, gateway process identity, Langfuse credentials, Discord recovery source, profile policy, and neutral-platform inertness pass against a 0.21.3 runtime built from the patched frozen lock.
- The CLI adapter validator and the MCP client runtime check pass against the installed 0.21.3 runtime.
- Focused tests cover generated configuration, the wrapper, compatibility patches, the default-profile state manifest, and skill contracts.

### Publication and Registry Evidence

- The GitHub release for `v2026.9.14` is published, non-draft, and non-prerelease at `2026-09-14T16:04:14Z`.
- The `hermes-agent@0.21.3` npm artifact matches the recorded `sha512` integrity and `fae082e1f76fff3b1959940d9e9cdc1033c89d5f` SHA-1.

Before merge, these checks must pass:

- The Hermes base and sandbox image builds must pass their installed-version checks and build probes.
- The managed MCP E2E test must pass discovery and invocation.
- The protected Hermes E2E tests must pass messaging, environment-credential rejection, restart, snapshot, rebuild, and rollback paths.
- Required repository checks must pass with no unresolved actionable finding.
