<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Hermes 0.20.6 dependency and compatibility review

Review date: 2026-09-17

## Decision

Pin the NemoClaw Hermes runtime to the published, non-draft, non-prerelease `v2026.8.27` release, whose package version is `0.20.6`.
This replaces `v2026.7.20` and covers all seven adjacent stable release ranges, including the four-component `v2026.8.16.2` tag.

The upgrade is acceptable only with the downstream migrations recorded in this review.
NemoClaw continues to preserve manual command approval, the fail-closed browser evaluation denylist, the complete outgoing session-reset policy, hidden reasoning and commentary channels, and disabled in-place update side effects, and now emits configuration schema 39.
It uses the same versioned CLI adapter for the two required translations, passes unrelated commands through, and backs up the default-profile cron and Discord recovery SQLite ledgers online.
Named-profile copies remain inside the raw `profiles` directory capture under the existing generic snapshot limitation; this bounded residual is recorded rather than described as online backup.
The gateway-runtime-metadata, session-preview, Langfuse-placeholder, cron-restore-drain, neutral-platform, SQLite temp-store, Discord-recovery, and profile-policy workarounds remain necessary against the target source and retain exact-shape guards.
The managed light-terminal skin workaround is retired: Hermes 0.20.6 detects light terminals natively and remaps every skin color, so NemoClaw no longer installs or applies `nemoclaw-light`; only the stale-reference cleanup path remains.

Hermes 0.20.6 also lands upstream per-profile HTTP authentication (`fix(gateway): bind HTTP auth to routed profiles`, first released in `v2026.7.30`): a `/p/<profile>/` request resolves `API_SERVER_KEY` from that profile's secret scope, fails closed when the profile has no key, and never inherits the default-profile credential. NemoClaw consumes this for the managed profile boundary without any downstream patch.

The selected Python graph is hardened before installation with a reviewed, exact-source patch that updates the published dependency metadata and frozen lock together.
Hermes 0.20.6 already carries the reviewed `aiohttp==3.14.3`, `cryptography==50.0.0`, `mcp==2.0.0`, `Pillow==12.3.0`, `starlette==1.3.1`, `tornado==6.5.7`, and `python-multipart==0.0.32` selections natively.
The patch floors the two remaining deltas: `httpx2==2.12.0` plus its exact `httpcore2==2.12.0` transitive in the dev, mcp, and computer-use extras, and `alibabacloud-dingtalk==2.2.54` in the dingtalk extra.
The base image build runs `uv pip check` and separately checks those installed versions.
The Hermes sandbox image build checks `aiohttp==3.14.3` and `cryptography==50.0.0` after messaging package installation.
The check runs when `NEMOCLAW_MANAGED_IMAGE_CAPABILITY_UNION` is `0` or `1`.
The Hermes sandbox image build fails if either installed dependency has another version.
The base image also keeps the hash-verified `python-multipart==0.0.32` install as a build-time re-assertion of the reviewed wheel and sdist digests, even though the frozen lock already selects the same release.
The base image overlays checksum-pinned Node.js `24.18.1` archives for both supported architectures and installs exact uv `0.11.33`; build-time assertions reject version drift before Hermes is installed.

## Reviewed identities

| Identity | Value |
| --- | --- |
| Current release | `v2026.7.20` / `0.19.0` |
| Current source commit | `3ef6bbd201263d354fd83ec55b3c306ded2eb72a` |
| Target release | `v2026.8.27` / `0.20.6` |
| Target annotated tag object | `fcebd62163497e77e5de00d26d2ed86cb4ef8761` |
| Target source commit | `5fc308a70719a83cccdbba4c0e39c23f5a8239d5` |
| Target source archive SHA-256 | `e622723b5bf3cd6c1db974d92d32242f1cb63f61c1112b6f708b34d619ef0fc7` |
| Target npm cross-check integrity | `sha512-s5q1IEBifCBb77QMwkse4MRaAaoZSxIa4IkicIO3jL7MIdq15YvnSyiNvsTOWNBi6t3shFpIg+H7+9MJsOiSkg==` |
| Target npm tarball SHA-1 | `ac12be86eb06ce8ace025cb508fda4b243a5f328` |
| Target Node.js release | `24.18.1` |
| Target uv release | `0.11.33` |
| Target publish date | `2026-08-27` |

The authoritative source release is `NousResearch/hermes-agent` tag `v2026.8.27`.
The tag reference resolves to annotated tag object `fcebd62163497e77e5de00d26d2ed86cb4ef8761`, which peels to source commit `5fc308a70719a83cccdbba4c0e39c23f5a8239d5`.
The GitHub release is published, non-draft, and non-prerelease at `2026-08-27T12:06:53Z`.
Upstream no longer publishes `hermes-agent` to PyPI: the newest PyPI release remains `0.19.0`, so the PyPI artifact cross-check used for the previous review has no `0.20.6` counterpart and is replaced by the npm registry's SLSA provenance attestation for `hermes-agent@0.20.6`.
NemoClaw builds from the SHA-256-pinned GitHub source archive rather than installing registry artifacts.
The `hermes-agent` npm package is published from a different bridge repository and is only an independent registry-integrity cross-check.

## Complete source range ledger

| Adjacent range | Commits | Changed files | NemoClaw-relevant result |
| --- | ---: | ---: | --- |
| `v2026.7.20` (`3ef6bbd`) to `v2026.7.30` (`cc4cab2f5`) | 3,087 | 4,749 | The facade-plus-siblings decomposition lands across `hermes_state`, `gateway/run`, `cli`, and `tui_gateway`; per-profile HTTP auth lands; every retained patcher needs retargeting. |
| `v2026.7.30` (`cc4cab2f5`) to `v2026.8.3` (`3c27eb623`) | 945 | 1,162 | Continued gateway and platform work under the new layout. |
| `v2026.8.3` (`3c27eb623`) to `v2026.8.13` (`f80f453ae`) | 1,620 | 2,226 | Cron incidents module added; config schema advances. |
| `v2026.8.13` (`f80f453ae`) to `v2026.8.16` (`df4b65147`) | 979 | 1,281 | Session preview and state portability split completes. |
| `v2026.8.16` (`df4b65147`) to `v2026.8.16.2` (`7339f5f16`) | 258 | 467 | Patch-level hotfix range. |
| `v2026.8.16.2` (`7339f5f16`) to `v2026.8.18` (`e624e9fde`) | 159 | 270 | Small stable increment. |
| `v2026.8.18` (`e624e9fde`) to `v2026.8.19` (`fcbd1076a`) | 804 | 1,253 | Platform and tooling increments. |
| `v2026.8.19` (`fcbd1076a`) to `v2026.8.27` (`5fc308a70`) | 1,376 | 1,558 | Release stabilization for `0.20.6`. |

The complete adjacent range contains 9,228 source commits and 7,968 changed files.
The upstream release-note estimate is not used as the audit boundary.
Python remains `>=3.11,<3.14`, and the JavaScript runtime remains Node.js `>=20`, so NemoClaw's Python 3.13 and checksum-pinned Node.js 24.18.1 runtime remain compatible.
Later upstream tags (`v2026.8.31`, `v2026.9.x`) exist; `v2026.8.27` is the reviewed target for this upgrade.

## Semantic migration and retained workarounds

Hermes configuration schema moves from 33 to 39.
Every intermediate migration (v34 personality reset, v35 background-notification mode, v36–v37 delegation defaults, v38 Relay plugin cutover, v39 `bfl` toolset removal) is a conditional scrub that is a no-op on NemoClaw's generated shape, so the generator and its hash contract now emit schema 39 directly; a stale stamp would let startup migration rewrite `config.yaml` and trip the managed drift guard.

The retained authorization and policy migrations are unchanged in intent: `approvals.mode: manual`, `browser.restrict_evaluate: true` with `allow_unsafe_evaluate: false`, the complete `session_reset` policy, `display.show_reasoning: false`, `display.show_commentary: false`, and disabled `updates` side effects all remain explicit generated pins.
Fresh `hermes profile create <name>` homes still omit `config.yaml`, so the hash-bound exact-source profile-policy patcher remains in place across the pinned `v2026.8.27` config defaults, browser-policy loader, gateway session-reset config, classic CLI, TUI gateway, agent initialization, and update-command fallbacks.

The facade-plus-siblings refactor changed where the retained patches anchor but not their semantics:
the session-preview ordering fix now spans `hermes_state.py` (five sites) and `hermes_state_portability.py` (two sites);
the cron execution-ledger relocation now also covers the new shared `cron/incidents.py` module;
the cron restore-drain marker anchor moved inside `gateway/run.py`;
the SQLite temp-store fix now targets the `SessionDB.__init__` connection block introduced with `apply_database_pragmas()`;
update-command defaults moved from `hermes_cli/main.py` to the new `hermes_cli/update_cmd.py`.
Every retained patcher keeps its exact-source, hash-gated, fail-closed contract.

The WhatsApp bridge still needs the proxy-agent patch: `v2026.8.27` reshaped `makeWASocket` to a conditional `version` spread, so the patch was regenerated against the new shape rather than carried over.
The Baileys socket still ignores `HTTPS_PROXY` natively, and the bridge-level mock probe still proves `agent` and `fetchAgent` receive the injected `HttpsProxyAgent`.

The managed `nemoclaw-light` skin is retired.
Hermes 0.20.6 detects light terminals via OSC 11, `COLORFGBG`, and environment hints, then remaps every skin color through `_maybe_remap_for_light_mode`; it also ships built-in `daylight` and `warm-lightmode` skins.
NemoClaw therefore removes the custom skin payload and the apply path, and keeps only the migration cleanup that strips a stale `display.skin: nemoclaw-light` reference and deletes the skin file when a dark-terminal host reconnects to a sandbox configured by an older release.

The versioned CLI adapter still records two managed command forms — top-level resumed or continued one-shot invocations translated to `chat --query`, and invocations that combine separate provider and model flags — and now targets Hermes `0.20.6`.
The pinned upstream coalescer (`hermes_cli.main._coalesce_session_name_args` bounded by `_SUBCOMMANDS`) is unchanged in shape, so the adapter binding survives with only the version bump.

## Selected Python dependency graph

The selected graph confirms 94 unique third-party package names.
Hermes 0.20.6 natively selects `aiohttp==3.14.3`, `cryptography==50.0.0`, `mcp==2.0.0`, `Pillow==12.3.0`, `starlette==1.3.1`, `tornado==6.5.7`, and `python-multipart==0.0.32`.
Tornado `6.5.7` is the lowest version that clears its reviewed advisories, and upstream already carries it.
The previous review's `python-multipart==0.0.27` exposure (GHSA-5rvq-cxj2-64vf CPU denial of service, GHSA-6jv3-5f52-599m parser differential, GHSA-v9pg-7xvm-68hf) is closed upstream: the frozen lock resolves `0.0.32`, and the base image keeps a hash-verified install of the reviewed wheel and sdist digests as build-time re-assertion.
The aiohttp `3.14.3` floor keeps prior fixes including GHSA-cq5v-8q36-5273 and GHSA-g6cj-pr64-35w5.
The `mcp` extra moves to the `mcp==2.0.0` line; the `source-distribution-only` build constraint noted in the previous review is unchanged.

Two residual deltas remain and are floored by the exact-source patch:

- `httpx2==2.12.0` and `httpcore2==2.12.0`: upstream pins `httpx2==2.7.0` in the dev, mcp, and computer-use extras, and that release plus its exact `httpcore2==2.7.0` transitive carry GHSA-7mj9-2mp8-4m2p (SOCKS TLS downgrade), GHSA-8xx6-hgc6-gc2m (unbounded decompression), GHSA-f2fp-rgf2-35cp (quadratic SSE buffering), GHSA-h4x7-gw46-3wm6 (multipart header injection), and GHSA-pf96-p4fj-6566 (CL/TE smuggling). `httpx2 2.12.0` is the lowest release that clears all five advisories and requires `httpcore2==2.12.0`, which clears the same SOCKS-TLS flaw in the transport layer.
- `alibabacloud-dingtalk==2.2.54`: the dingtalk extra still pins `2.2.42`; the patch floors it at the previously reviewed `2.2.54` release with its PyPI-verified sdist and wheel digests, so the frozen lock cannot resolve the older build even though the extra is not selected into the managed image.

## Concern ledger

| ID | Severity | Disposition | Evidence and remaining gate |
| --- | --- | --- | --- |
| `HERMES-1` | High | Pin and test | The verified target tag object, peeled commit, source SHA-256, CalVer-to-semver mapping, npm registry cross-check, and publication state are recorded and bound by `test/hermes-dependency-review.test.ts`. |
| `HERMES-4` | High | Migrate and test | The versioned adapter owns only top-level resumed or continued one-shot translation and separate provider and model composition, now targeting Hermes 0.20.6. The wrapper reads session-name command boundaries from Hermes' installed coalescer source instead of copying its private set, and an upstream version mismatch fails closed. Each translation records its upstream source-fix constraint and removal condition. |
| `HERMES-5` | Medium | Guard and test | Every retained compatibility patch was compared with target source, retargeted across the facade-plus-siblings refactor, hash-bound, and exercised by focused regression and image smoke probes. |
| `HERMES-6` | High | Migrate, guard, test, and runtime-proof | Default-profile cron and Discord ledgers keep online SQLite backup. The cron execution ledger remains exact-source relocated to `runtime/cron-executions.db`, now covering the new `cron/incidents.py` shared ledger. Managed restart and rebuild persistence remain live E2E gates. |
| `HERMES-7` | High | Test and runtime-proof | The target's `mcp__server__tool` names are compatible by source inspection, while managed-tool discovery and invocation remain a live E2E gate. |
| `HERMES-8` | High | Guard and runtime-proof | Optional upstream secret sources stay disabled, `--safe-mode` does not broaden the generated environment allowlist, and the live environment boundary must reject raw credentials. |
| `HERMES-9` | High | Pin and test | The selected Python delta adds no advisory regression: the two floored selections (`httpx2`/`httpcore2` 2.12.0, `alibabacloud-dingtalk` 2.2.54) clear their advisories, and the multipart parser remains the attested `0.0.32` with hash and runtime probes. |
| `HERMES-10` | High | Pin and test | The exact-source patch updates Hermes metadata and its frozen lock together, floors `httpx2==2.12.0`, `httpcore2==2.12.0`, and `alibabacloud-dingtalk==2.2.54`, and fails the base image build on dependency inconsistency or installed-version drift. The `agents/hermes/Dockerfile` build checks `aiohttp==3.14.3` and `cryptography==50.0.0` in the Hermes sandbox image after messaging package installation. The base image separately checksum-pins Node.js `24.18.1` and checks uv `0.11.33`. |
| `HERMES-13` | Medium | Document bounded residual | Static `state_files` entries online-back up the default profile only. Cron or Discord ledgers created by a process launched under `profiles/<name>` remain in the raw `profiles` tar capture and can be inconsistent during a concurrent snapshot. Dynamic profile-local SQLite discovery is generic snapshot work outside this upgrade PR. |
| `HERMES-14` | High | Migrate and test | The browser evaluation denylist remains opt-in upstream. Generated configuration explicitly writes `browser.restrict_evaluate: true`, including when managed browser-gateway settings are merged, so the upgrade does not broaden page-context access. |
| `HERMES-15` | Medium | Migrate and test | The omitted gateway session-reset policy remains no automatic reset upstream. Generated configuration explicitly writes the complete bounded reset and notification policy to preserve the retention bound without inheriting mutable dependency defaults. |
| `HERMES-16` | High | Migrate and test | Reasoning and commentary remain default-visible upstream. Generated configuration explicitly disables both so the upgrade does not broaden disclosure in user-visible channels. |
| `HERMES-17` | High | Migrate and test | In-place update side effects remain enabled by default upstream. NemoClaw's immutable image workflow owns dependency updates, so generated configuration explicitly disables both state duplication and the mutable secondary download. |
| `HERMES-18` | High | Migrate and test | Fresh named profiles omit `config.yaml`, so generated pins do not cover every `HERMES_HOME`. The Hermes sandbox image hash-binds the exact `v2026.8.27` config-defaults, browser-policy, gateway, classic-CLI, TUI, agent-init, and update-command sources, patches their fail-safe defaults, and creates a real config-less profile to exercise all affected installed loaders. |
| `HERMES-21` | Medium | Document inherited bounded residual | The runtime-metadata workaround does not retarget direct upstream `--replace` cleanup, planned-stop/takeover markers, named-profile and multiplexer readers, service/boot/web/Windows consumers, or upstream backup and Docker paths. The same limitation exists on the previous pin; the 0.20.6 retarget adds no regression to NemoClaw's supported host-managed default-gateway lifecycle. |
| `HERMES-22` | High | Patch, pin, test, and runtime-proof | The Hermes WhatsApp WebSocket still ignores the injected `HTTPS_PROXY` natively. NemoClaw exact-source patches both Baileys proxy fields against the new conditional-version socket shape, locks the added proxy dependency graph, and fails the base image build when the patch drifts or the bridge-level `makeWASocket` mock does not receive the same proxy agent as `agent` and `fetchAgent`. Live Hermes WhatsApp E2E evidence for QR pairing, connected status, and audited WebSocket traffic through the OpenShell proxy remains a merge gate. |
| `HERMES-23` | High | Migrate, test, and runtime-proof | Configuration schema 33 configs would be rewritten by startup migrations 34–39, drifting the managed hash. Generated configuration now emits schema 39 directly; all six intermediate migrations are verified no-ops on the generated shape. |
| `HERMES-24` | Medium | Remove and test | The managed `nemoclaw-light` skin is retired because Hermes 0.20.6 remaps every skin color on detected light terminals and ships `daylight`/`warm-lightmode`. Connect now only strips stale `nemoclaw-light` references on dark-terminal reconnects; the apply path, skin payload, and version boundary check are removed. |

Unresolved upgrade-created high-impact concerns: `0`.
One Medium upgrade-created instance of the pre-existing named-profile raw-capture limitation and one inherited Medium direct-runtime-consumer limitation remain explicitly accepted for this upgrade scope.

The remaining gates are repository CI, automated review, documentation review, security review, and protected Hermes E2E.
The exact-source dependency patch and its residual audit record require security review before merge.

## Verification and remaining gates

### Source and Test Evidence

The review records the following source and test evidence.

- GitHub release state identifies stable tag `v2026.8.27`, annotated tag object `fcebd62163497e77e5de00d26d2ed86cb4ef8761`, and source commit `5fc308a70719a83cccdbba4c0e39c23f5a8239d5`; the release is published, non-draft, and non-prerelease.
- The adjacent-range ledger covers eight stable ranges and 9,228 source commits.
- The dependency comparison covers the `v2026.7.20` and `v2026.8.27` Python closures, JavaScript locks, licenses, and point-in-time advisories.
- The source comparison covers Hermes configuration, wrapper, patches, state, MCP, messaging, secret boundaries, and the WhatsApp bridge socket shape.
- Every patched source file was reproduced from the `v2026.8.27` tag, run through its patcher, and hash-compared against the Dockerfile-committed patched-output digests.
- Focused tests cover generated configuration, the wrapper, compatibility patches, the default-profile state manifest, and skill contracts.
- Python 3.13 probes cover multipart forms, file upload, and dense CRLF input.
- The controlled-proxy regression sends the pinned Baileys WebSocket `CONNECT web.whatsapp.com:443` request through the bridge-provided proxy agent.

### Publication and Registry Evidence

The review records the following publication and registry evidence.

- The GitHub release for `v2026.8.27` is published, non-draft, and non-prerelease at `2026-08-27T12:06:53Z`.
- The `hermes-agent@0.20.6` npm artifact carries SLSA provenance attestation and matches the recorded `sha512` integrity and `ac12be86eb06ce8ace025cb508fda4b243a5f328` SHA-1.
- PyPI has no `hermes-agent==0.20.6` artifact; the newest PyPI release is `0.19.0`, so the previous PyPI Trusted Publisher cross-check has no counterpart and is replaced by npm provenance plus the source-archive SHA-256 pin.
- The `BASE_IMAGE` OCI index for this build is recorded in `agents/hermes/Dockerfile` once the patched base image is published; platform image configurations carry repository and revision labels plus SLSA provenance.

Before merge, these checks must pass:

- The GitHub Actions Hermes sandbox image build from the patched base image OCI index must pass its installed-version checks, cron ledger relocation probe, and cross-identity probe.
- The managed MCP E2E test must pass discovery and invocation.
- The protected Hermes E2E tests must pass messaging, environment-credential rejection, restart, snapshot, rebuild, and rollback paths.
- Required repository checks and automated reviews must pass with no unresolved actionable finding.
- The documentation writer review and security review receipts must identify the PR commit.
