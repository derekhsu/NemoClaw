<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Issue #3 Implementation Evidence

## Revision and Scope

- Starting commit: `163de2d5c` on `issue/3-exec-approvals-json`, created from
  `feat/image-only-cli`. The implementation remains uncommitted.
- Local verification date: 2026-10-20, on macOS arm64 with Node.js 24.15.0.
- The derived image removes only zero-byte regular legacy exec approvals files
  after the existing file-type and link checks. Nonempty files retain their
  contents and existing ownership and mode repair.
- The base image no longer creates the legacy placeholder. OpenClaw owns
  SQLite initialization, policy decisions, and legacy policy migration.
- This repair changes no dependency version or runtime approval default.
- Both runtime images now set `SQLITE_TMPDIR=/tmp`. This selects a directory
  already writable under the sandbox filesystem policy; the policy is unchanged.

## Completed Checks

The new missing-file and zero-byte cases failed before the Dockerfile repair.
The updated base-layout and derived-layout expectations also failed before it.
They pass after the repair.

```bash
npm exec -- vitest run --project integration \
  test/openclaw-state-file-repair.test.ts \
  test/sandbox-provisioning.test.ts \
  --testNamePattern='legacy exec approvals|OpenClaw migration|before changing its inode|unified .openclaw layout'
```

Result: 17 passed, 54 skipped by the explicit title filter, across two files.
The tests execute the Dockerfile shell blocks against temporary filesystem
fixtures. Ownership operations are logged rather than performed as root.
They cover missing and zero-byte files, repeated repair, nonempty JSON,
malformed data, whitespace, SQLite companion files, symlinks, hard links,
and directory targets. SQLite preservation uses byte fixtures; it does not
open a real SQLite database or start a gateway.

Other completed checks:

- `npm exec -- biome lint test/openclaw-state-file-repair.test.ts`: passed.
- `git diff --check`: passed before final evidence updates.
- `npm run docs`: passed with 0 errors and 2 warnings. This includes generated
  guide variants and published-route checks.
- Contributor setup previously completed dependency installation, CLI and
  plugin builds, type checks, and Git hook installation. Its doctor reported
  20 passing checks and 3 failing checks, listed below.

## SQLite Temporary Directory Image Repair

The user authorized this addition on 2026-10-20. Both the base and derived
runtime stages declare `SQLITE_TMPDIR=/tmp`. The derived declaration also
covers a previously published base that does not provide it.

Two environment regression tests failed before the change: replaying either
final stage left the inherited value `/var/tmp`. After the change, the tests
observe `/tmp` in the child process. The focused command now reports 19 passed
and 54 skipped across two files:

```bash
npm exec -- vitest run --project integration \
  test/openclaw-state-file-repair.test.ts test/sandbox-provisioning.test.ts \
  --testNamePattern='SQLite temporary files|legacy exec approvals|OpenClaw migration|before changing its inode|unified .openclaw layout'
```

`npm exec -- biome check test/sandbox-provisioning.test.ts
test/openclaw-state-file-repair.test.ts` passed with no changes required.
The documentation author ran `npm run docs`: 0 errors and 2 warnings, with the
OpenClaw variant updated and the other agent variants unchanged. Its log is
`/private/tmp/nemoclaw-issue-3-sqlite-docs.log`.

Both local arm64 builds exited 0 and were not published:

- Base: `local/openclaw-issue3-base:20261020-sqlite-tmp`, image identifier
  `sha256:d43d1767c13b6038c4e86ec4d02c7d944f0635be8452f0d4b3f5b03f847c7d4c`.
- Derived: `local/openclaw-issue3:20261020-sqlite-tmp`, image identifier
  `sha256:6369cd6dc12e15d7b60400bbf3647110d69e405f522d765bb23481ffdd934eed`.

The derived build intentionally used the earlier
`local/openclaw-issue3-base:20261020`, whose metadata lacks `SQLITE_TMPDIR`.
Image inspection confirms that both rebuilt images provide `/tmp`.
The Dockerfile diff SHA-256 is
`38b7aac0c5979ba0917057f1b4d073de31cfad807812b462e0cd78833059784d`.
The source remains uncommitted at the starting commit listed above.

An isolated candidate container, with networking disabled and no environment
override, initialized the installed OpenClaw Agent schema with incremental
auto-vacuum. It reported `SQLITE_TMPDIR=/tmp`, SQLite `3.51.3`, and `PASS`.
The first run printed this result but Docker returned exit 125 with an
`unexpected EOF` while waiting for container exit. The repeat completed with
exit 0. The successful repeat is the completed container evidence.

Hadolint reports the same 10 diagnostics as the unmodified starting-commit
Dockerfiles, with exit 1 in both cases. No new diagnostic was introduced.
The comparison is saved as `hadolint-comparison.json`.

Build logs, source patch, metadata, and container results are under
`/private/tmp/issue3-sqlite-tmpdir-image-20261020/`.
That ENV-only image was subsequently tested after the user logged in. It
required a shell environment follow-up, recorded below. The earlier
process-environment workaround remains historical evidence.

## OpenShell Shell Environment Follow-up

The ENV-only image did not complete fresh acceptance: OpenShell exec omitted
its OCI environment. The final Dockerfile change also supplies the existing
login and interactive shell hooks with a default of `/tmp` when
`SQLITE_TMPDIR` is unset or empty, after loading runtime-provided values.

Three generated-hook tests failed before this change. After it, the focused
command above reports 20 passed and 54 skipped. The separate command
`npm exec -- vitest run --project integration test/clean-runtime-shell-env-shim.test.ts`
reports 5 passed. Biome check passed for both changed test files. The docs
build again completed with 0 errors and 2 warnings.

The final candidate `local/openclaw-issue3:20261020-sqlite-shell` and matching
base build both exited 0. After OrbStack recovery and ClawShell re-login, the
fresh sandbox `oc-i3-1020e` passed Gateway and Agent checks before and after
process SIGTERM and Gateway Start, without a runtime temp-directory override.
The shell reported `SQLITE_TMPDIR=/tmp`; native approval queries returned the
SQLite path, exit 0, no approval row, and no legacy warning. The legacy JSON
was absent. Agent transcript events show `exec` completed with `isError=false`
and `exitCode=0` both times. The restart health check returned HTTP 200, and the
Gateway log contained zero legacy approval warnings. Detailed identifiers and
scope are in [live-acceptance.md](live-acceptance.md#post-restart-final-image-acceptance).

The ClawShell Stop endpoint was not used because its SQLite lock-file issue is
tracked separately as issue #157. The worktree source was uncommitted during
acceptance; the signed task commit and commit-bound acceptance record remain
pending. The 2026-10-21 finalization section below records the subsequent
scope decision, signing configuration, user approval, and hook results.

## Documentation Writer Review

- Result: `docs-updated`; surface: `Codex`.
- An independent documentation writer reviewed both Dockerfiles, both changed
  test files, `docs/manage-sandboxes/workspace-files.mdx`, `conductor/tracks.md`,
  and every file in this track. The review covered writing rules,
  documentation style, and the generated OpenClaw page, with no blockers.
- This receipt covers the uncommitted implementation diff. A committed-revision
  receipt and any required PR metadata remain pending until a commit exists.
- An incremental independent review also covered `live-acceptance.md` and the
  updated `verification.md` and `plan.md`. Result: `docs-updated`; surface:
  `Codex`; no blockers. It confirmed the source and image identifiers against
  saved artifacts and reviewed the boundary between native checks and blocked
  ClawShell integration acceptance.

- A further independent review covered the MCP wheelhouse repair and second
  sandbox attempt in `live-acceptance.md`: `docs-updated`, surface `Codex`,
  no blockers. It confirmed that Gateway, Agent, and restart checks remain
  incomplete. The temporary investigation summary was updated to reflect the
  subsequent provisioning attempt.

- The inference-blueprint follow-up and `plan.md` evidence update received
  independent documentation review: `docs-updated`, surface `Codex`, no
  blockers. The review distinguished the first successful Gateway start from
  the failed Agent tool check, ClawShell Stop, and subsequent startup.

- The SQLite temp-directory investigation and workaround received independent
  documentation review: `docs-updated`, surface `Codex`, no blockers. The
  review checked the saved runtime results and the distinction between a
  process-environment workaround and a persistent image fix. Its wording and
  source-link suggestions were applied.

- Independent review of the completed image temp-directory source, tests,
  public docs, and updated track evidence returned `docs-updated`, surface
  `Codex`, with no blockers. A follow-up review confirmed the corrected
  progress text and kept fresh sandbox acceptance pending.

## Additional Test Failures

The complete provisioning test file reported two unrelated failures before
the Dockerfiles were edited:

- `exercises the staged plugin install with the offline lock still applied`:
  its expected `openclaw plugins install /opt/nemoclaw` marker is absent.
- `runtime hardening installs procps and e2fsprogs when a stale base lacks ps and chattr`:
  the shell fixture exits with status 1.

An additional run included `test/openclaw-integrity-pin-base.test.ts` and
`test/openclaw-integrity-pin-contract.test.ts`, using the title filter above
plus `integrity pin`. It reported 50 passed, 54 skipped, and 2 failed:

- `keeps the advisory review note aligned with the committed OpenClaw pin`:
  the dependency review lacks the exact expected phrase
  `must be re-verified against the 2026.9.2 dist` with the version in backticks.
- `rejects legacy fixture pins unless stale-upgrade fixture mode is explicit`:
  the allowed legacy base fixture exits with status 2.

The dependency review is unchanged. The legacy install shell block extracted
from `Dockerfile.base` is byte-identical to the block at the starting commit
after the test helper's comment removal and continuation normalization.
These observations do not establish a passing legacy fixture contract.
On 2026-10-21, the user requested separate tracking for failures not caused by
this repair. They are recorded in
[fork issue #4](https://github.com/derekhsu/NemoClaw/issues/4).
Task 1.4 now records the changed behavior's passing tests and discloses the
existing failures. No unrelated test or dependency-review repair is included.

## Fork PR Finalization: 2026-10-21

The user authorized continuation and specified that the PR must target
`derekhsu/NemoClaw`, with base `feat/image-only-cli`. No upstream write is
authorized. The user approved proceeding after reviewing the recorded
implementation and live acceptance results. Both manual Conductor checkpoints
record that approval without claiming additional user-executed tests.

The user selected `~/.ssh/id_ed25519.pub` and reported registering it as a
GitHub Signing Key. Repository-local Git now sets `gpg.format=ssh`,
`user.signingkey=/Users/derekhsu/.ssh/id_ed25519.pub`, and `commit.gpgsign=true`.
The SSH agent lists the matching key. An isolated `ssh-keygen -Y sign` and
`ssh-keygen -Y verify` probe succeeded for `derekhsu@hotmail.com`. This verifies
local signing, not GitHub's verification of a pushed commit. No key was
generated, and no private-key content was read or published.

The three affected provisioning/state/shell test files reported 77 passed and
2 skipped. Only the two existing provisioning failures from issue #4 were
excluded:

```bash
npm exec -- vitest run --project integration \
  test/openclaw-state-file-repair.test.ts \
  test/sandbox-provisioning.test.ts \
  test/clean-runtime-shell-env-shim.test.ts \
  --testNamePattern='^(?!.*(?:exercises the staged plugin install with the offline lock still applied|runtime hardening installs procps and e2fsprogs when a stale base lacks ps and chattr)).*$'
```

The first normal commit attempt failed its pre-commit hooks. No commit was
created. The failures were repository source architecture, source-shape test
budget, test-file size budget, and Hadolint. The first three name files and
budgets unchanged by this repair. Baseline checks use a separate archive of
`163de2d5cf975db672b1a44ba0892d279be31ca1` with the installed dependencies.
All three baseline commands exit 1 with the same findings: four source
architecture violations, three source-shape cases in the uploader image test,
and 1922 lines against a 1909-line budget in the OpenClaw config test.
Fork issue #4 now includes these baseline failures and the Hadolint findings.

Hadolint initially reported 12 diagnostics, including two new SC2016 findings.
Both concern expressions intentionally written literally into generated shell
hooks. The two existing RUN-specific Hadolint directives now document and
suppress SC2016. This changes comments only. Baseline and candidate Hadolint
each report the same 10 existing diagnostics and exit 1.

Before that comment-only adjustment, the Dockerfile diff SHA-256 still matched
the accepted image's recorded value:
`e70224bdd3b5c13923e2a6ec29c62819fe6246f0e395a61ab15bb5d21cdc9ada`.
After the adjustment, comparing both Dockerfiles with the saved accepted
source after removing full-line comments confirms identical executable
content. No rebuilt image or repeated live run is claimed for these comment
changes. Final commit binding remains pending until a signed commit exists.

Finalization evidence is saved locally under
`/private/tmp/issue3-pr-finalization-20261021/`.

The independent documentation review identified one claim that needed a
narrower scope: the absence of a Doctor invocation applies to this legacy-file
repair step. Existing optional-plugin build steps can invoke Doctor. The public
page and specification now state that boundary. The shell tests also cover an
explicit empty runtime value. After these corrections, the three integration
files again report 77 passed and 2 known cases skipped, and `npm run docs`
reports 0 errors and 2 warnings. The Markdown hook passes after adding the
required heading spacing in `conductor/tracks.md`.

The updated contributor doctor reports 21 passing checks, including SSH commit
signing and GitHub authentication. Two existing host checks still fail: Docker
provides 7.8 GiB against the 8 GiB minimum, and the host CLI points to another
installation. Neither setting was changed, and no new image build was run.

Independent review of all 11 candidate files and the PR draft, followed by a
review of the corrections, returns `docs-updated`, surface `Codex`, with no
remaining documentation or code-evidence blocker. The final committed-revision
receipt remains pending. This review does not waive the four existing hook
failures. The fork maintainer then explicitly approved a waiver for this fork
PR only: `repository-checks`, `source-shape-test-budget`,
`test-file-size-budget`, and `hadolint`. Fork issue #4 owns the baseline repair.
Only those four hooks may be skipped for this PR's commits; all other commit
and push hooks must run normally. The waiver changes no repository hook or CI
configuration and does not authorize skipping an unrelated failure.

## Security Review by the Implementer

| Category | Reviewed boundary and evidence |
| --- | --- |
| Secrets and Credentials | No credential input, output, or transfer added. Fixtures contain synthetic policy and state bytes. |
| Input Validation and Data Sanitization | Existing symlink, regular-file, and single-link checks still precede legacy-file deletion or permission repair. Negative tests exercise them. |
| Authentication and Authorization | OpenClaw retains policy ownership. No grant or approval default is changed. |
| Dependencies and Third-Party Libraries | No dependency or integrity pin changes. Existing installation behavior remains outside this repair. |
| Error Handling and Logging | Unsafe targets cause nonzero exit with the existing diagnostic. Tests verify the rejected target is not deleted or chmod/chown repaired. |
| Cryptography and Data Protection | No cryptographic operation changes. Nonempty policy bytes and SQLite companion bytes survive repair. |
| Configuration and Security Headers | Nonempty files retain the existing sandbox ownership repair and mode 660. No new privilege, network, or browser setting is introduced. |
| Security Testing | Focused tests run the actual Dockerfile shell operations against filesystem fixtures, including zero-byte hard links and dangling symlinks. |
| System Security | Repeated repair leaves missing legacy state absent. SQLite initialization and migration stay with OpenClaw. The build step assumes no concurrent writer, as before. |

## Remaining Gates

- Apply the fork maintainer's PR-specific waiver for the four named baseline
  hooks while running all other commit and push hooks normally. Record the
  signed commit, GitHub verification, and final documentation review receipt.
- The earlier doctor reported Docker memory below its 8 GiB minimum and a host CLI
  pointing to another installation. Neither host setting was changed.
- Refresh the documentation writer review if later implementation changes
  alter the reviewed behavior or text. The post-recovery evidence received an
  independent no-blocker review; its three consistency suggestions were applied.
- Record the signed task commit and bind its source to the accepted image
  recipe. Both manual phase checkpoints have the user's approval to continue.
- Final image live acceptance passed after OrbStack recovery: Gateway health and
  Agent exec passed before and after process SIGTERM followed by Gateway Start,
  with no temp-directory override. See [live-acceptance.md](live-acceptance.md)
  for the chronological evidence. ClawShell Stop remains out of this check
  and is tracked in issue #157.
- No image publication has run for this repair.
- No branch push or pull request was created. The user separately authorized
  creation of ClawShell issue #157 for its Gateway Stop compatibility problem.

- After OrbStack recovery, an independent documentation writer reviewed the
  updated `live-acceptance.md`, `verification.md`, `plan.md`, `spec.md`, and
  `metadata.json` against the sanitized live result artifact. Result:
  `docs-updated`; surface: `Codex`; no blockers. It confirmed the ClawShell Stop
  endpoint was not claimed as passing, the uncommitted source and missing
  signed commit are explicit, and failed fixture/test gates remain visible.
  Suggestions to advance `current_task`, clarify the committed-source boundary,
  and describe the outstanding manual checkpoint were applied.
