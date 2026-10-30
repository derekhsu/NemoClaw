<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Task 1.2: Pinned Inputs and Dependency Compatibility

All pins live under `tools/openclaw-tools-image/`. Every probe ran against
the r2 digest recorded in [base-inspection.md](base-inspection.md) on
`linux/amd64` (local emulation) and `linux/arm64`. No tools image was built or
published.

## Pinned inputs

| Area | File | Contents |
| --- | --- | --- |
| Debian packages | `apt-packages.txt` | 25 top-level packages with exact versions; same on both architectures |
| Downloaded artifacts | `artifacts.lock` | officecli 1.0.160, yq 4.54.1, p5.js 1.7.0, Text-CharWidth 0.04 source, pnpm 12.16.1 integrity |
| Python | `python/requirements.in`, `python/requirements.lock` | 20 direct packages; universal hash lock with 78 Linux packages, wheels only |
| Node.js documents | `node/package.json`, `node/package-lock.json` | docx, pptxgenjs, react, react-dom, react-icons, sharp |
| Frontend | `frontend-template/` | create-vite 9.3.3 `react-ts` output plus every package the pinned `web-artifacts-builder` scripts add; `pnpm-lock.yaml` with 419 packages |

Reused from the base without change: `jq=1.8.2-1` and
`libsqlite3-0=3.46.1-7+deb13u2` (both controlled). `sqlite3` resolves to the
same SQLite version.

## Compatibility results

| Check | amd64 | arm64 | Probe |
| --- | --- | --- | --- |
| Perl 5.44 rebuild of Text::CharWidth unblocks LibreOffice; controlled packages unchanged | Pass | Pass | [perl-rebuild-probe.sh](perl-rebuild-probe.sh) |
| Python lock installs non-root with `--require-hashes`; `pip check`; 21 module imports | Pass | Pass | [nemoclaw-py-probe.sh](nemoclaw-py-probe.sh) |
| imageio-ffmpeg uses its bundled ffmpeg 7.0.2; no runtime download | Pass | Pass | same |
| Node.js document libraries produce DOCX, PPTX, and PNG offline; sharp uses libvips 8.18.7 | Pass | Pass | [nemoclaw-node-offline.sh](nemoclaw-node-offline.sh) |
| Frontend: offline frozen install, `tsc -b`, `vite build`, Parcel build, html-inline single file | Pass | Pass | same, after [nemoclaw-node-fetch.sh](nemoclaw-node-fetch.sh) |
| officecli with `libicu76`: create, edit, validate, read back DOCX/XLSX/PPTX; formula readback | Pass | Pass | [nemoclaw-officecli-journey.sh](nemoclaw-officecli-journey.sh) |
| yq binaries match the release checksums | Pass | Pass | `artifacts.lock` |

The offline runs used `--network none`, a read-only root, a writable `/tmp`,
the `sandbox` user, no capabilities, and `no-new-privileges`. The pnpm store
and npm cache were filled in a separate online run, standing in for build time.

## Findings that shape the Dockerfile

- **Text::CharWidth:** Debian `0.04-11` carries no source patches. It differs
  from the upstream source only in hardening flags (`hardening=+all`),
  `dh_perl -d`, and `Multi-Arch: same`. Build it with `dpkg-buildflags`
  hardening in a separate stage and copy only the package.
- **officecli** aborts without ICU. `libicu76` is required; it is not in the base.
- **pnpm 12** fails on unreviewed dependency build scripts.
  `frontend-template/pnpm-workspace.yaml` denies scripts for `@parcel/watcher`,
  `@swc/core`, `lmdb`, and `msgpackr-extract`; their prebuilt platform packages
  are enough for the tested builds.
- **Offline pnpm** needs both the package store and the metadata cache. A
  store-only fetch fails with `ERR_PNPM_NO_OFFLINE_META`.
- **Parcel** needs the skill's `tsconfig.json` `compilerOptions.paths` edit and
  no Vite-only `/favicon.svg` link. The template still contains create-vite's
  sample files; Phase 3 decides the final template contents.
- **Chromium:** Debian provides `156.0.8078.73`; Playwright 1.64.1 expects
  Chromium revision 1248 (`156.0.8078.4`). Sharing one browser is plausible
  but untested; Phase 3 must prove it or install Playwright's build.

## Open items for Task 1.3

- **Debian pin policy:** exact versions disappear from `deb.debian.org` after
  later security updates. Choose between a `snapshot.debian.org` timestamp
  and re-resolving pins on each tools revision.
- **`soffice.py` shim:** the skill helper compiles an `LD_PRELOAD` shim with
  `gcc` only when `socket(AF_UNIX)` fails. It reuses an existing
  `$TMPDIR/lo_socket_shim.so`. Confirm `AF_UNIX` behavior in the real
  OpenShell sandbox; if blocked, decide between a prebuilt shim and a runtime
  compiler.
- **officecli freshness:** 1.0.160 was published on 2026-10-30, the same day
  it was pinned. Its license is Apache-2.0.
- **TypeScript 7:** the template pins `typescript ~7.0.2`. The skill also adds
  `baseUrl` to `tsconfig.app.json`; that edit was not tested with `tsc -b`.
