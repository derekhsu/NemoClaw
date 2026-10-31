<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Phase 2 Evidence: Document and Media Tools Image

## Runs

| Run | Source | Result |
| --- | --- | --- |
| [41213301963](https://github.com/derekhsu/NemoClaw/actions/runs/41213301963) | `6ff70eb`: fixtures with a `FROM`-only `Dockerfile.tools` | Expected failure: 3 boundary checks pass, 16 tool checks fail on both architectures |
| [41217505425](https://github.com/derekhsu/NemoClaw/actions/runs/41217505425) | `4a31ffc`: complete Phase 2 image | All 19 fixtures pass on amd64 and arm64; image checks pass |

Each run builds natively on `ubuntu-24.04` (amd64) and `ubuntu-24.04-arm`
(arm64) and uploads `tools-image-evidence-<arch>` artifacts (30-day
retention) with the build log, image comparison, fixture logs and outputs, and
the Trivy JSON report. No image was pushed.

## Results of run 41217505425

| Check | amd64 | arm64 |
| --- | --- | --- |
| Base index has both architectures; base user `sandbox` | Pass | Pass |
| `User`, `Entrypoint`, `Cmd`, `WorkingDir`, `Env`, `Healthcheck` equal the base | Pass | Pass |
| OpenClaw version unchanged (`OpenClaw 2026.9.2`) | Pass | Pass |
| 19 fixtures as `sandbox`, `--network none`, read-only root, no capabilities | 19/19 | 19/19 |
| Build time | 146 s | 150 s |
| Uncompressed size: base → tools | 2.26 GB → 4.45 GB (+2.18 GB) | 2.27 GB → 4.37 GB (+2.10 GB) |

The fixtures include the controlled-package comparison, the base revision's
security checks, the absence of `gcc`, `cc`, and `make`, and the per-user
fontconfig cache staying empty.

## Trivy (CRITICAL and HIGH with a fixed version)

| Source | Count | Packages |
| --- | --- | --- |
| Already in the r2 base | 11 | `libexpat1` 2.8.3 (5, controlled package), Node.js `undici` 6.27.0 (4), `brace-expansion` 5.0.9 (2) |
| Added by the tools layer | 5 | `/usr/local/bin/yq` 4.54.1 built with Go 1.27.1 `stdlib` (4) and `golang.org/x/net` 0.59.0 (1) |

`image-size` 1.2.1 (2 HIGH) was removed by an npm override to 2.0.3;
`pptxgenjs` lists it but its Node.js build does not load it. yq 4.54.1 is the
latest release. The base findings need a standard image rebuild; the tools
image must not change the controlled `libexpat1`. Both groups await a
maintainer decision before release (Task 5.4).

## Fixes found during Phase 2

- `docker build` without `--platform` leaves `TARGETARCH` empty in `FROM`.
  Downloads now share one stage and the final stage installs the file for
  `dpkg --print-architecture` through a bind mount.
- `fc-cache` could not write to a new cache directory. The cache is built in
  `/var/cache/fontconfig` and copied under `/usr`.
- pip cannot replace Debian `python3-packaging` 25.0; the lock pins 25.0.
- `pptxgenjs` output fails strict OpenXML validation; officecli validates its
  own PPTX and reads back the `pptxgenjs` one.
- `cmd | grep -q` under `pipefail` failed on SIGPIPE; checks capture output first.
- OCR fixtures pick CJK faces by name and allow 80% similarity for Tesseract 4.1.
