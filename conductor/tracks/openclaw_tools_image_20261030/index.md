<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Track: OpenClaw Tools Image

- ID: `openclaw_tools_image_20261030`
- Status: In progress; Phase 1 dependency inspection
- Issue: [#16](https://github.com/derekhsu/NemoClaw/issues/16)
- Branch: `codex/issue-16-tools-image`
- Progress: 0/5 phases; 1/25 phase tasks

## Documents

- [Specification and required tool inventory](spec.md)
- [Implementation plan and verification](plan.md)
- [Track metadata](metadata.json)
- [Verification and current failure](verification.md)
- [Selected r2 base inspection](base-inspection.md)
- [Back to tracks](../../tracks.md)
- [Project workflow](../../workflow.md)

Task 1.1 establishes the published base identity. Package
versions, dependency compatibility, deployment ownership, and security/release
decisions must be settled before the later implementation phases. Creating this
track does not publish an image or approve new live resources.

The initial local TLS failure was resolved with the system CA bundle. Task 1.1
has base-inspection evidence for the selected r2 digest on both architectures.
Dependency simulation reproduced a Perl ABI conflict; the verification record
keeps that result separate from the successful artifact inspection.
