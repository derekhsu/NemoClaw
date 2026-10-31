<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Task 1.3: Decisions

The fork maintainer (`derekhsu`) owns these decisions. They were recorded on
2026-10-31 from the maintainer's replies. Background for each choice is in
[inputs.md](inputs.md).

## Decided

| Topic | Decision | Effect on implementation |
| --- | --- | --- |
| Debian pin policy | Re-resolve `apt-packages.txt` for every tools release | Each tools revision re-runs the held-package resolution against its base digest and commits the new versions. Builds pin exact versions; an old tools revision may stop rebuilding after Debian removes a version. |
| `soffice.py` shim | Test `socket(AF_UNIX)` in an OpenShell sandbox first; prebuild the shim only if it is blocked | The image ships no compiler. Phase 2 records the sandbox result before LibreOffice qualification. A blocked result adds a build-stage shim and a startup copy into `$TMPDIR`. |
| officecli version | Keep 1.0.160 | `artifacts.lock` stays unchanged. Phase 2 repeats the checksum and document journey in the built image. |
| Deployment acceptance | Local verification only in this track; deployment acceptance moves to [#18](https://github.com/derekhsu/NemoClaw/issues/18) | Spec decision groups 2 (deployment consumer) and 3 (sandbox policy), Task 3.4's policy run, Task 5.3, and the cold-start budget move to #18. This track cannot claim deployment qualification. |

## Base and version identity

- Base: `2026.9.2-r2`, index digest
  `sha256:8f951046eaf0de9f2e00fb7ff7d8d33de62e5c5890758289e27ec405fb5c1d02`,
  stored as the default `BASE_IMAGE` digest in `Dockerfile.tools` and
  validated by the workflow.
- Tools release identity comes from the base image's OpenClaw version, not the
  checkout's pin. Issue #14 stays independent.

## Still open

| Topic | Proposed default | Status |
| --- | --- | --- |
| Publication (group 5) | Tag `<openclaw-version>-tools.<n>` plus `-amd64`/`-arm64`; reject an existing tag; publish only from `derekhsu/NemoClaw`; report digests already written on partial failure | Awaiting maintainer confirmation |
| Security acceptance (group 6) | Trivy image scan stored as JSON; no fixable CRITICAL or HIGH finding; the maintainer signs off each unfixed finding | Awaiting maintainer confirmation |
| AF_UNIX sandbox test | Create one disposable sandbox on a local OpenShell gateway | Needs approval to create a local sandbox; Docker is currently down |
