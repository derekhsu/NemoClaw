<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Specification: OpenClaw Tools Image

- Track ID: `openclaw_tools_image_20261030`
- Type: Feature
- Created: 2026-10-30
- Status: Phase 1 input inspection; operational decisions remain pending
- Issue: [derekhsu/NemoClaw #16](https://github.com/derekhsu/NemoClaw/issues/16)
- Branch: `codex/issue-16-tools-image`
- Base: `feat/image-only-cli`, commit `70ff5c849`

## Outcome and authority

The fork maintainer can publish a tools image derived from a published full
OpenClaw image. Deployment operators can choose the standard or tools image by
immutable digest. The tools image supplies the accepted document, media,
browser, and skill dependencies without downloads during ordinary sandbox work.

The user accepted the fork-specific tool scope in this conversation and issue #16.
This is not an NVIDIA/NemoClaw support claim. The fork maintainer owns the
tool set, compatibility, security updates, and rebuilds. No implementation owner
is assigned on GitHub. This track records requirements and the implementation
sequence; it does not approve unresolved operational decisions or publication.

Existing Conductor product documents describe Hermes uploader work. They remain
unchanged. This OpenClaw track uses its own accepted issue as scope authority.

## Current behavior and change boundary

`.github/workflows/openclaw-sandbox-image.yaml` builds `Dockerfile.base` and
`Dockerfile` for Linux amd64 and arm64. It accepts a tag and updates `latest`,
`openclaw-<version>`, and architecture tags. It does not offer a tools variant.

Add `Dockerfile.tools` at the repository root. Derive from a digest-pinned full
`docker.io/derekhsu/openshell-openclaw` image, not the intermediate base image.
The maintainer selected release tag `2026.9.2-r2`, whose inspected index digest is
`sha256:8f951046eaf0de9f2e00fb7ff7d8d33de62e5c5890758289e27ec405fb5c1d02`.
Use that digest; the bare `2026.9.2` tag points to an older release artifact.
Keep the selected OpenClaw and Node.js versions. Preserve the entrypoint,
command, working directory, required environment, healthcheck, and compatible
non-root runtime user. Installation runs during image construction.

Extend the fork publication workflow to choose `standard` or `tools`. A tools
build consumes an already-published standard image; it does not rebuild that
runtime. Tools tags use `<OpenClaw-version>-tools.<revision>` with distinct
architecture tags. Neither publication path may overwrite the other variant's
tags. Tools publication must not move standard aliases.

## Required tool inventory

Reconcile each item with the selected base inventory. Reuse installed tools when
they satisfy the required behavior; do not replace security-pinned packages just
to repeat an installation. Record exact versions, architecture, artifact source,
checksums where applicable, and the resolved dependency inventories.

| Area | Required tools or packages |
| --- | --- |
| Office | LibreOffice core, Writer, Calc, Impress; `soffice`; `officecli` |
| PDF | Pandoc, Poppler tools, qpdf, Ghostscript |
| OCR | Tesseract; `eng`, `chi_tra`, `chi_sim` language data |
| Images and media | ImageMagick 7 providing `magick`; ffmpeg and ffprobe; ExifTool |
| Browser | Chromium, its system libraries, fonts, and writable runtime directories |
| Fonts | fontconfig, Noto CJK, Liberation, DejaVu Core |
| Workspace | zip, unzip, ripgrep, Mike Farah yq, yamllint, sqlite3 CLI; reuse jq |
| Python documents | pypdf, pdfplumber, reportlab, pytesseract, pdf2image, openpyxl, pandas, markitdown with required pptx support, Pillow, defusedxml, lxml |
| Python media and charts | imageio, imageio-ffmpeg, numpy, matplotlib |
| Python automation | playwright, PyYAML, anthropic, mcp |
| Node.js documents | docx, pptxgenjs, react, react-dom, react-icons, sharp |
| Frontend tools | compatible Node.js/npm, pinned pnpm, TypeScript, Vite, React TypeScript template, Node.js and React type definitions |
| Frontend styles | tailwindcss, postcss, autoprefixer, tailwindcss-animate, class-variance-authority, clsx, tailwind-merge, lucide-react, next-themes |
| Frontend components | all Radix UI/shadcn dependencies actually required by the pinned template |
| HTML packaging | parcel, @parcel/config-default, parcel-resolver-tspaths, html-inline |
| Browser art | pinned local or embedded p5.js assets |

Ghostscript, ExifTool, yamllint, and sqlite3 are required, although earlier
discussion called them optional. `mediainfo` is excluded; use ffprobe JSON.

The dependency audit reference for Anthropic skills is revision
`ca45fc496a3436251f191354091d557da31c15b5`. Package installation alone does not
install those skills. Any copied templates, helpers, schemas, or assets need a
separate source and usage review within the accepted dependency preparation.
Do not copy or redistribute the entire skills repository automatically.

## Runtime requirements

- Python imports and CLI entry points must work from the agent's actual
  environment and writable working directory. Provide the Python command names
  required by the selected helper scripts.
- Node.js modules must resolve from the agent workspace. Global npm installation
  is not evidence that `require` or `import` works there.
- Frontend creation, dependency installation, and single-file HTML packaging must
  work without external downloads, using a fixed template, lockfiles, and an
  offline dependency store. Installing pnpm alone is insufficient.
- Python Playwright must use an installed compatible browser. Sharing Chromium
  with OpenClaw requires evidence on both architectures; do not assume matching
  versions. Track separate binaries explicitly if sharing fails.
- OpenClaw browser plugin and tool access must be enabled for the test agent.
  Chromium must run headless as a non-root user. Profile, cache, and download
  directories must be writable under the real deployment policy.
- LibreOffice uses a unique writable profile for each conversion. Matplotlib
  requires verified CJK settings and a cache usable by the runtime identity.
- Resolve the selected `soffice.py` helper's possible compiler call before
  claiming offline operation. Prefer build-time preparation. A runtime compiler
  requires an explicit decision; do not silently add one or hide helper failure.
- ExifTool dependencies must coexist with the controlled Perl packages. sqlite3
  CLI installation must preserve the controlled SQLite library versions.
- Pin imageio-ffmpeg's executable source and prove it needs no runtime download.

## Acceptance evidence

| Journey | Required evidence |
| --- | --- |
| Office | Create, edit, read back, and validate DOCX/XLSX/PPTX through the selected libraries and officecli; recalculate spreadsheet formulas with LibreOffice; convert each Office format to PDF; check text, fonts, and layout |
| PDF and OCR | Extract text/images, render pages, inspect PDF structure, and OCR English/Traditional Chinese/Simplified Chinese fixtures with expected text |
| PS/EPS | Convert controlled fixtures through Ghostscript without disabling its security mode; inspect the resulting PDF |
| Images and media | Convert an image with magick, read/write fixture metadata with ExifTool, create a GIF, transcode media, and assert ffprobe JSON fields |
| Charts | Render CJK, Latin text, and negative labels with matplotlib; inspect missing-glyph diagnostics and output |
| Browser | Through OpenClaw, navigate to a controlled page, click, type, and capture a screenshot; repeat a Python Playwright journey |
| Frontend | Create a project from prepared inputs, build it, and package a self-contained HTML artifact without downloads |
| Workspace | ZIP round trip, rg search, yq modification/readback, yamllint valid/invalid fixtures, and sqlite3 write/read plus read-only fixture access |
| Boundaries | Every applicable journey runs non-root on Linux amd64 and arm64 under the selected deployment policy; ordinary fixtures need no external download |

Browser website egress is explicitly allowed only for the controlled test
destination. Existing denied routes must remain denied. Distinguish a missing
browser, disabled plugin, denied tool, failed launch, and denied destination.
No broad network access, privileged container, added capability, or silent
browser security downgrade may substitute for the accepted boundary.

Preserve the base image's controlled package versions and run checks appropriate
to that base revision. Do not compare an older base to a newer checkout's package
list and call the mismatch a regression. Record scanner reports and explicit
acceptance under the decision below. Record image size, cold pull/start timings,
and the timeout budget for the selected deployment.

Reject unsupported repositories, mutable base references, missing architectures,
root runtime users, version/tag mismatch, invalid variant or tag, and an existing
release tag before moving aliases. Both architectures must pass before a tools
multi-architecture release is claimed. On partial publication, report existing
digests/tags; do not claim atomic publication or erase artifacts without consent.

## Decisions required before implementation or release

The earlier Claude Code review has six unresolved finding groups. Its package
conflicts were inferred, not reproduced. Later tool additions were not reviewed
by that report. Phase 1 must produce a decision and evidence for each group.

1. **Base and packages:** retain the selected r2 digest and its inspected runtime
   metadata, and choose where the reviewed digest is stored. Choose package
   pins, package source policy, and the mechanism
   that prevents controlled-package drift. Test dependency resolution before
   promising that the expanded inventory can install together.
2. **Deployment consumer:** confirm the actual ClawShell deployment path, exact
   image-selection setting, test operator, and evidence location. Existing docs
   identify it as a candidate, not a verified current contract. Do not assume
   this fork implements upstream `--from-image`.
3. **Sandbox policy:** name the actual deployment policy and writable paths;
   resolve browser/Office requirements without silently widening that policy.
4. **Version identity:** derive tools release identity from the selected base,
   not the current checkout's OpenClaw pin. Treat issue #14's runtime upgrade as
   independent work.
5. **Publication:** define both tag grammars, immutable release behavior, allowed
   publication ref, repository restriction, credentials, and partial-failure
   reporting. Standard and tools tag protection must work in both directions.
6. **Security acceptance:** choose a scanner/report format and pass threshold or
   named maintainer sign-off rule. Name an owner and record accepted findings;
   do not substitute an undefined vulnerability review for a release condition.

officecli's version, verified artifacts, architecture support, runtime behavior,
and usage terms must also be established. If an architecture or required tool
cannot meet acceptance, return the concrete constraint for a scope decision;
do not silently remove it or claim complete support.

## Ownership, validation, and exclusions

The image publisher owns image contents and compatibility; the deployment
operator owns deployment configuration and live evidence. The fork maintainer
chooses the named implementation and acceptance owners in Phase 1. Tools images
are explicitly selected; existing deployments do not switch automatically.

Publication targets only fork-owned Docker Hub destinations. CI registry
credentials must not enter image layers, sandbox runtime configuration, logs,
package configuration, or artifacts. Existing runtime credential custody
and required negative security checks remain unchanged.

Exclude Hermes changes, runtime upgrades, Lightpanda integration, additional
browser engines, mediainfo, a general package manager feature, arbitrary install
commands, automatic skill installation, full TeX Live, Claude Code CLI, new API
access, and blanket policy relaxation. External APIs and logins still require
deployment authorization. No host CLI exposure or live resource creation is
authorized by creating this track. Publication and PR submission are separate
actions after implementation and required review.
