<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Implementation Plan: OpenClaw Exec Approvals SQLite State

**Track ID:** `exec_approvals_sqlite_20261019`
**Spec:** [spec.md](spec.md)
**Issue:** derekhsu/NemoClaw #3
**Status:** [x] Implementation Complete

## Phase 1: Repair Image Provisioning

- [x] Task 1.1: Run the contributor environment doctor. Read the contributor
  guide and applicable image guidance before changing source.
- [x] Task 1.2: Add focused failing tests in `test/sandbox-provisioning.test.ts`
  and `test/openclaw-state-file-repair.test.ts`. Cover absent, zero-byte,
  nonempty, symlinked, hard-linked, and non-regular legacy targets. Assert
  nonempty content and existing SQLite state survive. Identify any legacy
  E2E fixture expectations before changing the Dockerfiles.
- [x] Task 1.3: Remove legacy-file creation in `Dockerfile.base` and `Dockerfile`
  for the active runtime. Remove only inherited zero-byte regular files after
  safety checks. Preserve nonempty policy and its permission repair.
- [x] Task 1.4: Run focused integration tests:
  `npm exec -- vitest run --project integration test/sandbox-provisioning.test.ts test/openclaw-state-file-repair.test.ts`.
  Run any additional existing image-contract tests affected by the diff.
  On 2026-10-21, the three provisioning/state/shell test files reported
  77 passed and 2 skipped. The two excluded cases and the previously recorded
  integrity-pin failures are tracked separately in fork issue #4 at the user's
  request. No passing full-suite result is claimed.
- [x] Task 1.5: Documentation impact is addressed and independently reviewed;
  `npm run docs` passed with 0 errors and 2 warnings. Signed implementation
  commit: `7fa6bb8b5`. All non-waived commit hooks and commitlint passed.
- [x] Task 1.6: Set `SQLITE_TMPDIR=/tmp` in both runtime images and default
  missing shell-session values through the existing environment hooks. Add
  failing environment regression tests first, update the owning documentation, and
  rebuild the image for the authorized live acceptance checks.
  Review follow-up: ensure the derived shell repair keeps exactly one generated
  SQLite default on current bases and repeated runs, preserves other Bash
  configuration, and aligns the added printf arguments. The user accepted
  retaining replacement of the NemoClaw-owned profile hook.
- [x] Task: Conductor - User Manual Verification 'Repair Image Provisioning' (Protocol in workflow.md).
  On 2026-10-21, the user approved proceeding after the completed implementation
  and acceptance evidence were summarized. This records approval to continue;
  it does not claim an additional user-executed test.

## Phase 2: Verify Fresh Sandbox Startup

- [x] Task 2.1: The user approved live sandbox testing and the repaired image
  was built without publication. Acceptance used the uncommitted worktree based
  on `163de2d5c`, bound to Dockerfile diff SHA-256
  `e70224bdd3b5c13923e2a6ec29c62819fe6246f0e395a61ab15bb5d21cdc9ada`.
  Signed commit `7fa6bb8b5` is now bound to that source: both Dockerfiles have
  identical executable content, with only Hadolint comments changed after
  the live run. See the committed-source binding in `verification.md`.
- [x] Task 2.2: Started a fresh sandbox with the final image. Gateway startup,
  Agent exec before and after process restart, SQLite approvals state, absent
  legacy JSON, and absent legacy warning are recorded in
  [live-acceptance.md](live-acceptance.md#post-restart-final-image-acceptance).
- [x] Task 2.3: Reconciled live evidence, source commit `7fa6bb8b5`, user phase
  approvals, and the PR-specific waiver. Existing unrelated failures remain
  tracked in fork issue #4. PR publication and CI follow-up use the contributor
  publication workflow.
- [x] Task: Conductor - User Manual Verification 'Fresh Sandbox Startup' (Protocol in workflow.md).
  The user's 2026-10-21 approval to continue covers the recorded live acceptance
  results. No additional Gateway or Agent operation was run for this approval.

## Final Verification

- [x] All acceptance criteria in `spec.md` have named evidence.
- [x] Changed provisioning, state-repair, and shell contracts pass. Existing
  unrelated failures are disclosed and tracked in fork issue #4.
- [x] Required commit and push hooks pass, or the fork maintainer explicitly
  accepts the named existing failures and records their disposition. On
  2026-10-21, the user approved a waiver for this fork PR only for
  `repository-checks`, `source-shape-test-budget`, `test-file-size-budget`, and
  `hadolint`. All other commit hooks passed. The pre-push checks against
  `origin/feat/image-only-cli` passed, including CLI TypeScript and version
  synchronization; the actual push must also run its normal hooks.
- [x] Nonempty legacy policy and SQLite state are preserved by the focused
  filesystem tests.
- [x] Documentation writer review is complete for the implementation diff.
- [x] Fresh sandbox startup evidence identifies the accepted image and its
  matching signed source commit `7fa6bb8b5`. The original live run used the
  uncommitted source; no later rebuild or repeated live run is claimed.
- [x] Update `conductor/tracks.md` and `metadata.json` for implementation completion.

## Implementation Evidence

See [verification.md](verification.md) for completed checks, test failures,
publication prerequisites. Tasks 1.1 through 1.6 and the source-binding evidence
for Task 2.1 are recorded with signed implementation commit `7fa6bb8b5`.
The user selected and registered the existing SSH signing key on 2026-10-21.
Repository-local Git signing and local signature verification succeeded.

The user authorized a live acceptance attempt before the required task commit.
See [live-acceptance.md](live-acceptance.md). The final `:20261020-sqlite-shell`
image passed fresh-sandbox Gateway and Agent checks before and after process
SIGTERM and Gateway Start, with no temp-directory override. It also reported
the SQLite approvals path, no legacy JSON, and no legacy warning. Phase 2 live
verification is recorded as complete. The user approved continuing on
2026-10-21 and explicitly waived the four named baseline hook failures for
this fork PR only. The implementation track is complete; final committed
documentation review, GitHub commit verification, PR publication, and CI
follow-up remain publication tasks. The PR must target `derekhsu/NemoClaw`,
with base `feat/image-only-cli`, as the user requested.

Review follow-up validation: all three shell-hook cases reproduced duplicate
SQLite defaults before the fix. After the fix, focused validation passed
78 tests across three files; two existing unrelated fixtures remain skipped.
