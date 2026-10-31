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
| Office files | python-docx-free path: `docx`, `pptxgenjs`, `openpyxl` create DOCX/PPTX/XLSX; officecli edits, validates, and reads back each file | 2 |
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
| B2 deployment consumer | Moved to #18 | The review names clawshell-gateway `blueprint.sandbox_source` as the consumer; #18 must confirm it |
| B3 sandbox policy | Split | Docker-level fixtures here use unique LibreOffice profiles and `pdffonts`; Landlock paths and the 512-process limit are checked in #18 |
| B4 base source and version | Resolved | Digest fixed in `Dockerfile.tools`; version read from `openclaw --version`; base user and architecture checks fail closed |
| B5 tag namespace | Resolved in design, implemented in Phase 4 | One tools tag, no architecture tags; reject existing tags; standard path rejects `-tools.` |
| B6 vulnerability standard | Resolved | Trivy JSON; no fixable CRITICAL/HIGH; maintainer signs off unfixed findings |
| Docs location | Accepted | Fork documentation goes in `docs/modification/`, not Fern `docs/` |
| Metadata comparison | Accepted | See image checks; `Dockerfile.tools` does not redeclare `ENTRYPOINT` |
| Workflow permissions and guards | Accepted for Phase 4 | `contents: read`, repository guard, publication only from `feat/image-only-cli` |
| Partial publication | Accepted for Phase 4 | Report tags and digests already written |
| Package set | Done | `--no-install-recommends`; Liberation and DejaVu fonts added; size recorded |
| Build-args guard | No change | `Dockerfile.tools` declares no `*_INTEGRITY` or `*_TARBALL` ARG |
