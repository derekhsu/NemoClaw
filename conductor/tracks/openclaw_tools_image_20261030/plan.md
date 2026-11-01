<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Implementation Plan: OpenClaw Tools Image

- Track ID: `openclaw_tools_image_20261030`
- Specification: [spec.md](spec.md)
- Issue: [#16](https://github.com/derekhsu/NemoClaw/issues/16)
- Status: [x] Phase 5 documentation and handoff complete for #16; deployment acceptance remains in #18.

## Working rules

Follow [the project workflow](../../workflow.md) for task markers, focused
behavior tests, logical commits, commit SHA records, and manual phase checks.
The Hermes upgrade instructions in that workflow apply to the existing Hermes
tracks, not this OpenClaw image. Follow repository npm scripts for source
validation. A pinned pnpm inside the tools image serves frontend fixtures only;
it does not replace this repository's package manager.

The maintainer confirmed the completed documentation and handoff on 2026-11-01
for commit `b5a81d16b` ([confirmation](https://github.com/derekhsu/NemoClaw/pull/20#issuecomment-6555856173)).
The #16 scope is complete with 23 completed phase tasks and two tasks transferred
to #18.
This completion records image verification and handoff; deployment acceptance
and image publication remain separate work.

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
- [x] Task 2.4: Run the document/media/workspace fixture set non-root and offline on amd64 and arm64; rerun base-revision security checks, compare image configuration, and record image size. `7a040dd`
- [x] Task: Conductor - User Manual Verification 'Document and media tools image' (Protocol in workflow.md) (confirmed by maintainer 2026-11-01)

Phase evidence: actual outputs and package/configuration comparisons. Version
commands and Dockerfile text assertions alone do not qualify installed tools.
No failed required tool may be dropped without a maintainer scope decision.

## Phase 3: Run browser and frontend tasks without installation downloads

- [x] Task 3.1: Add failing fixtures for OpenClaw/Python Playwright browser actions, plugin/tool/launch/policy error diagnosis, frontend creation/build/HTML packaging, and forbidden runtime downloads. `35b4969`
- [x] Task 3.2: Install the accepted Chromium artifacts and libraries; configure non-root writable paths and prove compatibility with OpenClaw and Python Playwright on both architectures. `a782f31`
- [x] Task 3.3: Prepare fixed frontend templates, dependency locks/offline store, Node.js module resolution, and p5.js assets; complete frontend tasks from the agent workspace without external package downloads. `9abc0a9`
- [-] Task 3.4: Run the controlled browser and frontend journeys under the selected deployment policy; verify undeclared destinations remain denied and inspect screenshot/HTML outputs. Moved to #18.
- [x] Task: Conductor - User Manual Verification 'Browser and offline frontend tasks' (Protocol in workflow.md) (confirmed by maintainer 2026-11-01)

Phase evidence: browser actions and outputs through the intended agent tool,
Python Playwright output, frontend artifacts, and denied-route evidence. A
reachable CDP endpoint alone does not qualify browser interaction. Live sandbox
creation requires the workflow's explicit opt-in before execution.

## Phase 4: Select and publish each image variant without tag collisions

- [x] Task 4.1: Add failing workflow behavior tests for variant/base/tag inputs, shell-sensitive values, existing release tags, fork/ref restrictions, architecture failure, and partial publication. `91cfa8e`
- [x] Task 4.2: Extend the fork workflow with standard/tools selection, tools base digest handling, base-derived version identity, separate caches/artifacts/tags, and both directions of tag namespace protection. `c615495`
- [x] Task 4.3: Restrict publication to the approved fork, ref, and registries; minimize CI permissions, keep registry secrets out of build/runtime outputs, and preserve standard aliases during tools builds. `c615495`
- [x] Task 4.4: Validate planning/build/manifest behavior with mocked publication boundaries and isolated local fixtures; record non-atomic partial-write behavior and exact retry/reporting rules without pushing images. `994d434` ([evidence](phase4-evidence.md))
- [x] Task: Conductor - User Manual Verification 'Image variant publication workflow' (Protocol in workflow.md) (confirmed by maintainer 2026-11-01)

Phase evidence: success and failure behavior, including rejection before alias
changes. Tests must exercise the owning logic; avoid source-shape tests that
only mirror workflow text. No image push is performed by this phase's local
validation unless separately authorized.

## Phase 5: Document, Review, and Hand Off Deployment Acceptance

- [x] Task 5.1: Reconcile the documentation author's work with the completed behavior; finalize tool inventory, versions, offline limits, image selection by digest, update ownership, and return to a standard image in the approved fork documentation surface. `4434ea6`, `6d58a96`
- [x] Task 5.2: Run focused source checks and applicable shell/Dockerfile/workflow checks after final edits; run npm run docs for public documentation changes and resolve independent documentation writer findings. `6d58a96` ([review](phase5-review.md))
- [-] Task 5.3: With explicit live-environment authorization and the named operator, stage the qualified image by the deployment's actual digest-selection setting; run all accepted journeys and negative policy checks on both architectures, retaining reproducible evidence. Moved to [#18](https://github.com/derekhsu/NemoClaw/issues/18) ([decisions](decisions.md)).
- [x] Task 5.4: Review security/scanner results, package inventories, capacity and cold-start budget, and all acceptance gaps; record documentation review evidence and publication handoff without creating a PR or publishing implicitly. `611b55a` ([review](phase5-review.md); 67 unfixed CVEs signed off by maintainer 2026-11-01; cold-start budget moved to #18)
- [x] Task: Conductor - User Manual Verification 'Documentation and deployment handoff' (Protocol in workflow.md) (confirmed by maintainer 2026-11-01 for reviewed commit `b5a81d16b`; [confirmation](https://github.com/derekhsu/NemoClaw/pull/20#issuecomment-6555856173))

Phase evidence for #16 includes image identities and fixture outputs, scanner
acceptance, documentation review, and the maintainer's manual confirmation.
Task 3.4, Task 5.3, the actual deployment policy and browser journeys, and the
cold-start budget remain pending in #18 under the recorded scope decision.
The manual confirmation closes the documentation and handoff scope; it does
not establish deployment qualification.

## Final verification

- [x] Required inventory items have functional amd64/arm64 fixture evidence; the accepted deployment-only checks are transferred to #18 ([review](phase5-review.md)).
- [x] Base metadata and controlled package comparisons pass for the selected base revision ([review](phase5-review.md)).
- [x] Offline/non-root fixtures pass on both architectures; declared/denied network access under the deployment policy remains pending in #18.
- [x] Standard/tools publication tests cover tag collisions and partial-write reports; the index-digest failure is fixed in `c4f09dc95` and was verified in the [PR re-review](https://github.com/derekhsu/NemoClaw/pull/20#pullrequestreview-5726862616).
- [x] Documentation and independent writer review are recorded; PR #20 retains the review receipt and the maintainer's manual confirmation.
- [x] Vulnerability acceptance and external qualification gaps are recorded; deployment acceptance and cold-start measurements remain pending in #18 ([review](phase5-review.md)).

The final verification checks summarize acceptance; they are not counted as
implementation tasks in metadata.json. There are 25 phase tasks, including
five manual-verification tasks.
Of those tasks, 23 are complete and two are transferred to #18, with neither
transferred task counted as completed deployment evidence.
Completed implementation tasks record their commit SHA; the final manual
confirmation identifies the reviewed commit and the maintainer's statement.
