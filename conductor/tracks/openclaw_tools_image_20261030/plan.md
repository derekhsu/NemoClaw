<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Implementation Plan: OpenClaw Tools Image

- Track ID: `openclaw_tools_image_20261030`
- Specification: [spec.md](spec.md)
- Issue: [#16](https://github.com/derekhsu/NemoClaw/issues/16)
- Status: [~] Phase 2 in progress

## Working rules

Follow [the project workflow](../../workflow.md) for task markers, focused
behavior tests, logical commits, commit SHA records, and manual phase checks.
The Hermes upgrade instructions in that workflow apply to the existing Hermes
tracks, not this OpenClaw image. Follow repository npm scripts for source
validation. A pinned pnpm inside the tools image serves frontend fixtures only;
it does not replace this repository's package manager.

Track creation completed planning artifacts only. Phase 1 input inspection is
in progress. Do not interpret review opinions or an unchecked checklist as evidence
that a package installs or a release is qualified.

## Phase 1: Establish reproducible inputs and acceptance owners

- [x] Task 1.1: Inspect the chosen full published base by digest on both architectures; record the runtime version, image configuration, controlled package inventory, and source revision. `204877e`
- [x] Task 1.2: Inventory every required tool against the base and fixed skill revision; prepare exact package/artifact pins and sources, resolve dependency compatibility, and record rejected or unavailable artifacts. `f8c6e17`
- [x] Task 1.3: Resolve the six decision groups in spec.md, officecli qualification, actual deployment consumer/policy, vulnerability acceptance, and cold-start budget with named owners before behavior-changing implementation. `69a4baf2d`
- [x] Task 1.4: Map the complete accepted inventory to fixtures and error cases; reconcile the old Claude Code review with the expanded issue and selected implementation boundaries. `61101394f`
- [x] Task: Conductor - User Manual Verification 'Reproducible inputs and acceptance owners' (Protocol in workflow.md) (confirmed by maintainer 2026-10-31)

Phase evidence: real image identities, dependency-resolution evidence, and
recorded decisions. If a required tool conflicts with a controlled package,
report the conflict before proceeding. A tools release is not an implicit
upgrade of the base runtime or its security inventory.

Verification venue: from Phase 2 onward, image builds and fixtures run in a
fork GitHub Actions workflow on native amd64 and arm64 runners, not on the
maintainer's machine (decision 2026-10-31). Task 3.4's policy run and
Task 5.3 move to [#18](https://github.com/derekhsu/NemoClaw/issues/18).

## Phase 2: Build a usable document and media tools image

- [x] Task 2.1: Start a documentation authoring subagent alongside the first user-visible implementation; add focused failing behavior tests/fixtures for the selected input validation and document, PDF/OCR, media, chart, metadata, ZIP/YAML/search/SQLite journeys before implementation. `6ff70eb`
- [x] Task 2.2: Add Dockerfile.tools using the accepted full base digest; install the required system, Python, Node.js document, workspace, and font dependencies with controlled-package drift prevention. `eee3036`
- [x] Task 2.3: Configure workspace module resolution, Python environment, writable caches, LibreOffice profiles, and selected helper preparation without changing base runtime ownership or retaining an unapproved compiler. `f2449cf`
- [~] Task 2.4: Run the document/media/workspace fixture set non-root and offline on amd64 and arm64; rerun base-revision security checks, compare image configuration, and record image size.
- [ ] Task: Conductor - User Manual Verification 'Document and media tools image' (Protocol in workflow.md)

Phase evidence: actual outputs and package/configuration comparisons. Version
commands and Dockerfile text assertions alone do not qualify installed tools.
No failed required tool may be dropped without a maintainer scope decision.

## Phase 3: Run browser and frontend tasks without installation downloads

- [ ] Task 3.1: Add failing fixtures for OpenClaw/Python Playwright browser actions, plugin/tool/launch/policy error diagnosis, frontend creation/build/HTML packaging, and forbidden runtime downloads.
- [ ] Task 3.2: Install the accepted Chromium artifacts and libraries; configure non-root writable paths and prove compatibility with OpenClaw and Python Playwright on both architectures.
- [ ] Task 3.3: Prepare fixed frontend templates, dependency locks/offline store, Node.js module resolution, and p5.js assets; complete frontend tasks from the agent workspace without external package downloads.
- [ ] Task 3.4: Run the controlled browser and frontend journeys under the selected deployment policy; verify undeclared destinations remain denied and inspect screenshot/HTML outputs.
- [ ] Task: Conductor - User Manual Verification 'Browser and offline frontend tasks' (Protocol in workflow.md)

Phase evidence: browser actions and outputs through the intended agent tool,
Python Playwright output, frontend artifacts, and denied-route evidence. A
reachable CDP endpoint alone does not qualify browser interaction. Live sandbox
creation requires the workflow's explicit opt-in before execution.

## Phase 4: Select and publish each image variant without tag collisions

- [ ] Task 4.1: Add failing workflow behavior tests for variant/base/tag inputs, shell-sensitive values, existing release tags, fork/ref restrictions, architecture failure, and partial publication.
- [ ] Task 4.2: Extend the fork workflow with standard/tools selection, tools base digest handling, base-derived version identity, separate caches/artifacts/tags, and both directions of tag namespace protection.
- [ ] Task 4.3: Restrict publication to the approved fork, ref, and registries; minimize CI permissions, keep registry secrets out of build/runtime outputs, and preserve standard aliases during tools builds.
- [ ] Task 4.4: Validate planning/build/manifest behavior with mocked publication boundaries and isolated local fixtures; record non-atomic partial-write behavior and exact retry/reporting rules without pushing images.
- [ ] Task: Conductor - User Manual Verification 'Image variant publication workflow' (Protocol in workflow.md)

Phase evidence: success and failure behavior, including rejection before alias
changes. Tests must exercise the owning logic; avoid source-shape tests that
only mirror workflow text. No image push is performed by this phase's local
validation unless separately authorized.

## Phase 5: Document, review, and qualify the selected deployment

- [ ] Task 5.1: Reconcile the documentation author's work with the completed behavior; finalize tool inventory, versions, offline limits, image selection by digest, update ownership, and return to a standard image in the approved fork documentation surface.
- [ ] Task 5.2: Run focused source checks and applicable shell/Dockerfile/workflow checks after final edits; run npm run docs for public documentation changes and resolve independent documentation writer findings.
- [ ] Task 5.3: With explicit live-environment authorization and the named operator, stage the qualified image by the deployment's actual digest-selection setting; run all accepted journeys and negative policy checks on both architectures, retaining reproducible evidence.
- [ ] Task 5.4: Review security/scanner results, package inventories, capacity and cold-start budget, and all acceptance gaps; record documentation review evidence and publication handoff without creating a PR or publishing implicitly.
- [ ] Task: Conductor - User Manual Verification 'Deployment qualification and handoff' (Protocol in workflow.md)

Phase evidence: named deployment, tested source/image identity, real outputs,
scanner acceptance, docs validation and independent review. If deployment or
an architecture is unavailable, record the missing evidence and leave the
corresponding acceptance and track incomplete.

## Final verification

- [ ] Every required inventory item has functional amd64/arm64 evidence or an explicit accepted scope change.
- [ ] Base metadata and controlled packages remain valid for the selected base revision.
- [ ] Offline/non-root behavior and declared/denied network access satisfy spec.md.
- [ ] Standard/tools publication rejects tag collisions and reports partial writes accurately.
- [ ] Documentation and independent writer review are complete; receipt evidence is retained for any subsequent PR.
- [ ] All external qualification and vulnerability decisions are recorded; no unresolved finding is hidden by a passing build.

The final verification checks summarize acceptance; they are not counted as
implementation tasks in metadata.json. There are 25 phase tasks, including
five manual-verification tasks. Completed tasks record their commit SHA.
