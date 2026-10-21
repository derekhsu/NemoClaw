<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Specification: OpenClaw Exec Approvals SQLite State

**Track ID:** `exec_approvals_sqlite_20261019`
**Type:** Bug fix
**Created:** 2026-10-19
**Status:** In Progress
**Issue:** derekhsu/NemoClaw #3

## Outcome and Scope

Stop the OpenClaw 2026.9.2 image from creating an empty legacy
`/sandbox/.openclaw/exec-approvals.json` file. A fresh sandbox must start without
the legacy exec approvals migration warning caused by that file.

The user selected this repair direction after reviewing Issue #3 and the
upstream migration behavior. This track covers the fork's existing OpenClaw
image. It does not establish a new upstream NemoClaw support claim.

On 2026-10-20, the user approved the related SQLite temporary-directory repair
in this track. Both image stages must set `SQLITE_TMPDIR=/tmp` so Agent schema
initialization uses a directory writable under the existing sandbox policy.

## Confirmed Behavior

- `Dockerfile.base` creates the file with `touch`.
- `Dockerfile` creates it again while repairing state ownership and permissions.
- The reviewed OpenClaw 2026.9.2 npm archive matches the committed integrity
  value in `agents/openclaw/openclaw-runtime/package-lock.json`.
- That version stores exec approvals in the `exec_approvals_config` table of
  `state/openclaw.sqlite`.
- Its migration check rejects an existing legacy JSON path regardless of content.
  An isolated diagnostic using that check accepted a missing file and rejected
  an empty file, valid version-1 JSON, populated policy JSON, and a pending
  `.doctor-importing` file. This was not a full gateway startup test.
- Repository inspection found no NemoClaw-owned exec approvals policy writer.
  OpenClaw retains ownership of policy storage and migration.

## Acceptance Criteria

- [x] The active OpenClaw 2026.9.2 base image does not create the legacy JSON file.
- [x] The derived image does not recreate the file when it is absent.
- [x] The derived image removes a zero-byte regular legacy file inherited from
  an older base after the existing link and file-type safety checks pass.
- [x] A nonempty legacy file retains its exact contents. OpenClaw Doctor owns
  any required import; the image does not silently discard policy.
- [x] A symlink, hard link, or non-regular legacy target is rejected before
  deletion, ownership changes, or permission changes affect that target.
- [x] Existing SQLite state is preserved. The legacy-file repair step does not
  seed approval rows, change approval defaults, or invoke OpenClaw Doctor.
- [x] Focused provisioning and unsafe-state tests cover missing, zero-byte,
  nonempty, and unsafe legacy targets, and pass after the repair.
- [x] Both the base and derived runtime images set `SQLITE_TMPDIR=/tmp`,
  including when the derived image starts from a base without that setting.
- [x] Login and interactive Bash hooks default an unset or empty
  `SQLITE_TMPDIR` to `/tmp` when OpenShell omits the image environment.
  A nonempty runtime-provided temp directory is preserved.
- [x] A rebuilt image starts Gateway and completes Agent exec before and
  after process SIGTERM and Gateway Start without a runtime temp-directory
  override. The ClawShell Stop endpoint remains tracked separately in issue #157.
- [ ] A fresh sandbox built from the repaired image starts without this
  migration warning. Record the tested commit, image, scenario, and result.

## Implementation Direction

Extend the existing Dockerfile state-repair block and provisioning tests.
Remove the empty-file creation from the active base-image path. In the derived
image, retain the existing file-type and link checks before removing only a
zero-byte regular file. Preserve nonempty files and their existing permission
repair. Leave SQLite initialization to OpenClaw.

## Out of Scope

- Changing exec approval policy, permissions granted to commands, or defaults.
- Writing SQLite state directly or adding a migration framework.
- Automatically migrating or deleting existing user policy at runtime.
- Repairing or replacing existing Agent databases. SQLite initialization
  remains owned by OpenClaw; this track supplies its writable temp directory.
- Hermes behavior, image publication, or upstream dependency upgrades.
- Existing test and hook failures that this repair does not introduce. On
  2026-10-21, the user requested separate tracking in
  [fork issue #4](https://github.com/derekhsu/NemoClaw/issues/4).

## Validation Boundaries

The isolated migration diagnostic supports the cause and repair direction.
Fresh-sandbox behavior was subsequently tested with explicit user approval;
Gateway and Agent checks passed before and after process restart. The result is
bound to the uncommitted worktree base and Dockerfile diff hash in
[live-acceptance.md](live-acceptance.md), not to a task commit. Record the signed
commit and its source revision before closing the remaining acceptance item.
