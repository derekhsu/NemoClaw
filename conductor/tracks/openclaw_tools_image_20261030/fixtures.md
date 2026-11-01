<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Task 1.4: Fixture Map and Review Reconciliation

## Where verification runs

The maintainer chose on 2026-10-31 to stop building images locally. A
verification workflow on the fork builds `Dockerfile.tools` natively on
`ubuntu-24.04` (amd64) and `ubuntu-24.04-arm` (arm64), runs every fixture
below, scans with Trivy, and uploads outputs as artifacts. It pushes no image.
Track evidence links to the workflow run. OpenShell-policy checks move to
[#18](https://github.com/derekhsu/NemoClaw/issues/18).

Every fixture runs as `sandbox` with `--network none`, a read-only root, a
writable `/tmp` and `/sandbox`, no capabilities, and `no-new-privileges`,
unless the row says otherwise.

## Inventory to fixtures

| Area | Fixture and pass condition | Phase |
| --- | --- | --- |
| Office files | Node.js `docx` and `pptxgenjs` create DOCX and PPTX; Python `openpyxl` creates XLSX; officecli edits, validates, and reads back each file | 2 |
| Office to PDF | `soffice -env:UserInstallation=file:///tmp/<unique> --headless --convert-to pdf` for DOCX, XLSX, PPTX; `pdftotext` finds the CJK and Latin fixture text; `pdffonts` lists Noto CJK | 2 |
| Spreadsheet recalculation | LibreOffice recalculates an XLSX formula; openpyxl reads the cached value | 2 |
| Parallel conversion | Two `soffice` conversions run at once with separate profiles and both succeed | 2 |
| PDF tools | `pdftoppm`, `pdfimages`, `qpdf --check`, `pypdf`, `pdfplumber` on a fixture PDF; extracted text matches | 2 |
| PS/EPS | Ghostscript converts a fixture EPS to PDF with `-dSAFER` left on; a PostScript file-read attempt fails | 2 |
| OCR | Tesseract and `pytesseract` read English, Traditional Chinese, and Simplified Chinese fixture images; `pdf2image` renders a page first | 2 |
| Pandoc | Markdown to DOCX and back keeps the fixture headings | 2 |
| Images | `magick` resizes and converts PNG to WebP; `magick -version` reports 7.x | 2 |
| Metadata | ExifTool writes and reads a tag on a JPEG and a PDF; Perl reports 5.44 and the controlled package versions are unchanged | 2 |
| Media | `ffmpeg` transcodes a generated clip; `ffprobe -of json` reports the expected codec, size, and duration; imageio writes a GIF with its bundled ffmpeg | 2 |
| Charts | matplotlib renders CJK, Latin, and negative labels with no missing-glyph warning; cache directory is writable | 2 |
| Workspace | ZIP round trip; `rg` search; `yq` edit and read back; `yamllint` accepts a valid file and rejects an invalid one; `sqlite3` write/read and read-only open | 2 |
| Python automation | `anthropic`, `mcp`, `yaml` import from the agent environment with no network | 2 |
| Node.js resolution | `require` and `import` of the document libraries from `/sandbox`, not only from the install directory | 2 |
| Chromium | Headless Chromium as `sandbox` writes a screenshot of a local `file://` page | 3 |
| Python Playwright | Playwright drives the shared or separately installed Chromium: open a local page, click, type, screenshot | 3 |
| OpenClaw browser tool | Browser actions through the OpenClaw tool | #18 |
| Frontend | Create a project from the prepared template, install offline, `vite build`, Parcel build, html-inline single file | 3 |
| p5.js | A local HTML page loads `p5.min.js` from the image and renders a canvas screenshot | 3 |
| Forbidden downloads | With `--network none`, frontend and Playwright fixtures complete; any download attempt fails the fixture | 3 |

## Image checks

| Check | Pass condition |
| --- | --- |
| Base identity | `FROM` uses the r2 index digest; the index has amd64 and arm64; base `Config.User` is `sandbox` |
| Metadata | `User`, `Entrypoint`, `Cmd`, `WorkingDir`, `Env`, and `Healthcheck` match the base exactly |
| Controlled packages | Every package in the image's own `security-packages.txt` keeps its version; the base revision's Perl, jq, tmux, expat, html.parser hash, libssh2, vim, and `dpkg --audit` checks pass |
| No compiler | `gcc`, `cc`, and `make` are absent from the final image |
| Version identity | `openclaw --version` in the image equals the tag prefix |
| Size | Compressed and uncompressed size increase is recorded |
| Trivy | No fixable CRITICAL or HIGH finding; unfixed ones are listed for sign-off |

## Error cases

| Case | Expected result |
| --- | --- |
| Base digest changed to a single-architecture index | Build fails before installing packages |
| apt resolution would change a held package | Build fails |
| An `apt-packages.txt` version is no longer available | Build fails and names the package; re-resolve per the pin policy |
| Artifact checksum mismatch | Build fails before the file is installed |
| Python hash mismatch | `pip install --require-hashes` fails the build |
| Frontend install needs a package missing from the store | Offline install fails with `ERR_PNPM_NO_OFFLINE_META`; the fixture reports it |
| Tag input does not match `^<x.y.z>-tools\.<n>$` or already exists | Phase 4 workflow rejects it before any push |
| Standard path receives a `-tools.` tag | Phase 4 workflow rejects it |

## Review reconciliation

Status of the [2026-10-30 Claude Code review](https://github.com/derekhsu/NemoClaw/issues/16#issuecomment-6517334794)
against the expanded issue and the decisions in [decisions.md](decisions.md).

| Finding | Status | Resolution |
| --- | --- | --- |
| B1 controlled packages vs. apt | Resolved in design | Conflict reproduced and fixed by a Perl 5.44 rebuild ([verification.md](verification.md)); hold every inventory package; compare versions before and after; re-resolve pins per release |
| B2 deployment consumer | Confirmed in #18 | clawshell-gateway passes the blueprint `sandbox_source` to OpenShell unchanged; a digest reference works ([deployment acceptance](#deployment-acceptance-18)) |
| B3 sandbox policy | Split | Docker-level fixtures here use unique LibreOffice profiles and `pdffonts`; Landlock paths were checked in #18 ([deployment acceptance](#deployment-acceptance-18)); the 512-process limit is not yet measured |
| B4 base source and version | Resolved | Digest fixed in `Dockerfile.tools`; version read from `openclaw --version`; base user and architecture checks fail closed |
| B5 tag namespace | Resolved in design, implemented in Phase 4 | One tools tag, no architecture tags; reject existing tags; standard path rejects `-tools.` |
| B6 vulnerability standard | Resolved | Trivy JSON; no fixable CRITICAL/HIGH; maintainer signs off unfixed findings |
| Docs location | Accepted | Fork documentation goes in `docs/modification/`, not Fern `docs/` |
| Metadata comparison | Accepted | See image checks; `Dockerfile.tools` does not redeclare `ENTRYPOINT` |
| Workflow permissions and guards | Accepted for Phase 4 | `contents: read`, repository guard, publication only from `feat/image-only-cli` |
| Partial publication | Accepted for Phase 4 | Report tags and digests already written |
| Package set | Done | `--no-install-recommends`; Liberation and DejaVu fonts added; size recorded |
| Build-args guard | No change | `Dockerfile.tools` declares no `*_INTEGRITY` or `*_TARBALL` ARG |

## Deployment acceptance (#18)

First amd64 round on 2026-11-01, in the maintainer's test deployment.
Results, decisions, and screenshots are in the
[#18 comments](https://github.com/derekhsu/NemoClaw/issues/18).

### Deployment

| Item | Value |
| --- | --- |
| Tools release | `docker.io/derekhsu/openshell-openclaw:2026.9.2-tools.1` |
| Index digest | `sha256:d22a7f704413c8a0ab1ececc2c422209d2906481dfc6cec38ff19da7e377a107` |
| amd64 manifest digest | `sha256:2a05b9d0969b7d50967efc205af0fe9a85ce2a9aa4af5c1b3e2f542dc3f1c7aa` |
| amd64 image ID (config digest) | `sha256:9e08b5cb5e7200582e9c1e35aaade75b45aa1bfe52b04a406470e1a6f84409ff` |
| Runtime | OpenShell 0.0.92 with the Podman driver. The blueprint requires 0.0.101; the maintainer accepted the difference |
| Deployment system | clawshell-gateway `main-486fcba0`, test stack |
| Image selection | Blueprint `sandbox_source` set to `derekhsu/openshell-openclaw@sha256:2a05b9d0…` |
| Transfer | The host has no Internet access. The amd64 manifest and blobs were copied as an oci-archive and loaded with `podman load`; the manifest digest and image ID stayed the same as on Docker Hub |
| Network policy | Restricted tier with one custom preset that lets only the headless Chrome binary reach the internal SSO site and its redirect host on port 443 |

### Results

| Check | Result |
| --- | --- |
| Sandbox start | OpenShell reported Ready about 2 seconds after creation |
| clawshell-gateway provisioning | Marked `error`. `openclaw onboard` prints a retired-config warning on stderr, and the gateway treats any `ERROR:` line as fatal. A sandbox from the standard `2026.9.2-r2` blueprint fails the same way, so the tools image is not the cause. The fix is clawshell-gateway PR #190 |
| Phase 2 fixtures | 18 of 19 pass. `controlled_packages` fails because the policy gives no read access to `/var/lib/dpkg`; the same check passes in the build workflow |
| Phase 3 fixtures | 5 of 5 pass |
| `AF_UNIX` | Stream sockets and `socketpair` work; LibreOffice needs no shim |
| Python Playwright on the allowed site | Opens the page, clicks and types into a field, and saves a screenshot. The form is not submitted |
| Denied destinations | `curl` to the allowed site, Chrome to a public site, and Chrome to an undeclared internal host are all denied |

### Open items

- OpenClaw browser tool journey through an agent session: needs working
  clawshell-gateway provisioning.
- arm64 acceptance: the test host is amd64. Deferred, not scheduled.
- Cold-start budget: one measurement of about 2 seconds to Ready; no limit set.
- 512-process limit under parallel LibreOffice and Chromium: not measured.
