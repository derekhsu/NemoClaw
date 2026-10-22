<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# CI Baseline Repair Handover (October 03, 2026)

## Scope and Branch Boundary

The baseline repair uses branch `codex/nemoclaw-ci-baseline-repair`, based on commit `fe7c2794b21cef690f2b553bdc396492cc25e958`.
Local commit `020403f05` records `ci: repair fork checks and Hermes PR base validation`.
The commit has not been pushed.
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

The earlier corrected local build completed successfully using the reviewed 0.20.6 base.
That build preceded the browser patcher digest and workflow changes in local commit `020403f05`.
Its image and runtime results do not validate an image built from that commit.
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
The source VM was running at copy time; the reason it had restarted is unknown.
This repair task did not start it again for the copy.

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
The local `git commit --signoff` operation succeeded for `020403f05`.
It produced no hook execution output, so this checkpoint does not claim that normal hooks passed.
`git fetch origin main` completed successfully.
The first `validate:pr` attempt reported a missing `.prek-hook.json` and `end-of-file-fixer` early EOF with the original tool cache.
A second attempt with a fresh external `PREK_HOME` still reported early EOF.
The log lists 3,536 files in `origin/main...HEAD` and records the failure while priority-0 native fast-path fixers ran in parallel.
The root cause is not established.

The complete PR validation did not finish; commitlint and pre-push checks were not reached.
Running `end-of-file-fixer` with `PREK_NO_FAST_PATH=1` passed on three new source and test files.
That focused result does not replace the complete PR checks.
Hook-generated patch context whitespace and test trailing-blank changes were precisely restored.
At that checkpoint, only this handover remained modified.
The original cache was preserved, and the new tool cache is `/Volumes/DS72/VMs/openshell-012/tmp/prek-ci-baseline-20261004`.

Before publication, complete `validate:pr` and satisfy the repository's signing requirements under `AGENTS.md`.
No push, GitHub write, candidate image publication, OpenShell deployment, or full ClawShell end-to-end success is recorded for the baseline commit.
The actual OCI integration and full CI gate remain incomplete.
The independent reviewer successfully executed a review during the resumed work.
The reviewer independently passed 60 targeted tests in 34.05 seconds.
The fork workflow test formatting repair is complete and included in the final 71-test matrix.
The final independent writer review is complete: `docs-updated`, agent `Codex Desktop`.
The reviewer reported no blocking code or documentation findings.
The review receipt does not supply the still-missing runtime evidence for actual OCI export and final-image named-context integration.
The local evidence is a checkpoint, not a completed final handoff.

## PR Check Continuation (October 04, 2026)

OrbStack now reports Running, and Docker reports version 29.4.0 with the overlayfs storage driver.
This status does not verify recovery of existing sandbox data or resolve the previously recorded BTRFS corruption.
The earlier image and OCI limitations remain applicable until their actual verification completes.

The native EOF hook ran alone, within the complete check, and through five parallel and five serial priority-0 reruns without reproducing early EOF.
The earlier failure's root cause remains unknown.
These reruns do not establish that the EOF issue was repaired.

The subsequent full pre-commit run reached these failures:

- `trailing-whitespace` changed whitespace used as patch context.
- A test file contained a trailing blank line.
- Repository architecture budgets, Hadolint, and source-shape budgets rejected the current branch.

The new `test/precommit-patch-preservation.test.ts` first failed against the real built-in hook because it deleted patch context whitespace.
The minimal repair adds `\.patch$` to the `trailing-whitespace` exclusion while preserving the signature exclusion.
The behavioral test also checks that ordinary TypeScript whitespace is still corrected.
The old Hermes test's trailing blank line was removed.
The two-file targeted suite passed all nine tests in 1.93 seconds after the publisher test refinement.
Native whitespace, EOF, and mixed-line-ending hooks passed on six files: the hook config, both new tests, the old Hermes test, and two actual Hermes patches.
Those hooks produced no automatic file changes and did not reproduce early EOF.
Architecture budgets and the reviewed audit gate remain unchanged.
No full validation success is claimed in this continuation.

`npm ci --ignore-scripts --no-audit --no-fund` installed 81 missing plugin packages from the existing lockfile using an external cache.
With `PREK_MAX_CONCURRENCY=1`, all four pre-push hooks passed in the original worktree.
Those hooks check the plugin build, JavaScript configuration typing, CLI TypeScript, and CLI version tags.
The single-commit commitlint check passed for `020403f05`.
Commitlint against the full `origin/main` comparison still rejects existing commits with long bodies or headers.
No history rewrite was performed to bypass those findings.

The fork workflow publisher test now executes the configured condition in a subprocess and checks whether the artifact publication side effect occurs.
It no longer asserts the raw condition text.
The source-shape findings decreased from six to five.
The remaining findings are two legacy cases in `test/hermes-api-profile-guard.test.ts` and three in `test/hermes-local-uploader-image-contract.test.ts`.
Neither the fork workflow test nor the new patch-preservation test appears among those findings.
The source-shape budget remains zero, so the overall check still fails.
The complete `validate:pr` gate has not passed, and the early EOF root cause remains unknown.

### Complete Check After the Hook Repair

A complete diagnostic `validate:pr` run in a disposable copy exited with status 1 and did not reproduce early EOF.
Its log is `/Volumes/DS72/VMs/openshell-012/tmp/prek-pr-check-3evwhldh/validate-pr-after-fix.log`.
Whitespace, EOF, and mixed-line-ending hooks passed.
Repository architecture budgets, Hadolint, and the five legacy source-shape findings still failed.
Formatters also changed nine files in that diagnostic copy.

Only the formatting correction for this baseline's `scripts/checks/resolve-hermes-pr-source-base.sh` was carried back to the original worktree.
`shfmt -bn` moved `||` continuations without changing the resolver's behavior.
Its actual shfmt and ShellCheck hooks passed.
The other eight legacy formatter changes were not applied to the original worktree.

After the latest test changes, CLI TypeScript and version-tag pre-push hooks passed again.
Plugin and JavaScript configuration hooks skipped because their inputs were outside the changed-file scope; the earlier four-hook pass remains recorded.
At that checkpoint, the original worktree contained six modified or new files.
Those changes had not been committed or pushed.
The final three-file regression rerun passed all 15 tests in 1.91 seconds.

## Source-Shape Behavior Test Refinement (October 04, 2026)

The user approved replacing the five remaining source-shape cases with behavioral tests.
The production implementation was not changed for this refinement.
The source-shape check now passes across the repository.
It reports zero source-shape cases, assertions, and files, with the budget still zero.
The existing exception count remains 116, with zero invalid exceptions and no new exceptions.

### API Profile Behavior

The bootstrap test snapshots the default config, environment, and anchor before bootstrap, then compares their bytes afterward.
The dashboard test executes the actual route-selection, prepare, and seed functions from `start.sh`.
Two separate runs change the API model and environment configuration.
The test checks that dashboard configuration updates, `API_SERVER_KEY` is not copied, and the default profile remains unchanged.

The first execution failed because the test's API policy fixture omitted production routing requirements.
The fixture was completed to match that contract; production code was not changed.

### Offline Uploader Behavior

Four behavior cases replace the uploader source-shape assertions.
The installation fixture executes the Dockerfile payload COPY, final-stage COPY, and RUN steps against temporary paths.
Package-manager and root ownership operations use fixture substitutes; real `chmod` and `find` exercise the installation boundary.
FastMCP and HTTP dependencies use test substitutes.
The fixture maps GNU find's `/022` permission expression to BSD find's `+022`, and maps root ownership to the fixture uid.
This host fixture does not establish real root ownership.
The fixture injects package installation exit status 12 and verifies that assembly stops before ownership and permission changes.

The actual GatewayClient source runs against captured HTTP requests.
The test prevents debug writes and socket probes.
It checks stdout, stderr, and root logger output for synthetic credential leakage.

The MCP transaction loads the production credential manifest.
It rejects `GATEWAY_API_KEY`, `GATEWAY_CUSTOM_TOKEN`, and `OPENSHELL_TLS_KEY` as ordinary MCP token references.
It accepts the fixed uploader's declared credential placeholder.
That result does not permit arbitrary raw Gateway keys in MCP environment configuration.

### Installed Image Evidence and Test Results

Additional verification used the already built `f61fd9486ff230f3535e1035d208074baee74fced73745ad77b809155c328741` image.
A disposable network-disabled container with a read-only root filesystem checked the installed entrypoint, server name, executable paths, root uid, and modes.
The installed tree had zero unsafe writable entries.
Installed GatewayClient and server SHA-256 values matched the current source.

The actual installed client executed one signed-link request through `httpx.MockTransport`.
Missing credentials were rejected, and synthetic credentials did not appear on stdout.
These installed-image checks passed.
Their log is `/Volumes/DS72/VMs/openshell-012/tmp/hermes-uploader-installed-behavior-20261004.log`.

The first five-file matrix passed 83 tests in 9.82 seconds.
The final five-file matrix passed all 83 tests in 12.58 seconds after the payload and final-stage COPY replay improvements.
CLI TypeScript, version-tag synchronization, and `git diff --check` also passed.
At this refinement checkpoint, the worktree contains ten modified or new files; the refinement changes are not committed or pushed.
The installed-image result does not establish a newly built image, deployment, model inference, or completed OCI pipeline.
No image build, push, or deployment was performed for this refinement.

## Architecture and Dockerfile Check Continuation (October 04, 2026)

The architecture check reproduced four findings:

| File | Observed fan-in | Recorded limit |
|---|---|---|
| `src/lib/adapters/docker/index.ts` | 44 | 43 |
| `src/lib/adapters/docker/run.ts` | 21 | 20 |
| `src/lib/cli/nemoclaw-oclif-command.ts` | 108 | 106 |
| `src/lib/core/shell-quote.ts` | 25 | 26 |

The shell-quote finding is a request to lower its recorded budget to the already reduced fan-in.
The image build service now imports the existing image and inspection adapters directly.
Image push uses a thin wrapper for the existing Docker command in the image adapter.
The wrapper preserves the command's stdio and status behavior.
This reduces dependencies on the Docker adapter index and run module without changing build or push behavior.
The shell-quote budget decreases to 25.

The CLI contains 108 real command dependencies.
This repair will not add indirect inheritance or move commands solely to satisfy the 106 limit.
That gate remains an explicit unresolved finding.
The user has been asked whether to retain the 106 limit through a real refactor or accept 108 for the two added image commands.
No answer or budget change is recorded at this checkpoint.

Nine Dockerfile Hadolint findings were reviewed.
Required instructions preserve the scratch payload's metadata and cache boundaries, the existing sandbox/root user ABI, and a shell healthcheck.
The model `MAX_TOKENS` argument is configuration rather than a secret.
Instruction-local suppressions with specific reason comments now cover those nine findings.
The global severity and source-shape exceptions remain unchanged.

The final eleven-file matrix passed all 124 tests in 10.70 seconds.
Hadolint, ShellCheck, shfmt, Biome checks for ten TypeScript files, and `git diff --check` passed.
CLI TypeScript and version-tag pre-push hooks passed; plugin and JavaScript configuration hooks skipped because their paths were outside the changed-file scope.
The repository-wide source-shape metrics remain zero, with 116 existing exceptions and zero invalid exceptions.
The independent reviewer passed 32 tests across two files in 692 milliseconds and found no blocking code findings.

Eight legacy formatter changes were applied to the original worktree.
They contain formatting changes only.
This supersedes the earlier checkpoint where those changes had not been carried back.
The worktree contains 23 modified or new files at this checkpoint.

The complete repository gate still fails on CLI fan-in 108 versus 106.
The six repository checks after source architecture passed when run independently for diagnosis: test dist-import restrictions, createRequire budgets, Vitest membership, test-title style, live E2E unit-block restrictions, and test-registration boundaries.
Their results include 27 CLI and eight support createRequire uses, and 2,280 Vitest files across seven projects.
This diagnostic subset does not establish that the complete repository gate passed.
The final layer-import boundary check for the changed imports passed.
No complete gate, new image build, deployment, commit, or push success is claimed for this continuation.

## Authorized CLI Baseline Update (October 04, 2026)

The user explicitly approved updating the CLI fan-in baseline from 106 to 108 for the two additional image commands.
The change updates only the CLI entry in `ci/source-architecture-budget.json` for this decision.
The previously reduced shell-quote baseline remains 25, and all other architecture limits remain unchanged.

This approval supersedes the earlier unresolved 108-versus-106 decision.
The earlier gate failures remain accurate historical results.
The complete `scripts/checks/run.mts` run exited with status 0; all 13 repository checks passed against the updated baseline.
The architecture graph contains 1,655 files and 4,933 edges, with zero cycles, maximum fan-in 108, and maximum fan-out 211.
All individual pre-commit hooks on the 23 changed files passed or skipped according to their path scope.
These include gitleaks, environment documentation, source-shape, test-size, Hadolint, and repository checks.
The first complete invocation still exited with status 1, reporting `Files were modified by following hooks` while this handover was updated during the run.
That invocation is not recorded as a complete pre-commit pass.
A rerun against stable files is required before claiming the complete invocation passed.

No full hosted CI, new image build, deployment, commit, or push success is claimed for this baseline decision.

After documentation writes stopped, the stable pre-commit rerun over all 23 changed files exited with status 0.
Every applicable hook passed; hooks outside the changed-file scope skipped.
This result covers local pre-commit checks and does not establish complete PR CI, a new image build, or deployment.

## New Source Image Build (October 05, 2026)

The user requested a new Hermes image build.
The first attempt used Linux amd64 and the uncommitted baseline worktree at source commit `020403f05`.
A later attempt used native Linux arm64 on the aarch64 Docker host.
At the start of the attempt, that worktree contained 23 modified or new files.
The build must therefore be identified by its source receipts as well as the commit.

The intended workflow builds `agents/hermes/Dockerfile.base` into a local OCI layout without provenance or SBOM attestations.
The repository resolver requires the exported digest and Linux amd64 platform before the final Dockerfile consumes it through the named build context.
It is not applicable to arm64; the prepared native verification uses equivalent manifest/config byte checks and requires arm64.
The artifacts are saved under `/Volumes/DS72/VMs/openshell-012/tmp/hermes-image-20261005-cnhq3c43/`.

### OpenSSL Development Package Conflict

The first source-base build failed with APT exit status 100.
Pinned `libssl-dev=3.5.7-1~deb13u2` requires the matching runtime revision, but APT selected the Debian Security `deb13u3` runtime.
The conflicting revisions prevented dependency resolution.

The actual pinned Node amd64 container's package policy and simulated install confirmed that development revision `deb13u3` resolves.
The official Debian Security development package SHA-256 is `c5f5f0383cac45209fefe85b3c3308e5ef6743663597d89bedcb96aaa06b8342`.
Its September 29 changelog records additional security fixes.
The review log is `openssl-package-review.log` in the build artifact directory.

Only the Hermes base Dockerfile's development package pin changed from `3.5.7-1~deb13u2` to `3.5.7-1~deb13u3`.
The native security package build consumes OpenSSL headers when compiling libssh2.
The runtime remains in the OpenSSL 3.5.7 series.
The pin remains exact, with no runtime downgrade or new exception.
OpenClaw and Deep Agents base files were not changed without a reproduced failure in those builds.

### Architecture-Specific Build Results

The amd64 retry passed the libssh2 native package build after the OpenSSL pin correction.
It then failed the complete upstream Perl suite: 2,933 files, 1,391,109 tests, and seven failed cases.
Six failures were in `op/magic.t` process-view checks, and one was `threads/join.t` case 11.
The Perl build step exited with status 2 before OCI export.
Its log is `source-base-build-retry.log`.

The Docker host is aarch64, so the amd64 build uses cross-architecture emulation.
Emulation is an evidence-backed explanation to investigate, not a confirmed root cause for every failed test.
The thread join failure's cause remains unknown, and the original amd64 CI build remains unresolved.
No upstream test was skipped.

The native arm64 attempt passed the complete Perl suite: 2,933 files and 1,391,187 tests in 91 seconds.
Both `threads/join.t` and `op/magic.t` passed.
This result does not resolve the amd64 failures.

The native base then failed at stage 2, instruction 21 of 28, while downloading the exact Hermes `v2026.8.27` archive.
GitHub returned HTTP 429 from `https://github.com/NousResearch/hermes-agent/archive/refs/tags/v2026.8.27.tar.gz`.
Curl exited with status 22 at the Dockerfile's archive download line 445; the build wrapper exited with status 1.
The log is `arm64/source-base-build.log`.
The GitHub access failure stopped further attempts; no retry, alternate source, or bypass was used after that failure.

### Final Validation Boundary and Next Step

The focused two-file matrix passed all 12 tests in 2.84 seconds.
Two pre-existing base Dockerfile Hadolint `DL4006` warnings remain.
The earlier final Dockerfile Hadolint result does not establish that the base Dockerfile passed.

The final source checkpoint contains 24 modified or new files at commit `020403f05`.
Only the Hermes OpenSSL development package pin changed in production source for this build attempt.
The native final-build and installed-probe runners were prepared outside the checkout but were not executed.
The probe targets installed module paths because build-only uploader source under `/opt` is intentionally removed.

No native OCI layout was exported and no final image was built.
Docker inspection of `clawshell-hermes-baseline-verify:20261005-arm64` reported no such image.
No installed-image probe, deployment, hosted CI, commit, push, or image publication was completed for this attempt.

After the GitHub rate limit is removed, resume the native base build, verify the actual OCI manifest/config bytes and platform, and build the final image through its exact named context.
Then run the installed-image verification against that new image.
Retain the separate unresolved amd64 failure and the existing sandbox data recovery limitations.

## Manual Native Candidate Validation (October 05, 2026)

The user explicitly requested another local build attempt after the GitHub archive download failure.
That attempt downloaded and verified the archive, then completed all 28 base build steps.
OCI export failed when the Docker daemon could not read a blob because of an input/output error, followed by EOF.
The build wrapper exited with status 1.
Its log is `arm64/source-base-build-user-retry.log` in the October 05 build artifact directory.

After the user restarted OrbStack, another attempt failed during OCI export with the same blob input/output error and EOF.
The restarted attempt's wrapper also exited with status 1.
Its log is `arm64/source-base-build-orbstack-restart.log`.
Neither attempt produced an exported OCI layout or a new final image.
Docker availability after restart does not establish recovery of existing sandbox data.

The user authorized GitHub Actions validation and candidate publication to their Docker Hub repository.
The new reusable workflow is `.github/workflows/hermes-image-validation.yaml`.
Its manual entry point is the existing `Images / Hermes Local Uploader` workflow, `.github/workflows/hermes-local-uploader-image.yaml`.

Select the baseline branch when dispatching that workflow.
Set a `candidate-` prefixed `tag`, such as `candidate-baseline-20261005`, and set `validate_candidate=true`.
Set `publish_candidate=true` only for the authorized candidate publication.
Either boolean selects the candidate path; `publish_candidate=true` therefore also requires validation.
Both inputs default to false; leaving both false selects the existing publication path that updates release aliases.
The candidate path rejects `latest` and `hermes-*` tags.

The candidate workflow performs these operations:

- Build the branch's Hermes base Dockerfile on native `ubuntu-24.04` amd64 and `ubuntu-24.04-arm` arm64 runners.
- Verify the exported OCI descriptor, manifest bytes, config bytes, and requested platform before consuming the exact named context.
- Load the final image and run `test/support/hermes-installed-uploader-probe.py` with network access disabled and a read-only container root.
- Save the compressed Docker image archive, archive checksum, image inspection, source commit, build metadata, build logs, and probe JSON.

The resolver's platform argument now supports `linux/arm64`; its default remains `linux/amd64`.
The installed probe checks actual installed imports, source hashes, root ownership, permissions, executable entry point, and reserved credential names.
It uses `httpx.MockTransport` and a synthetic credential to test signed-link requests, missing-credential rejection, and absence of credential output.
It does not test a real Gateway or model request.

The validation jobs do not reference Docker Hub secrets or perform Docker Hub login or publication.
When publication is enabled, separate platform publication jobs start only after the complete validation matrix succeeds.
They download the verified image archives, check each archive checksum, and compare the loaded image ID with its saved inspection.
Those jobs read the fork's `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` Actions secrets for Docker Hub login.
They publish `docker.io/derekhsu/openshell-hermes:<tag>-<run-id>-<attempt>-<arch>`.
The final publication job creates `docker.io/derekhsu/openshell-hermes:<tag>-<run-id>-<attempt>` only after both platform publication jobs succeed.
A platform publication failure can leave the other platform's intermediate tag without a final candidate tag.
The candidate path does not update `latest` or Hermes release aliases.
Platform digest receipts and the published manifest are saved when their respective publication steps succeed.
Workflow artifacts are retained for three days.

The focused four-file matrix passed all 28 tests in 1.83 seconds: six candidate workflow cases, ten resolver cases, and 12 native/dependency cases.
Actionlint passed for both workflows, and Hadolint passed for the Hermes base Dockerfile.
The base Dockerfile now has two instruction-specific `DL4006` comments for the expected-zero grep count and checksum pipeline.
These comments replace the earlier base warning status without changing global lint severity.
The pre-commit run over seven new or updated implementation files was still running at this documentation checkpoint.
Commit, push, dispatch, and hosted results will be recorded separately after they occur.
The workflow implementation has not yet established hosted build, probe, publication, or deployment success.

## Hosted Candidate Failure and Offline Dependency Repair (October 05, 2026)

GitHub Actions run `37258832319` completed with failure on both native architectures.
Both native base builds passed, and both exported OCI layouts passed descriptor, byte-digest, and platform verification.
The native amd64 base result supersedes the unresolved amd64 base outcome from local cross-architecture emulation.
It does not establish complete CI or final-image success.
The amd64 job log is `ci-37258832319/amd64-job.log` under the October 05 build artifact directory.
The arm64 artifact contains its `base-build.log`.

Both final-image builds failed because the offline Teams capability installer lacked `pydantic-settings>=2.11`.
The installer failed at build stage 52, but that `RUN` instruction did not enable shell failure propagation.
A later Python version check returned zero and masked the installer's failure status.
The package metadata check then failed at stage 56.
The workflow did not reach installed-image verification or publication.
The publication dependency gates prevented Docker Hub secret use and image publication.

The repair adds the universal `pydantic_settings-2.11.0-py3-none-any.whl` to the Hermes Dockerfile's checksum-pinned offline payload.
Its SHA-256 is `fe2cea3413b9530d10f3a5875adffb17ada5c1e1bab0b2885546d7310415207c`.
The official wheel metadata requires `pydantic>=2.7`, `python-dotenv>=0.21`, and `typing-inspection>=0.4`.
The base already contains compatible versions `2.13.4`, `1.2.2`, and `0.4.2`, respectively.
The wheel review JSON is preserved outside the checkout.
The repair also adds `set -eu` to the affected `RUN` instruction so installer failure stops the build.
Offline installation remains required, and the bundled Hermes version is unchanged.

The regression executes the actual `RUN` payload with an installer fixture that exits with status 23.
Before the fix, the payload returned zero; after the fix, it returned status 23.
The focused three-file matrix passed all 20 tests in 1.76 seconds.
These local results do not establish a repaired hosted final image, installed-image probe, publication, or deployment.

## Published Native Candidate (October 05, 2026)

The user resumed the task after the pause.
[GitHub Actions run 37260118925](https://github.com/derekhsu/NemoClaw/actions/runs/37260118925) completed successfully.
Both native validation jobs built the source base and final image, verified the OCI base, and passed the actual installed-uploader probe.
Both platform publication jobs and the final manifest publication job succeeded.

The image source commit is `048301c984c432b43f89f9aeba0b83c5a7742154`.
The published candidate is `docker.io/derekhsu/openshell-hermes:candidate-baseline-20261005-37260118925-1`.
Registry inspection confirmed these digests:

- Multi-architecture manifest: `sha256:52984ca08cfc37d9affe664d26e1a300d17f476d92a1014b659f513f7c309967`.
- Linux amd64 image manifest: `sha256:8c8e8a024c86105cd4f1d60758f822192395edf1aafae86fa292cb953f228f06`.
- Linux arm64 image manifest: `sha256:e3a1800f20e93687ad72a1ca32f13d6b24fb8ef27923562eafabd7ba36ed3b13`.

The downloaded manifest receipt is `/Volumes/DS72/VMs/openshell-012/tmp/hermes-image-20261005-cnhq3c43/ci-37260118925-manifest/manifest.json`.
The candidate publication did not update `latest` or Hermes release aliases.
The installed probes use synthetic credentials and `httpx.MockTransport`; they do not establish real Gateway or model connectivity.

The primary agent ran `bun run docs`, which exited with status 0.
Published-route checks passed, and Fern reported zero errors and two warnings.
Generation left that checkout's Git status clean.

This documentation checkpoint will be committed separately after image publication.
That later documentation-only commit does not change the image source commit or imply that the image was rebuilt.
Complete CI, CodeQL, and sandbox deployment verification remain incomplete.
The candidate image pipeline does not establish recovery of existing local sandbox data.
