# Implementation Plan: Hermes Managed Local File Uploader

**Track ID:** `hermes_stdio_uploader_20260909`
**Spec:** [spec.md](spec.md)
**Status:** [~] In Progress

## Phase 1: Define the Managed Local MCP Contract [checkpoint]

- [x] Task 1.1: Add focused failing tests that define the one allowed uploader
  mutation and reject arbitrary command, argument, environment, and literal
  credential input. `7698ba0`
- [x] Task 1.2: Extend the Hermes MCP transaction with the fixed uploader
  configuration, atomic mutation, integrity update, and confirmed reload. `7698ba0`
- [x] Task 1.3: Run the focused transaction and race-recovery tests. `7698ba0`
- [x] Task: Conductor - User Manual Verification 'Managed Local MCP Contract' (Protocol in workflow.md)

## Phase 2: Package and Verify the Image

- [~] Task 2.1: Add the versioned uploader executable to the Hermes image with
  deterministic packaging and no runtime package download.
- [ ] Task 2.2: Extend image layout and integrity tests to prove the executable,
  helper, and reviewed credential-boundary manifest are present.
- [ ] Task 2.3: Run focused image-contract tests.
- [ ] Task: Conductor - User Manual Verification 'Image Packaging' (Protocol in workflow.md)

## Phase 3: Prove Runtime File Delivery

- [ ] Task 3.1: Add a credential-free integration fixture that invokes the
  local uploader and proves only an allowed file becomes a signed download.
- [ ] Task 3.2: Add negative and recovery cases for denied paths, missing
  provider credential, failed registration, and idempotent retry.
- [ ] Task 3.3: Run focused integration tests without live credentials.
- [ ] Task: Conductor - User Manual Verification 'Runtime File Delivery' (Protocol in workflow.md)

## Phase 4: Upgrade Compatibility and Release Evidence

- [ ] Task 4.1: Add a revision-pinning and patch-application contract that
  identifies changes to the Hermes helper or image layout during upgrades.
- [ ] Task 4.2: Document the required upstream rebase, image build, focused
  contracts, and rebuilt-sandbox uploader verification sequence.
- [ ] Task 4.3: With explicit approval, build the image and verify a rebuilt
  sandbox returns a valid signed download link.
- [ ] Task: Conductor - User Manual Verification 'Upgrade Compatibility and Release Evidence' (Protocol in workflow.md)

## Final Verification

- [ ] All acceptance criteria in `spec.md` are met.
- [ ] Focused deterministic tests and image-contract tests pass.
- [ ] The tracked upgrade procedure has evidence for the selected upstream
  revision.
- [ ] The feature remains documented as fork-specific.
