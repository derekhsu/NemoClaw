<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Phase 5 Review: Security, Inventory, Capacity, and Handoff

The image results below come from verify run
[41261560595](https://github.com/derekhsu/NemoClaw/actions/runs/41261560595)
(commit `994d434`) on native amd64 and arm64 runners. No image was pushed.
The "Later sign-offs" subsection names its own sources.

## Package inventory

- All 25 Debian pins in `apt-packages.txt` and `apt-packages-browser.txt`
  match the installed versions in `image/tools-packages.tsv` on both
  architectures.
- `openclaw --version` prints `OpenClaw 2026.9.2 (3928bad)` on both
  architectures, which matches the base.
- All 24 fixtures pass on both architectures.

## Capacity

| Architecture | Base bytes | Tools bytes | Added bytes |
| --- | ---: | ---: | ---: |
| amd64 | 2,262,304,989 | 5,624,750,594 | 3,362,445,605 |
| arm64 | 2,272,202,182 | 5,534,615,070 | 3,262,412,888 |

The maintainer accepted the added size on 2026-11-01 (Phase 3). The
cold-start budget moves to
[#18](https://github.com/derekhsu/NemoClaw/issues/18).

## Vulnerability scan

Trivy scanned the tools image and its base. The counts below are CRITICAL and
HIGH findings, compared by CVE and package.

| Finding | Tools image | Base | Added by tools layer |
| --- | ---: | ---: | ---: |
| Fixable | 11 | 11 | 0 |
| No fix available | 372 | 141 | 231 (67 CVEs) |

The 11 fixable findings come from the base and are tracked in
[#19](https://github.com/derekhsu/NemoClaw/issues/19). The CI gate passes
because the tools layer adds no fixable finding.

The decision for group 6 requires the maintainer to sign off each unfixed
CRITICAL or HIGH finding by name. For `2026.9.2-tools.1`, the tools layer adds
the 67 CVEs in the next table; the set is the same on amd64 and arm64.

Sign-off status: **signed off**. The maintainer (`derekhsu`) accepted all 67
CVEs below by name on 2026-11-01. A later tools release re-resolves the
Debian versions and picks up any fix that Debian publishes.

| Source | CVE | Severity | Packages | Debian status |
| --- | --- | --- | --- | --- |
| libxml2 | CVE-2026-6653 | CRITICAL | `libxml2` | `affected` |
| libxml2 | CVE-2026-74860 | HIGH | `libxml2` | `affected` |
| libxml2 | CVE-2026-86138 | HIGH | `libxml2` | `affected` |
| libxml2 | CVE-2026-86139 | HIGH | `libxml2` | `affected` |
| libxml2 | CVE-2026-86140 | HIGH | `libxml2` | `affected` |
| libxml2 | CVE-2026-86142 | HIGH | `libxml2` | `affected` |
| libxml2 | CVE-2026-86143 | HIGH | `libxml2` | `affected` |
| libxml2 | CVE-2026-86144 | HIGH | `libxml2` | `affected` |
| Chromium | CVE-2026-119260 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119261 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119262 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119263 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119264 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119265 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119266 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119267 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119268 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119269 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119270 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-119271 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-76024 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-76025 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-76026 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-76027 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-76028 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-76029 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-76030 | HIGH | `chromium`, `chromium-common` | `affected` |
| Chromium | CVE-2026-76031 | HIGH | `chromium`, `chromium-common` | `affected` |
| FFmpeg | CVE-2026-58049 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-64830 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-64832 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-64833 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-64834 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-64835 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-66036 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-66039 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-66040 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-66041 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-70628 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-70632 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-75142 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-75143 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-75144 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| FFmpeg | CVE-2026-75146 | HIGH | FFmpeg libraries (9 packages) | `fix_deferred` |
| Tesseract | CVE-2026-73066 | HIGH | `libtesseract5`, `tesseract-ocr` | `affected` |
| Tesseract | CVE-2026-88047 | HIGH | `libtesseract5`, `tesseract-ocr` | `affected` |
| Tesseract | CVE-2026-88048 | HIGH | `libtesseract5`, `tesseract-ocr` | `affected` |
| Tesseract | CVE-2026-88051 | HIGH | `libtesseract5`, `tesseract-ocr` | `affected` |
| Tesseract | CVE-2026-88052 | HIGH | `libtesseract5`, `tesseract-ocr` | `affected` |
| Tesseract | CVE-2026-88053 | HIGH | `libtesseract5`, `tesseract-ocr` | `affected` |
| cJSON | CVE-2026-16554 | HIGH | `libcjson1` | `affected` |
| cJSON | CVE-2026-29036 | HIGH | `libcjson1` | `affected` |
| cJSON | CVE-2026-67215 | HIGH | `libcjson1` | `affected` |
| cJSON | CVE-2026-67216 | HIGH | `libcjson1` | `affected` |
| cJSON | CVE-2026-87933 | HIGH | `libcjson1` | `affected` |
| Other | CVE-2022-4055 | HIGH | `xdg-utils` | `fix_deferred` |
| Other | CVE-2025-71436 | HIGH | `libraptor2-0` | `affected` |
| Other | CVE-2026-116149 | HIGH | `imagemagick`, `imagemagick-7-common`, `imagemagick-7.q16`, `libmagickcore-7.q16-10`, `libmagickwand-7.q16-10` | `affected` |
| Other | CVE-2026-34980 | HIGH | `libcups2t64` | `affected` |
| Other | CVE-2026-36849 | HIGH | `libtiff6` | `will_not_fix` |
| Other | CVE-2026-37555 | HIGH | `libsndfile1` | `affected` |
| Other | CVE-2026-52490 | HIGH | `libtiff6` | `affected` |
| Other | CVE-2026-55453 | HIGH | `libcups2t64` | `affected` |
| Other | CVE-2026-86476 | HIGH | `libgstreamer-plugins-base1.0-0` | `affected` |
| Other | CVE-2026-88806 | HIGH | `libx11-6`, `libx11-data`, `libx11-xcb1` | `affected` |
| Other | CVE-2026-88807 | HIGH | `libxrender1` | `affected` |
| Other | CVE-2026-94286 | HIGH | `libxtst6` | `affected` |

### Later sign-offs

A tools release must not add an unfixed CRITICAL or HIGH finding that is
missing from this file. Each later sign-off below names the maintainer
(`derekhsu`) and its date.

`2026.9.2-tools.3`: the Trivy scan in release run
[41605644091](https://github.com/derekhsu/NemoClaw/actions/runs/41605644091)
reported 3 more unfixed HIGH CVEs from the tools layer. The maintainer signed
them off in a
[PR #37 comment](https://github.com/derekhsu/NemoClaw/pull/37#issuecomment-6596033545)
on 2026-11-03. The same comment accepts that Trivy cannot scan the himalaya
binary.

| Source | CVE | Severity | Packages | Debian status |
| --- | --- | --- | --- | --- |
| Other | CVE-2026-109089 | HIGH | `libxi6` | `affected` |
| Other | CVE-2026-109090 | HIGH | `libxi6` | `affected` |
| Other | CVE-2026-119123 | HIGH | `imagemagick`, `imagemagick-7-common`, `imagemagick-7.q16`, `libmagickcore-7.q16-10`, `libmagickwand-7.q16-10` | `affected` |

himalaya 2.2.1: Trivy cannot scan the binary. A manual dependency audit of
the v2.2.1 `Cargo.lock` and the release binary found the HIGH CVEs and the
applicable MEDIUM CVE below. Section 4.9 of
`docs/modification/2026-10-31-openclaw-tools-image.md` records the method and
the full result. The maintainer accepted them on 2026-11-03
([sign-off](https://github.com/derekhsu/NemoClaw/pull/42#issuecomment-6600751893)). After upstream
publishes a release with a fixed `rustls-webpki`, check the SQLite version in
its binary, then upgrade himalaya.

| Component | CVE | Severity | Why accepted |
| --- | --- | --- | --- |
| SQLite 3.50.4 (static) | CVE-2026-11824 | HIGH | Needs a crafted FTS5 database. himalaya uses SQLite only for pimdir accounts, and the pimdir schema has no FTS table. |
| SQLite 3.50.4 (static) | CVE-2026-119373 | HIGH | Needs a `detail=none` FTS5 table and a prefix `MATCH` query. pimdir runs no `MATCH`. |
| `rustls-webpki` 0.103.15 | CVE-2026-111943 | MEDIUM | Applies: the system CA store includes emSign roots. An attack needs a leaked emSign intermediate key and a network position. Listed because the finding applies to this image; the rule requires sign-off only for CRITICAL and HIGH. |

## Documentation

- The fork documentation is
  `docs/modification/2026-10-31-openclaw-tools-image.md`. Fern does not
  publish `docs/modification/`, so `npm run docs` does not apply.
- Independent documentation writer review, for the PR receipt:
  - Reviewer surface: Claude Code.
  - Scope: the fork doc, the track records, `scripts/openclaw-image-release.sh`,
    both image workflows, `Dockerfile.tools` comments, and `run-fixtures.sh`.
  - Result: `docs-updated`; evidence path
    `docs/modification/2026-10-31-openclaw-tools-image.md`.
  - The first review at `4434ea647` found 2 blocking and 6 non-blocking
    findings. Commit `6d58a965e` fixes all 8, and the re-review found no
    open finding (2026-11-01).
  - Metadata: head `6d58a965e`, `AGENTS.md` blob `248d426b1`. Refresh both
    values after any later change.

## Acceptance gaps

- Deployment acceptance, the sandbox policy run, the OpenClaw browser tool,
  and the cold-start budget move to
  [#18](https://github.com/derekhsu/NemoClaw/issues/18) (Task 5.3).
- Docker Hub login, push by digest, and `imagetools create` run only in the
  first real publication from `feat/image-only-cli`.

## Maintainer Manual Confirmation

On 2026-11-01, the maintainer (`derekhsu`) reviewed the Phase 5 documents and
verification evidence for commit `b5a81d16b` and confirmed the #16 scope
([confirmation](https://github.com/derekhsu/NemoClaw/pull/20#issuecomment-6555856173)).
The statement was:

> 我已審閱 Phase 5 文件與驗證證據，確認交付符合 #16 的範圍；實際部署與相關驗收由 #18 繼續追蹤，同意完成 Phase 5 的文件與交接人工確認。

This confirmation completes Phase 5 documentation and handoff for #16.
There are 23 completed phase tasks and two tasks transferred to #18.
Task 3.4 and Task 5.3 remain unperformed; the confirmation does not establish
deployment qualification or authorize image publication.

The tools verification run for commit `eb525178a` also passed on both native
architectures ([run 41281336276](https://github.com/derekhsu/NemoClaw/actions/runs/41281336276)).
Commit `b5a81d16b` adds the #23 managed-image CI base pin and its workflow
test; it does not change the tools Dockerfile, inputs, or fixtures.

## Publication handoff

0. Done: the maintainer signed off the 67 CVEs above on 2026-11-01.
1. Merge `codex/issue-16-tools-image` into `feat/image-only-cli`.
2. Run `Images / OpenClaw Sandbox` from `feat/image-only-cli` with variant
   `tools` and tag `2026.9.2-tools.1`.
3. Record the index digest from the run summary and give it to #18.

Each step needs separate maintainer authorization. This track creates no PR
and publishes no image.
