<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Phase 3 Evidence: Browser and Offline Frontend Tasks

## Runs

| Run | Source | Result |
| --- | --- | --- |
| [41220886109](https://github.com/derekhsu/NemoClaw/actions/runs/41220886109) | `35b4969`: Phase 3 fixtures on the Phase 2 image | Expected failure: 19 Phase 2 checks pass, all 5 Phase 3 checks fail |
| [41225252941](https://github.com/derekhsu/NemoClaw/actions/runs/41225252941) | `9abc0a9`: Chromium, headless shell, p5.js, frontend template | 24/24 fixtures pass on amd64 and arm64; tools layer adds 0 fixable CRITICAL/HIGH findings |

## Results of run 41225252941

| Check | amd64 | arm64 |
| --- | --- | --- |
| Debian Chromium 156.0.8078.73 headless screenshot as `sandbox` | Pass | Pass |
| Python Playwright default launch with `HOME=/sandbox`: Chrome Headless Shell 156.0.8078.4; fill, click, screenshot | Pass | Pass |
| Python Playwright with `executable_path=/usr/lib/chromium/chromium` and a writable home | Pass | Pass |
| Frontend: `cp -a` template, `pnpm run build`, Parcel build, html-inline single file, then a browser journey on the bundle | Pass | Pass |
| p5.js 1.7.0 from the image draws a red canvas pixel | Pass | Pass |
| Phase 2 fixtures | 19/19 | 19/19 |
| Build time | 188 s | 161 s |
| Uncompressed size: base → tools | 2.26 GB → 5.62 GB (+3.36 GB) | 2.27 GB → 5.53 GB (+3.26 GB) |

All fixtures run with `--network none`; any download attempt fails them.

## Findings

- **Browser sharing:** Python Playwright can drive Debian Chromium through
  `executable_path` when `HOME` is writable. Debian Chromium's crash handler
  aborts when `HOME` is read-only; the headless shell does not. Skill scripts
  call `chromium.launch()` without a path, so the image also ships the pinned
  Chrome Headless Shell revision 1248 and links
  `/sandbox/.cache/ms-playwright` to it.
- **pnpm store:** pnpm 12 keeps a SQLite store index and a `projects`
  directory, so a store under the read-only `/usr` tree cannot serve installs.
  The template ships with `node_modules` installed and no store. `cp -a`
  keeps pnpm's relative links. Adding packages needs the network.
- **pnpm run:** pnpm 12 reinstalls before `pnpm run` by default
  (`verifyDepsBeforeRun`); offline, it retried for 16 minutes and broke
  `node_modules`. The template turns it off.
- **Skill template drift:** the pinned `web-artifacts-builder` setup does not
  build with today's latest packages. The template keeps the skill's
  configuration and shadcn components but:
  - drops `baseUrl` (removed in TypeScript 7 and not needed for `paths`);
  - uses react-day-picker 9 and react-resizable-panels 2, the majors the
    components target;
  - removes the Vite `favicon.svg` link that breaks Parcel;
  - uses TypeScript 6.0.3, because TypeScript 7.0.2 ships a Go binary with
    fixed HIGH findings;
  - overrides `minimist` to 1.2.8 for CVE-2021-44906 pulled by html-inline.
- The skill's `init-artifact.sh` runs `pnpm create vite` and `pnpm install`,
  which need the network. Offline projects start from the template instead.

## Moved to #18

Task 3.4 (OpenClaw browser tool, deployment policy, declared and denied
destinations) needs the real OpenShell sandbox and moves to
[#18](https://github.com/derekhsu/NemoClaw/issues/18).
