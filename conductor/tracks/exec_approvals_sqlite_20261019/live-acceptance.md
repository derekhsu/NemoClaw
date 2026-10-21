<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Issue #3 Live Acceptance Attempt

Verification date: 2026-10-20. The user authorized testing through the running
ClawShell Gateway and logged into the browser for control-plane access.

## Tested Sources and Images

The source remains uncommitted. These identifiers bind the tested image to
the starting commit and the Dockerfile changes:

- Starting commit: `163de2d5cf975db672b1a44ba0892d279be31ca1`.
- SHA-256 of `git diff --binary -- Dockerfile Dockerfile.base`:
  `ad6f12b32c4ee9aababba5efb21c39975e96eb744e4780118f9702a0dd7fed30`.
- Base tag: `local/openclaw-issue3-base:20261020`.
- Base manifest: `sha256:fb1eedd3e2da9424690e307c82bfa421055da1524d66e65af5460562707753c3`.
- Candidate tag: `local/openclaw-issue3:20261020`.
- Candidate image identifier from Docker:
  `sha256:bfa0b5446aef7bddca81e5c7f43523df1b37fbb86282fea785f68913f190866a`.
- Architecture: `linux/arm64`; OpenClaw reports `2026.9.2 (3928bad)`.

Both Docker builds completed successfully. Neither image was pushed.

## Test Resources

- ClawShell UI: `http://localhost:3001`.
- ClawShell API: `http://localhost:8001`.
- OpenShell gateway: registration `openshell`, endpoint
  `https://127.0.0.1:17670`, version `0.0.101`.
- Candidate image catalog ID: `img-691c9f52a45b`.
- Private test blueprint: `openclaw-i3-accept-20261020`, copied from
  `openclaw-deepseek-tavily` with the candidate image selected.
- Sandbox name: `oc-i3-1020`.
- ClawShell sandbox ID: `sbx-b6dc3a30`.
- OpenShell sandbox ID: `7cf8b6eb-2036-442c-bef7-e006262fbf58`.

Existing sandbox records and blueprints were not changed. The test resources
remain available for investigation. Authentication values are excluded from
this record.

## Passing Observations

| Check | Result |
| --- | --- |
| Original `derekhsu/openshell-openclaw:2026.9.2` image | The legacy JSON file exists and contains zero bytes. |
| Rebuilt base image | The legacy JSON path is absent. |
| Candidate image, isolated container with networking disabled | The legacy JSON path is absent; the version command succeeds. |
| Newly created OpenShell sandbox | OpenShell reports `Ready`. |
| Filesystem in that sandbox | The legacy JSON path is absent; `state/openclaw.sqlite` exists. |
| Shell command through OpenShell exec | `pwd` succeeds and returns `/sandbox`. This is not an Agent tool call. |
| OpenClaw configuration validation | `openclaw config validate --json` returns `valid: true`; it warns about retired `agents.entries.*.default` markers. |
| Native approval-state read | `openclaw approvals get --json` exits 0 without the legacy migration warning. Its path is `~/.openclaw/state/openclaw.sqlite#exec_approvals_config`. |

The native approval-state response reports `exists: false`: there is no stored
approval row. This is a successful native read of absent policy, not evidence
that a populated policy was migrated. Existing policy preservation remains
covered by the deterministic filesystem tests.

## ClawShell Provisioning Failure

ClawShell marks the sandbox `error` after its MCP readiness probe times out.
Its diagnostic API reports:

- `openclaw_plugin_disable_failed`: plugin disable operations failed for
  `anthropic-vertex`, `deepseek`, `kimi`, `qwen`, `tencent`, and `codex`.
- `mcp_install_failed`: sandbox MCP installation failed.
- `mcp_readiness_probe_timeout`: the post-creation readiness probe timed out.

ClawShell's gateway status endpoint reports `gateway_not_running`. A start
request returns HTTP 409 because ClawShell does not consider the sandbox
running. No active startup session or `/tmp/gateway.log` exists, and loopback
HTTP probes find no listener on port 18789. No state or permission check was
bypassed to start the gateway.

The backend installer defaults to `/opt/clawshell/sandbox-mcp-wheelhouse`,
which does not exist on the host. The active installer's configured path and
the specific installation failure have not been established. The missing
default directory alone does not establish the cause of this failure.

OpenShell sandbox logs contain no legacy migration warning, but those logs
are supervisor events. They do not prove a successful OpenClaw Gateway start.

## Initial Acceptance Status

The image and native approval-state checks pass. Full runtime acceptance is
blocked before OpenClaw Gateway startup. These checks remain pending:

- Successful OpenClaw Gateway startup and review of its startup log.
- An Agent executing a harmless command through ClawShell.
- A normal gateway restart followed by the same checks.

No ClawShell code, authentication setting, provisioning status, or policy was
changed to bypass the failure. Investigating or repairing ClawShell's MCP
provisioning requires a scope decision. The track remains incomplete for the
additional test failures and commit-signing prerequisite already recorded in
[verification.md](verification.md).

Local build logs, source patch, image inspection, and credential-free
summaries are under `/private/tmp/issue3-live-acceptance-20261020/`. These are
temporary artifacts; the identifiers and results above are the durable record.

## Follow-up After MCP Wheelhouse Repair

The backend worker sets `SANDBOX_MCP_WHEELHOUSE_PATH` to
`/Users/derekhsu/Project/clawshell-gateway/artifacts/sandbox-mcp-wheelhouse`.
The directory existed, but contained `sandbox_mcp_server-0.1.0` while the
installer source requires `0.1.1`. Calling its wheelhouse validation reproduced
`wheelhouse_package_not_found`. The missing default directory was not the cause.

With user authorization, `uv build --wheel` built the current MCP source. The
new `sandbox_mcp_server-0.1.1-py3-none-any.whl` was added to that directory;
existing wheels were retained. Its SHA-256 is
`6eb96b97279d839116021f37a892529d14d23947b12d664abd8f71653bcf6c58`.
Installer validation passed. Offline dependency resolution also passed inside
the candidate image using a temporary Python 3.13 virtual environment with
networking disabled. No ClawShell source or security policy was changed.

After the user logged in again, the UI created sandbox `oc-i3-1020b`,
ClawShell ID `sbx-1fe7b2f7`, from the same private acceptance blueprint.
MCP version `0.1.1` was installed successfully, and importing
`sandbox_mcp_server.server` succeeded. Its diagnostic response contained the
plugin-disable failure but no MCP install or readiness failure at that check.

A normal ClawShell gateway-start request reached OpenClaw startup and created
`/tmp/gateway.log`. Startup failed because the configured `deepseek` plugin
was missing. OpenClaw attempted to fetch `@openclaw/deepseek-provider` from
`registry.npmjs.org`; the sandbox policy returned HTTP 403 `policy_denied`.
OpenClaw reported plugin verification failure and refused to report the gateway
ready. The loopback health probe found no listener. ClawShell returned HTTP 502
`health_check_failed` after its startup health-check timeout. No policy check
was bypassed.

The startup log contained zero `Legacy exec approvals` warnings. The legacy
JSON path remained absent and SQLite existed. A native
`openclaw approvals get --json` read again exited 0, with no legacy migration
warning, using `~/.openclaw/state/openclaw.sqlite#exec_approvals_config` and
reporting `exists: false`.

### Second Attempt Acceptance Status

The MCP version mismatch is repaired. Full acceptance is now blocked by the
missing DeepSeek plugin and its denied runtime download. Successful Gateway
startup, an Agent tool call, and the restart checks remain pending. The earlier
MCP failure describes the first attempt; it is not the current blocker.
Credential-free wheelhouse investigation and repair results are recorded in
`/private/tmp/issue3-live-acceptance-20261020/mcp-investigation.json`.

## Follow-up Using an Existing Inference Blueprint

At the user's direction, the next attempt used the existing `Local Gemma4`
blueprint (`local-gemma-openclaw`) as its source. Its `inference.local` route
reported ready and currently resolved to provider `OpenAI`, model
`gpt-5.6-luna`; the blueprint name does not identify the route's current model.
A private copy, `openclaw-i3-inference-20261020`, retained the source blueprint's
settings with the candidate image `local/openclaw-issue3:20261020` selected.
No existing blueprint, inference route, plugin package, or policy was changed.

The new sandbox is `oc-i3-1020c`, ClawShell ID `sbx-62975759`, created by the
ClawShell API with operation ID `op-b30a94472398`. MCP `0.1.1` installed.
ClawShell's gateway-start endpoint returned HTTP 200 and `running: true`.
The initial loopback `/health` probe returned HTTP 200. The startup log had
39 lines, zero legacy migration warnings, and SHA-256
`fc39c35646de7711a560f1fbefa3a14a6c25a3519931f739f762eab964e867f0`.
The legacy JSON path was absent and the state SQLite file existed.

The OpenAI proxy request returned HTTP 404. The sandbox configuration did not
enable the Gateway HTTP endpoints. Instead, the authenticated ClawShell UI
terminal opened successfully and ran:

```sh
openclaw agent --session-id issue3-before-20261020 --message "Use your exec tool to run exactly: printf ISSUE3_EXEC_OK_20261020. Do not edit files. Return the tool output." --timeout 90 --json
```

The Agent command failed before a tool call with:

```text
fts5: error creating shadow table session_transcript_fts_content:
unable to open database file
```

No matching tool execution was recorded. The Agent database is
`/sandbox/.openclaw/agents/main/agent/openclaw-agent.sqlite`; its read-only
`quick_check` returned `ok` and its table count was zero. Its directory and
SQLite files belonged to `sandbox`. Independent temporary FTS5 table creation
passed with both Python SQLite and Node's `node:sqlite`; the Node probe also
passed in the Agent directory with WAL enabled. These checks do not establish
the cause of OpenClaw's initialization failure. No existing database was
removed or changed to work around it.

### Restart Attempt

ClawShell's restart endpoint returned HTTP 409 because this runtime requires
Stop followed by Start. Its Stop endpoint then returned HTTP 502
`command_failed`. The stop implementation searches JSON locks under
`/tmp/openclaw*/gateway.*.lock`, whereas this runtime creates SQLite locks under
`/sandbox/.openclaw/tmp/openclaw-998/`.

The test Gateway process, PID `1726`, was verified by its process name and
sent SIGTERM through OpenShell. A subsequent normal ClawShell Start request
reached OpenClaw startup, but failed with the same Agent FTS5 initialization
error. The log explicitly reported `gateway.startup_failed`. This is not a
successful restart, nor a successful ClawShell Stop operation. The Start
request ultimately returned HTTP 502 `health_check_failed`. Its startup-log
SHA-256 was `4f80cd0cb0801a9b891f22cb6ebbd8ecb96589a739a0af252941031d4912aff0`,
with zero legacy migration warnings. Credential-free API outcomes are saved in
`/private/tmp/issue3-live-acceptance-20261020/inference-blueprint-lifecycle.json`.

### Third Attempt Acceptance Status

Using the existing inference blueprint removed the DeepSeek download blocker
and produced one successful Gateway start. The Agent tool check and restart
remain incomplete because Agent SQLite initialization fails. The original
legacy approvals warning remained absent. Full runtime acceptance and the
track remain incomplete; the earlier test and signing prerequisites also
remain as recorded in `verification.md`.

## SQLite Temporary Directory Investigation and Workaround

This verification stopped and started the Gateway process directly because
the sandbox has no service manager. A temporary Node process reproduced the
FTS failure without a Gateway or service operation.

The installed OpenClaw Agent schema and `ensureAgentSchema` function were
exercised against disposable databases. Initializing without incremental
auto-vacuum passed. Adding `PRAGMA auto_vacuum=INCREMENTAL`, as OpenClaw's
pre-schema configuration does, reproduced the exact FTS error. The same
initialization passed with `temp_store=MEMORY`, `SQLITE_TMPDIR=/tmp`, or
`SQLITE_TMPDIR=/sandbox/.openclaw/tmp`. WAL mode alone did not resolve it.
The Node runtime embeds SQLite `3.51.3`.

`SQLITE_TMPDIR` and `TMPDIR` were unset in the original process environment.
`/var/tmp` had mode `1777`, but an actual temporary-file creation failed with
`PermissionError`, errno 13. The equivalent creation under `/tmp` and the
OpenClaw state temp directory passed. SQLite's documented Unix search order
checks `SQLITE_TMPDIR`, then `TMPDIR`, before `/var/tmp`, `/usr/tmp`, and `/tmp`
([SQLite temporary file locations](https://www.sqlite.org/tempfiles.html)).
Together with the controlled reproduction, these observations identify the
unusable default temporary-file location as the cause of this FTS failure.
No database corruption was established.

### Runtime Verification with an Explicit SQLite Temp Directory

In the existing test sandbox, Gateway was started directly with
`SQLITE_TMPDIR=/tmp openclaw gateway run`, without changing the image or policy.
Its health endpoint returned HTTP 200. An Agent turn, with the same environment
variable set for the CLI, invoked `exec` to run
`printf ISSUE3_EXEC_TMPDIR_OK_20261020`. The Agent returned status `ok` and exit
code 0. The persisted SQLite transcript confirmed the `exec` tool call and a
`completed` result with exit code 0 and `isError: false`.

The verified Gateway process, PID `7240`, received SIGTERM. Starting again with
the same environment produced PID `7417` and HTTP 200 health. A new Agent turn
invoked `exec` to run `printf ISSUE3_EXEC_RESTART_OK_20261020`. Its persisted tool
result was again `completed`, exit code 0, with `isError: false`.
The reply included an `oom_score_adj` permission warning; it did not make the
tool call fail. The restart log SHA-256 is
`9242395726ad941d88cfc1b673269ae5da4887a377798fc39a93c1e34518ba45`.
Neither Agent command nor the restart log contained the legacy approvals
migration warning. The legacy JSON path remained absent and shared SQLite
state remained present. Existing Agent databases were not removed or replaced.

### Process-Environment Workaround Status

Gateway start, an Agent exec tool call, process stop/start, and a second Agent
exec tool call pass with the explicit SQLite temp-directory environment.
These results validate a runtime workaround; they do not establish that the
candidate image works without it. A persistent image fix would set
`SQLITE_TMPDIR=/tmp` and require a rebuilt-image check. No Dockerfile was changed
for this workaround. ClawShell's Stop compatibility issue remains open.

The track remains incomplete for this image environment requirement and the
previously recorded test, signing, and manual checkpoint prerequisites.
Credential-free runtime results are saved in
`/private/tmp/issue3-live-acceptance-20261020/sqlite-tmpdir-verification.json`.

## Rebuilt Image with the SQLite Temp Directory Setting

The user authorized a persistent image change. Both Dockerfiles now declare
`SQLITE_TMPDIR=/tmp`; regression tests and the documentation were updated.
The base and derived image builds completed. The derived image deliberately
used the earlier base without that variable and still provides it in its final
runtime environment.

The rebuilt candidate is `local/openclaw-issue3:20261020-sqlite-tmp`, identifier
`sha256:6369cd6dc12e15d7b60400bbf3647110d69e405f522d765bb23481ffdd934eed`.
The isolated container schema check completed with exit 0 on retry, with no
runtime environment override. The source binding, base identifier, build logs,
regression results, and the initial Docker transport failure are recorded in
[verification.md](verification.md#sqlite-temporary-directory-image-repair).

### ENV-Only Rebuilt Image Status

The source fix, both image builds, and isolated container schema check pass.
Fresh sandbox verification of this candidate remains pending a renewed
ClawShell browser login. The previous process-environment workaround passed
Gateway and Agent exec checks before and after a process stop/start, but used
the earlier image. It does not replace acceptance of the rebuilt candidate.
The track remains incomplete for fresh acceptance and the other recorded gates.

## Fresh Sandbox Verification and Shell Environment Repair

After the user logged in, the ENV-only candidate was registered and used by
sandbox `oc-i3-1020d`, ClawShell ID `sbx-9617d3c6`, operation
`op-f33534c64256`. Docker inspection confirmed image identifier
`sha256:6369cd6dc12e15d7b60400bbf3647110d69e405f522d765bb23481ffdd934eed`
and `SQLITE_TMPDIR=/tmp` in container metadata. OpenShell exec nevertheless
omitted that variable. Image metadata alone was insufficient for this entry.

The final change extends the existing runtime environment shell hooks. They
first load NemoClaw's runtime environment, then default an unset or empty
`SQLITE_TMPDIR` to `/tmp`. A nonempty value, including the entrypoint's private
temp directory, is preserved. Both login and interactive Bash receive the
default. The derived image also updates a proxy profile that predates it.
No policy, launcher, approval default, dependency, or existing database changed.

The three generated-hook cases failed before this addition. After it, the
focused provisioning/state tests report 20 passed and 54 skipped. The shell-env
shim suite reports 5 passed. Biome and the docs build pass. Independent review
found no source, test, or docs blockers.

Both final arm64 image builds exited 0:

- Candidate: `local/openclaw-issue3:20261020-sqlite-shell`, identifier
  `sha256:33ff039f83cdb325eb12c62a1f3a710f3212a47a9b1d1287c5986c8544893633`.
- Base: `local/openclaw-issue3-base:20261020-sqlite-shell`, identifier
  `sha256:1269e29e635eeccac90885c9f9092eeb57332e2ebe4825a9f0777fbf269f0ce6`.
- Dockerfile diff SHA-256:
  `e70224bdd3b5c13923e2a6ec29c62819fe6246f0e395a61ab15bb5d21cdc9ada`.

The candidate again used the older `:20261020` base to verify that it supplies
the setting and shell hooks independently. It was registered as image catalog
ID `img-729e70d1bc7d`. Private blueprint
`openclaw-i3-sqlite-shell-20261020` retained the existing inference settings.

Fresh sandbox `oc-i3-1020e`, ClawShell ID `sbx-89fcefe9`, operation
`op-4c87d0acdb7c`, used that candidate. OpenShell ID:
`0be1b04f-4b2a-407c-afa9-48b51ac826cb`. Its container image identifier matched
the candidate. A normal `bash -lc` reported `SQLITE_TMPDIR=/tmp` without an
environment override; the legacy JSON path was absent. MCP `0.1.1` installed.

After provisioning allowed the request, ClawShell's normal Start endpoint
returned HTTP 200 and `running: true`. The loopback health endpoint returned
HTTP 200. The Gateway log had no FTS error and no legacy migration warning.
The authenticated UI terminal connected and submitted an Agent request to run
`printf ISSUE3_IMAGE_EXEC_OK_20261020`, without a temp-directory override.

Before a completed tool result was captured, the terminal disconnected.
OpenShell reported `Provisioning` and the original container was no longer
present. Docker then failed because its OrbStack socket was absent, and
ClawShell API requests failed to connect. The cause of the service interruption
was not established. No OOM event or deliberate shutdown is claimed.

### Status at Time of Interruption

At this point, the final image's Gateway startup and shell default were verified,
but Agent completion and process restart were pending because OrbStack and the
ClawShell API became unavailable. The following recovery section supersedes
that interim status.

Build logs, source binding, and image metadata are under
`/private/tmp/issue3-sqlite-tmpdir-image-20261020/shell-hooks/`.

## OrbStack Recovery Check

- After the user restored OrbStack, the existing `oc-i3-1020e` sandbox returned to `Ready`.
- Its login shell still reported `SQLITE_TMPDIR=/tmp`, and the legacy approvals JSON was absent.
- The Gateway health connection was unavailable (`curl` exit 7); no Agent execution result was established.
- ClawShell `/api/auth/setup-status` returned HTTP 200. Reloading its page displayed the login form; browser control was handed back for login.
- The completed Hadolint comparison reports 12 current diagnostics and 10 baseline diagnostics. The two added informational SC2016 findings concern intentionally literal shell exports in the generated hooks. They require review; Hadolint is not reported as passing.

## Post-Restart Final Image Acceptance

After OrbStack and ClawShell recovered and the user signed in again, the existing
sandbox `oc-i3-1020e` returned `Ready`. The authenticated ClawShell page showed
sandbox `sbx-89fcefe9` using private blueprint
`openclaw-i3-sqlite-shell-20261020`. Docker inspection confirmed that its running
container used the final candidate image
`sha256:33ff039f83cdb325eb12c62a1f3a710f3212a47a9b1d1287c5986c8544893633` and
OCI `SQLITE_TMPDIR=/tmp`. The sandbox login shell also reported `/tmp` without
an environment override, and `/sandbox/.openclaw/exec-approvals.json` was absent.

ClawShell Start returned HTTP 200 and the Gateway health endpoint returned
HTTP 200. The authenticated UI terminal ran
`openclaw agent --session-id issue3-image-after-restore-20261020 ...`; the
Agent transcript in `openclaw-agent.sqlite` records the requested `exec` tool
call, `isError=false`, `status=completed`, and `exitCode=0`. The output included
the unique marker `ISSUE3_IMAGE_EXEC_OK_20261020`. A read-only
`openclaw approvals get --json` returned exit 0 and the SQLite path
`~/.openclaw/state/openclaw.sqlite#exec_approvals_config`; the approval row was
absent and no legacy warning appeared.

For restart verification, the sole process whose `/proc/<pid>/comm` was
`openclaw-gatewa` was PID 652. Sending that process SIGTERM made the health
check unavailable. ClawShell Start then returned the Gateway to `running`; its
health endpoint returned HTTP 200 and the new Gateway PID was 3358. The second
UI-terminal Agent run used the unique marker
`ISSUE3_IMAGE_RESTART_EXEC_OK_20261020`; its SQLite transcript records the
`exec` tool as completed with `isError=false` and `exitCode=0`. A second native
approvals query again returned exit 0, the SQLite path, and no legacy warning.
The Gateway log contained zero legacy approvals warnings after restart. No
`SQLITE_TMPDIR` override was used in either Agent check.

This verifies the rebuilt image across Gateway start, Agent exec, and process
SIGTERM followed by Gateway Start. ClawShell's Stop endpoint was not used: its
separate SQLite lock-file defect is tracked in ClawShell issue #157. This live
acceptance was performed before a task commit because the checkout signing key
was not configured at the time of acceptance. The source under test is the dirty worktree based on
`163de2d5c`, bound to Dockerfile diff SHA-256
`e70224bdd3b5c13923e2a6ec29c62819fe6246f0e395a61ab15bb5d21cdc9ada`.

Credential-free result summary: `/private/tmp/issue3-sqlite-tmpdir-image-20261020/shell-hooks/final-live-acceptance.json`.
The local candidate image was not published.

### Final Acceptance Status

The final image's fresh-sandbox Gateway startup, approval-state query, no-legacy
warning, and Agent execution before and after process restart passed without a
temp-directory override. On 2026-10-21, the user requested separate tracking of
unrelated failures in fork issue #4 and approved continuing from both phase
checkpoints. Signed implementation commit `7fa6bb8b5` records matching
executable Dockerfile content; only Hadolint comments differ from the source
used by this live run. The fork maintainer approved a PR-specific waiver for
the four reproduced baseline hook failures. No new build or live run is
claimed. See [verification.md](verification.md#committed-source-binding).
