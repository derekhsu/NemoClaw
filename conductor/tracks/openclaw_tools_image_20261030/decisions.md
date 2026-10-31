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

## Publication and security

| Topic | Decision |
| --- | --- |
| Publication (group 5) | Publish one multi-architecture tag, `<openclaw-version>-tools.<n>` (for example `2026.9.2-tools.1`). Push the amd64 and arm64 images by digest only; add no architecture tags. Reject a tag that already exists. Publish only from `derekhsu/NemoClaw`. On partial failure, report the digests already written. |
| Security acceptance (group 6) | Scan the image with Trivy and store the JSON report. A release has no fixable CRITICAL or HIGH finding. The maintainer signs off each unfixed CRITICAL or HIGH finding by name. |

## AF_UNIX sandbox result

[afunix-probe.py](afunix-probe.py) ran on 2026-10-31 in a disposable
OpenShell sandbox created from the r2 digest with
`nemoclaw-blueprint/policies/openclaw-sandbox.yaml`. The local gateway was
OpenShell 0.0.101 with the Docker compute driver. As uid 998, `AF_UNIX`
stream and datagram sockets, `socketpair`, and bind/listen under `/tmp`
all succeeded ([output](afunix-probe-output.txt)). The sandbox was deleted.

Result: `soffice.py` does not need its shim in this environment. The image
ships no shim and no compiler. #18 repeats the check in the deployment
environment; if it fails there, reopen this decision.
