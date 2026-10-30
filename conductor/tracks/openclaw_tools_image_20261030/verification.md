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
