<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Implementation Plan: Hermes API Profile Guard

**Track ID:** `hermes_api_profile_guard_20260924`

**Spec:** [spec.md](spec.md)

**Created:** 2026-09-24

**Status:** [~] In Progress

## Phase 1: Guard contract and adversarial tests

- [x] Task 1.1: Record the image's current default-profile hash, restart-seal,
  ownership, and gateway startup contracts. Record which locations survive
  container restart, rebuild, and deletion: `/sandbox` persists, `/run` is
  tmpfs, the `/etc` anchor lives in the container layer, and
  `/sandbox/.nemoclaw` is the existing root-owned sticky directory.
  `5b7991c`
- [x] Task 1.2: Add a failing test for the observed API-profile hash mismatch.
  `c23fe8a`
- [x] Task 1.3: Add failing tests for a sandbox user changing files, hashes,
  or path entries before and during bootstrap, and for a caller-supplied or
  non-root-owned strict anchor. `c23fe8a`
- [x] Task 1.4: Decide the protected parent-path mechanism from a live image
  probe. Confirm uid-0 ownership and sticky-parent protection are meaningful
  on the verification backend, check whether the `NEMOCLAW_DARWIN_VM_COMPAT`
  remap defeats them, and pick the persistent anchor location (for example
  under root-owned `/sandbox/.nemoclaw`). Decide whether the api seal state
  shares the `/run/nemoclaw` mutation lock with the default profile or gets
  its own directory. Verify that Hermes still writes required runtime state.
  `102b5eb`

Verification: tests fail for the known defect and demonstrate that the chosen
path mechanism rejects sandbox-user replacement.

## Phase 2: Image-owned API profile transaction

The boundary is uid-based (three-uid model in contract-inventory.md): the
api profile runs as dedicated user `hermesapi` in its own process; the
default side (`sandbox`) keeps full control of api `config.yaml`/`.env`;
the fixed policy, anchor, and structure stay root-sealed.

- [ ] Task 2.0 (spike): Verify a dedicated api-profile process. Add the
  `hermesapi` user in `agents/hermes/Dockerfile`, confirm a gateway launched
  with `HERMES_HOME=/sandbox/.hermes/profiles/api` serves that profile, and
  route `/p/api` to it (socat) while `/v1` stays on the main gateway.
  Decide whether `profiles/api` needs a `writableSubpaths` entry in
  `state-lock-plan.json` so the api runtime keeps state writes during
  locked shields transitions.
- [ ] Task 2.1: Add a fixed root-only bootstrap action in
  `agents/hermes/runtime-config-guard.py`. Generate or preserve the key
  without returning it. Write the fixed tool policy
  (`root:api 0440`). Apply the ownership matrix: `profiles/` `sandbox:sandbox
  0771`, `profiles/api/` `sandbox:api 3770`, `config.yaml`/`.env`
  `sandbox:api 0640`, `.config-hash` `root:api 0440`. Create the root-owned
  anchor record under `/sandbox/.nemoclaw/` (pins the policy digest and the
  structural contract, not config/env content) and the restart state for
  `api` only. When the profile exists but its anchor is missing or
  unverifiable, re-seal the profile with a rotated key or fail; never adopt
  the existing root-sealed state.
- [ ] Task 2.2: Make bootstrap atomic, idempotent, and recoverable. Refuse
  untrusted existing profile files and path aliases.
- [ ] Task 2.3: Extend the profile-scoped `write-config` path and its tests so
  it uses the API anchor and state. Resolve both paths from fixed image
  constants, verify the anchor is root-owned, treat the expected digest as a
  compare-and-swap precondition, and reject caller-supplied anchor or state
  paths for the `api` profile. Keep the default path unchanged.
- [ ] Task 2.4: Give ClawShell an explicit
  `NEMOCLAW_REQUIRE_API_PROFILE=1` startup signal. When set, the managed
  entrypoint verifies the root-owned API profile marker, the fixed policy
  digest, and the ownership/mode matrix, and refuses to start when the api
  seal state records an interrupted transaction. It fails if any check
  fails. ClawShell invokes bootstrap before it starts the managed gateway;
  unrelated NemoClaw deployments do not set the signal or create the
  profile.

Verification: run the focused guard, startup, hash, and restart-seal tests.
Inspect the profile and default hashes after a config write and restart.

## Phase 3: ClawShell contract and candidate image

- [ ] Task 3.1: Document the exact fixed command, paths, file modes, and
  failure codes that the ClawShell privileged caller must use. Pin the
  `clawshell-api-minimal-v1` tool policy bytes and version across the image
  bootstrap and ClawShell readiness check.
- [ ] Task 3.2: Extend image-contract tests for API bootstrap, profile-scoped
  config write, default-profile non-interference, and no Landlock POC layer.
- [ ] Task 3.3: Build a local arm64 candidate from `feat/image-only-cli` plus
  this branch. Verify the candidate's guard behavior inside OpenShell.
- [ ] Task 3.4: Coordinate ClawShell caller changes under its existing
  `hermes_api_profile_20260916` track. ClawShell replaces the sandbox-user
  bootstrap transaction (`hermes profile create`, `tools disable`, and the
  stdin config write) with one fixed-argv privileged bootstrap call, and
  readiness accepts the root-owned anchor while still reading the key through
  the group-readable `.env`. Do not treat NemoClaw-only success as ClawShell
  end-to-end success.

Verification: focused tests, image contracts, and a local candidate pass.
Record the image digest and the ClawShell commit used in the probe.

## Phase 4: Release gate

- [ ] Task 4.1: Build and verify both target architectures. Run the existing
  Hermes managed-MCP and uploader compatibility checks.
- [ ] Task 4.2: Create a fresh ClawShell sandbox from the immutable candidate.
  Verify provider update, `/p/api` authentication, default-route denial,
  Dashboard access, restart, and rebuild.
- [ ] Task 4.3: Verify api-runtime-uid write and path-replacement attempts
  fail — including through a terminal tool — while default-side writes to
  api `config.yaml`/`.env` succeed. Confirm the default profile and API
  profile hashes remain independent.
- [ ] Task 4.4: Review the exact candidate digest and validation evidence
  before publication. Publish only after the release gate passes.

## Final verification

- [ ] All acceptance criteria in [spec.md](spec.md) pass.
- [ ] The ClawShell sandbox reaches RUNNING with the published digest.
- [ ] No API key appears in logs, process arguments, or host artifacts.
- [ ] The default-profile gateway and uploader contracts remain intact.
