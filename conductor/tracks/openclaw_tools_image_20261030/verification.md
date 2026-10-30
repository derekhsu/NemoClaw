<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Verification: OpenClaw Tools Image

## Task 1.1: Published base inspection

The maintainer selected `2026.9.2-r2`. Registry and local process inspection
completed for both platform images. See [base-inspection.md](base-inspection.md)
for identities, commands, outcomes, and the distinction between local emulation
and native qualification. This evidence has not qualified the tools image.

An initial anonymous Docker Hub HTTPS request through Homebrew Python 3.15.2
failed with `CERTIFICATE_VERIFY_FAILED: unable to get local issuer certificate`.
The user authorized handling routine environment failures. Request-local
`SSL_CERT_FILE=/etc/ssl/cert.pem` resolved the issue without disabling peer
verification or changing the system trust store.

## Dependency-resolution evidence

An ephemeral root container used the selected base to hold every package in its
controlled inventory, refresh its configured apt indexes, and simulate the
required system-package installation with `--no-install-recommends`.
It did not install the additional packages or modify the published image.

On both architectures, the proposed installation returned apt status 100.
LibreOffice Calc requires `ucf`, whose dependency chain reaches
`libtext-charwidth-perl` requiring `perlapi-5.40.0`. The selected image has the
controlled custom `perl-base=5.44.0-1nemoclaw1`. Apt cannot satisfy that chain
while retaining the held Perl package. This is a reproduced dependency conflict,
not only the earlier review's inferred risk.

Task 1.2 must resolve this conflict without downgrading controlled Perl or
pretending the old ABI is compatible. The negative dependency result does not
qualify the tools image.

The recorded output includes the package candidates and solver chain for
[amd64](apt-simulation-amd64.log) and [arm64](apt-simulation-arm64.log).
The probe used the r2 digest with `--platform linux/<architecture>`, `--user root`,
`--cap-drop ALL`, `--security-opt no-new-privileges`, and `/bin/bash` as the
inspection entrypoint. Inside the disposable container it ran:

```bash
while IFS='=' read -r package version; do
  if [ "$package" = architecture ]; then continue; fi
  test "$(dpkg-query -W -f='${Version}' "$package")" = "$version"
  apt-mark hold "$package" >/dev/null
done < /usr/local/share/nemoclaw/security-packages.txt
apt-get -o APT::Sandbox::User=root -o Acquire::Retries=2 update
apt-get -o APT::Sandbox::User=root --simulate install --no-install-recommends \
  libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress \
  pandoc poppler-utils qpdf ghostscript \
  tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-tra tesseract-ocr-chi-sim \
  imagemagick ffmpeg libimage-exiftool-perl chromium \
  fontconfig fonts-noto-cjk fonts-liberation fonts-dejavu-core \
  zip unzip ripgrep sqlite3
```

## Contributor environment

`npm run dev:doctor -- --json` returned status 1: 16 checks passed and six failed.
The failed checks concern missing plugin dependencies, missing CLI/plugin build
artifacts, CLI type checking, Docker reporting 7.8 GiB instead of the requested
8 GiB minimum, and the host-visible CLI pointing to another installation.
The doctor did not change these settings. No host CLI exposure or Docker memory
change has been performed. These checks do not invalidate the recorded base
inspection; they remain setup gates for the later applicable work.

## Earlier planning evidence

The track's planning validation passed Markdown lint, metadata, task counts,
local links, and independent documentation writer review. After local dependency
installation, `npm run docs` passed with zero errors and two warnings.
Those earlier results are not tools-image build or deployment qualification.

## Perl ABI conflict resolution probe

`Text-CharWidth-0.04.tar.gz` was downloaded from CPAN and checked against
SHA-256 `abded5f4fdd9338e89fd2f1d8271c44989dae5bf50aece41b6179d8e230704f8`.
[perl-rebuild-probe.sh](perl-rebuild-probe.sh) ran inside a disposable root
container from the r2 digest on each architecture. The script holds every
controlled package, builds the module against the controlled Perl 5.44
(`perl Makefile.PL INSTALLDIRS=vendor`, `make test`), packages it as
`libtext-charwidth-perl=0.04-11+nemoclaw1`, installs it, and repeats the
complete system-package simulation.

| Check | linux/amd64 | linux/arm64 |
| --- | --- | --- |
| `make test` | `Result: PASS` | `Result: PASS` |
| Module loads under Perl 5.44 | Pass | Pass |
| Tools apt simulation | 382 packages, no unmet dependency | 379 packages, no unmet dependency |
| 27 controlled package versions | Unchanged | Unchanged |
| Probe `.deb` SHA-256 | `49c5c3ea640796273483a2ab1a6bbb791394052dcf6ccb21e20735c0bb9722b6` | `941bc499773a5c7499a78435f73402f7b595f182dfbbc32e2f85e6afe912cc19` |

Simulation output after the rebuild is in
[amd64](apt-simulation-rebuilt-perl-amd64.log) and
[arm64](apt-simulation-rebuilt-perl-arm64.log). `libtext-wrapi18n-perl` and
`ucf` are architecture-independent and resolved from Debian without further
Perl ABI requirements.

An earlier run of the same probe with `--cap-drop ALL` failed before the
build because root could not write the apt archive cache. The passing runs kept
`no-new-privileges` and used default container capabilities.

Limits of this result:

- The rebuild uses upstream CPAN 0.04 and does not apply Debian's
  `0.04-11` patches. Task 1.2 must review those patches before pinning.
- The probe installed `gcc`, `make`, and `libc6-dev`. `Dockerfile.tools` must
  build the module in a separate stage and copy only the package, so the final
  image keeps no compiler.
- This is a dependency-resolution and module-load result. It does not qualify
  LibreOffice conversion or any other tool.
