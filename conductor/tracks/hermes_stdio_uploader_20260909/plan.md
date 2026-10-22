# Implementation Plan: Hermes Managed Local File Uploader

**Track ID:** `hermes_stdio_uploader_20260909`
**Spec:** [spec.md](spec.md)
**Status:** [~] In Progress — source integration in PR #7; live acceptance
of the integrated image remains pending

## Phase 1: Define the Managed Local MCP Contract [checkpoint]

- [x] Task 1.1: Add focused failing tests that define the one allowed uploader
  mutation and reject arbitrary command, argument, environment, and literal
  credential input. `7698ba0`
- [x] Task 1.2: Extend the Hermes MCP transaction with the fixed uploader
  configuration, atomic mutation, integrity update, and confirmed reload. `7698ba0`
- [x] Task 1.3: Run the focused transaction and race-recovery tests. `7698ba0`
- [x] Task: Conductor - User Manual Verification 'Managed Local MCP Contract' (Protocol in workflow.md)

## Phase 2: Package and Verify the Image [checkpoint]

- [x] Task 2.1: Add the versioned uploader executable to the Hermes image with
  deterministic packaging and no runtime package download. `cb2b4b9`
- [x] Task 2.2: Extend image layout and integrity tests to prove the executable,
  helper, and reviewed credential-boundary manifest are present. `cb2b4b9`
- [x] Task 2.3: Run focused image-contract tests. `cb2b4b9`
- [x] Task: Conductor - User Manual Verification 'Image Packaging' (Protocol in workflow.md)

## Phase 3: Prove Runtime File Delivery [checkpoint]

- [x] Task 3.1: Add a credential-free integration fixture that invokes the
  local uploader and proves only an allowed file becomes a signed download. `cdae606`
- [x] Task 3.2: Add negative and recovery cases for denied paths, missing
  provider credential, failed registration, and idempotent retry. `cdae606`, `a6b3ce2`
- [x] Task 3.3: Run focused integration tests without live credentials. `cdae606`
- [x] Task: Conductor - User Manual Verification 'Runtime File Delivery' (Protocol in workflow.md)

## Phase 4: Upgrade Compatibility and Release Evidence [checkpoint: ClawShell bd589343]

- [x] Task 4.1: Add a revision-pinning and patch-application contract that
  identifies changes to the Hermes helper or image layout during upgrades. `f10d07b`
- [x] Task 4.2: Document the required upstream rebase, image build, focused
  contracts, and rebuilt-sandbox uploader verification sequence. `f10d07b`
- [x] Task 4.3: With explicit approval, build the image and verify a rebuilt
  sandbox returns a valid signed download link. ClawShell `bd589343`
- [x] Task: Conductor - User Manual Verification 'Upgrade Compatibility and Release Evidence' (Protocol in workflow.md) ClawShell `bd589343`

## Historical Verification

- [x] All acceptance criteria in `spec.md` are met on the
  `feat/hermes-local-uploader-0911` lineage.
- [x] Focused deterministic tests and image-contract tests passed for the
  historical 2026-09-11 source.
- [x] The tracked upgrade procedure has evidence for the selected upstream
  revision.
- [x] The feature remains documented as fork-specific.

## Source Integration and Remaining Work

- [x] Integrate the missing changes from `7a38c12be` and `ff43f3d1c` by
  squash in PR #7, retaining current transaction and image protections.
- [x] Run the current integration contracts: 12 files and 135 tests passed
  on 2026-10-22, including the drain containment regression and API/default
  protection tests. See the
  [validation record](upgrade-verification.md#integration-validation).
- [ ] Build the integrated image and verify its uploader flow in a new
  ClawShell-managed sandbox; record the source commit, image digest, sandbox
  identifier, and signed-download result.
- [ ] Verify the image published from `ff43f3d1c` in a live sandbox.

The source branch does not become a Git ancestor through squash integration.
The [integration record](upgrade-verification.md#2026-10-22-source-integration-in-pr-7)
identifies the preserved behavior and the acceptance boundary.

## Acceptance reconciliation (2026-10-22)

The 2026-09-10 blocked attempt was superseded by the 2026-09-11
verification in ClawShell. Phase 4 checkpoint `bd589343` records 343 backend,
18 NemoClaw image/transaction, and 23 sandbox-mcp-server tests passing.
The new sandbox `hermes-p17-0911` completed the real LLM uploader flow,
including five successful downloads and rejection after the use limit.

ClawShell commit `a2158c79` marked its track complete, and `303452ad`
archived it to `conductor/archive/hermes_local_uploader_20260909/` in the
ClawShell repository; checkpoint `bd589343` and its git note live there too.
The [verification record](upgrade-verification.md#2026-09-11-verified-acceptance-on-the-uploader-0911-lineage)
contains the evidence locations. These final checklist entries refer to that
historical acceptance on the `feat/hermes-local-uploader-0911` lineage.
They do not establish live acceptance of the source integrated in PR #7.
