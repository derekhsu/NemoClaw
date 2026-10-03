<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# CI Baseline Repair Handover (October 03, 2026)

## Scope and Branch Boundary

The baseline repair uses branch `codex/nemoclaw-ci-baseline-repair`, based on commit `fe7c2794b21cef690f2b553bdc396492cc25e958`.
NemoClaw PR #1's remote source branch remains unchanged.
Any baseline publication must use a separate branch and PR.

This work restores the saved baseline repair patch and continues the image build investigation.
The restored changes include fork PR workflow conditions, Markdown formatting and relative links, a stale Hermes TUI policy fixture, and four corrupted Biome archive chunks.
The archive restoration uses the official Biome `2.4.14` package integrity rather than accepting the corrupted local bytes.

## Identified Causes and Repairs

### Fork Workflow Conditions

The maintainer-edits workflow treated a repository's fork status as proof that a PR crossed repositories.
The repair compares source and target repository names before requiring maintainer edits.
Same-repository PRs in the fork no longer trigger that requirement.

The review publisher could run after the upstream-only review job was skipped.
It then requested an artifact that the skipped job never created.
The repair limits publication to the same upstream repository and excludes a skipped review result.
It preserves the upstream-only analysis boundary.

### Documentation and Fixture Drift

The saved patch repairs Markdown spacing, heading markup, a code-fence language, and broken relative links.
It preserves historical statements.
The Hermes TUI fixture now uses the shared reasoning loader and the reviewed source identities expected by the existing patcher.

### Hermes Base Version Mismatch

The source Dockerfile pins a public base whose installed Hermes version is 0.19.0.
The image patches require the reviewed Hermes 0.20.6 source.
The current public latest base contains Hermes 0.21.3 and npm 12.0.2.
Neither public reference matches the reviewed source contract.

The local base image `nemoclaw-hermes-sandbox-base:0.20.6` has image identity `sha256:7142241115d2d0f051ee6f0e65fc1688ea4976fc0b55934a0021d9f0b36ae4eb`.
Its cron drain and gateway source hashes match the existing patch gates.
The successful candidate build uses this local base override.
No source hash gate was relaxed.

### MCP Build Capability Probe

Hermes 0.20.6 loads the MCP SDK lazily through `_ensure_mcp_sdk`.
The loader enables its Streamable HTTP capability flag.
Its SDK version is 2.0.0 and exposes `streamable_http_client`.

The attempted replacement with the older public `streamablehttp_client` interface was withdrawn.
The Dockerfile retains its original lazy loader.
The base resolver probe now calls the same loader before checking HTTP availability.
Eight capability tests cover the Dockerfile and base resolver probes for successful loading, SDK load failure, unavailable MCP support, and unavailable HTTP support.
Those tests pass.
The fork workflow and policy fixture suites pass 21 additional tests.
The image contract suite passes 13 tests.
The earlier managed-image publication workflow suite passed 18 tests before the same-branch OCI workflow changes.
That earlier matrix totaled 60 targeted tests across five files.
It does not validate the subsequently changed workflow.
These results do not establish that all CI checks pass.

### Managed PR Base Selection

The previous hosted managed-image build selected a moving latest base.
Qualification of the official immutable 0.20.6 base then exposed an incompatible security package inventory despite compatible Hermes source.
The official candidate pin was withdrawn; the Dockerfile's original default pin remains known to contain outdated Hermes source.

The revised PR workflow builds the Hermes base from `agents/hermes/Dockerfile.base` in the same branch.
BuildKit exports a local OCI directory with `tar=false`; the workflow does not push that base.
The final image consumes the exported base through a named OCI build context at its exact manifest digest.
Both PR final-image build invocations pass that build context.
Other agent builds retain their existing remote alias resolver.

`scripts/checks/resolve-hermes-pr-source-base.sh` requires one exported OCI image manifest.
It binds the index descriptor to the BuildKit export digest and verifies both manifest and config bytes against their digests.
It also requires the config to identify `linux/amd64`.
The resolver refuses an invalid or changed export before producing the named context.
Six source-base behavior cases passed.

The updated managed-image workflow suite passed all 18 tests, and the six source-base behavior cases passed.
The final combined seven-file matrix passed 71 tests in 14.65 seconds.
After `shfmt` formatted the source OCI resolver, its six focused tests passed again in 340 milliseconds.
ShellCheck, Biome checks for six changed TypeScript files, and `git diff --check` passed.
These checks cover the implementation and fixtures; they do not establish that the real OCI pipeline completed.

The single same-branch source-base build attempt stopped with curl exit code 22 after GitHub returned HTTP 429 for the Hermes archive URL.
No mirror or alternate archive URL was used for a retry.
No OCI base export was completed.
A cached OCI mechanism check did not start because the Docker socket was absent.
The real source-base OCI artifact and final-image named-context integration remain unverified because of the OrbStack BTRFS corruption.
Its log is `/Volumes/DS72/VMs/openshell-012/tmp/hermes-source-base-oci-build-20261004.log`.
No completed hosted build result is claimed.

### Public Base Qualification

The official v0.0.122 base index is `sha256:348ad969b238576eae9b4dfb26585acd5c56cf80c084503998d9428998e1505f`.
Its actual runtime reports Hermes 0.20.6 and npm 11.18.0.
The managed image build passes the npm patches and lazy MCP probe, then fails the reviewed browser source gate.
The expected browser hash is `66008422f53a218dd7be5b1f5f3573a92254b75abba6f99f84e111e03a3e1b36`.
The public base contains `b43608826bb10f9bf919ca97757bf36fc95247bd8b14fa8626a113c639cfd73e`.
The initial candidate Dockerfile and workflow pins were withdrawn after that qualification failure.
A complete source comparison found only the NPX browser version and its explanatory comment changed.
The local source uses `agent-browser@^0.26.0`; the public source pins `agent-browser@0.26.0`.
All other browser program code is identical.
The compared files are saved under `/Volumes/DS72/VMs/openshell-012/tmp/browser-base-comparison/`.

The browser-only repair accepts the separately reviewed public hash `b43608826bb10f9bf919ca97757bf36fc95247bd8b14fa8626a113c639cfd73e`.
It retains the original reviewed hash `66008422f53a218dd7be5b1f5f3573a92254b75abba6f99f84e111e03a3e1b36` and rejects unknown source hashes.
The profile policy patcher digest is repinned to `c20303e6d99fbf389422bf4e441bc865be8644b9b47eaf66f7b1a2c168807bc2`.
Five regression cases use the complete compressed local and public browser sources.
They cover acceptance of both known identities, retention of each NPX specification, rejection of trailing-newline tampering without file changes, and rejection of the browser identity for the config source kind.
All five browser source identity regression cases passed.

The repaired public-base build passed the Hermes source and database checks.
It then stopped at the completed-image security package inventory check.
The inventory comparison identified these differences:

| Package | Official base | Branch contract |
|---|---|---|
| libexpat | 2.8.3 | 2.8.2 |
| Vim | 9.2.0858 | 9.2.0782 |
| libssh2 package suffix | nemoclaw2 | nemoclaw1 |
| Python HTML parser package revision | deb13u4 | deb13u5 |
| libssl inventory entry | 3.5.7 | Absent |

The official base therefore does not satisfy this branch's full security package contract.
The qualification does not authorize accepting the inventory or bypassing the package check.
The log is `/Volumes/DS72/VMs/openshell-012/tmp/hermes-public-base-repaired-build-20261004.log`.
No successful public-base build is claimed at this checkpoint.
The failed qualification log is `/Volumes/DS72/VMs/openshell-012/tmp/hermes-public-base-build-20261004.log`.
A matching version label does not establish patch source compatibility.

## Local Image and Runtime Verification

The corrected local build completed successfully using the reviewed 0.20.6 base.
The candidate is `clawshell-hermes-baseline-verify:20261003`, with image identity `sha256:f61fd9486ff230f3535e1035d208074baee74fced73745ad77b809155c328741`.
The built platform is Linux arm64.
The build log is `/Volumes/DS72/VMs/openshell-012/tmp/hermes-baseline-build-correct-20261003.log`.

The build completed the source patch, cross-user database reopening, file metadata, and security inventory checks.
The repository's direct image harness passed stopped-container PID 1 bootstrap and the rendered sandbox hold.
It checked profile application, transaction completion, replay, changed-profile rejection, and root-only application.
Run the harness with the repository's `tsx` loader.

A disposable read-only container ran 26 permission and file race checks against the guard installed inside the new image.
All 26 passed.
The checks include API read access, write and unlink denial, administrator edits, default secret isolation, and symlink and FIFO replacement rejection.
The containers were removed after verification.
No model inference or OpenShell deployment result is claimed.

## Remaining Work and Resource Limits

The current source and fixture repairs can continue without additional user action.
A later request for account access, infrastructure restoration, or a policy decision must identify the specific blocked operation.

Use the external disk for build logs, test temporary files, and recoverable repair evidence.
Local disk and memory remain constrained.
OrbStack's logs now identify data corruption rather than an unexplained stop.
`~/.orbstack/log/gui.log` repeatedly reports `Daemon exited: data is corrupted`, including an entry at `2026-10-04 00:29:42`.
The VM log reports a Linux BTRFS error on `vdb1`: `bad tree block start`, mirror 1, expected `41567535104`, observed `11764474705647475309`.

This repair task stopped Docker writes and automatic restarts after identifying the corruption.
Protect the existing sandbox data before attempting storage recovery.
A live diagnostic preservation copy now exists at `/Volumes/DS72/OrbStack_Recovery/20261004-004308/data.img.raw`.
Its source is `/Volumes/DS72/OrbStack_Data/data.img.raw`; the source file was not modified by the copy operation.
APFS `clonefile` created the copy on the same disk using copy-on-write.
The operation receipt is `/Volumes/DS72/OrbStack_Recovery/20261004-004308/receipt.json`.
The source VM was running because another actor or process had restarted it; this repair task did not restart it for the copy.

This is a live diagnostic preservation copy, not a cold backup or verified recovery.
It preserves existing corruption and does not establish filesystem consistency or restoreability.
No storage recovery, data deletion, or sandbox recreation was performed for this checkpoint.
The corrupted storage currently blocks further local image and OCI verification.
The preserved corruption evidence is `/Volumes/DS72/VMs/openshell-012/tmp/orbstack-corruption-evidence-20261004.txt`.
The source archive HTTP 429 is a separate network failure.
Neither failure is evidence of an account-credit limit.
The backend health endpoint on port `8001` still refuses connections at this checkpoint.
No restored backend health result is claimed.

The npm security findings require a separate dependency review.
This checkpoint does not accept those findings or disable the reviewed audit threshold.
Package contract failures, static architecture budgets, and the coverage upload HTTP 404 also remain outside the completed repair evidence.

The documentation build completed with zero errors and two warnings.
No baseline commit, GitHub write, candidate image publication, OpenShell deployment, or full ClawShell end-to-end success is recorded in this checkpoint.
The independent reviewer successfully executed a review during the resumed work.
The reviewer independently passed 60 targeted tests in 34.05 seconds.
The fork workflow test formatting repair is complete and included in the final 71-test matrix.
The final independent writer review is complete: `docs-updated`, agent `Codex Desktop`.
The reviewer reported no blocking code or documentation findings.
The review receipt does not supply the still-missing runtime evidence for actual OCI export and final-image named-context integration.
The local evidence is a checkpoint, not a completed final handoff.
