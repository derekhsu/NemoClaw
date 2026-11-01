#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
arch=$(dpkg --print-architecture)
inventory=/usr/local/share/nemoclaw/security-packages.txt
while IFS='=' read -r package version; do
  if [[ "$package" != architecture ]]; then apt-mark hold "$package" >/dev/null; fi
done <"$inventory"
apt-get -qq -o APT::Sandbox::User=root update
apt-get -y -o APT::Sandbox::User=root install --no-install-recommends gcc make libc6-dev
printf '%s\n' 'abded5f4fdd9338e89fd2f1d8271c44989dae5bf50aece41b6179d8e230704f8  /source/Text-CharWidth-0.04.tar.gz' | sha256sum -c -
mkdir -p /tmp/charwidth-source /tmp/charwidth-stage
tar -xzf /source/Text-CharWidth-0.04.tar.gz --strip-components=1 -C /tmp/charwidth-source
cd /tmp/charwidth-source
perl Makefile.PL INSTALLDIRS=vendor
make -j2
make test
make pure_install DESTDIR=/tmp/charwidth-stage
mkdir -p /tmp/charwidth-stage/DEBIAN
cat >/tmp/charwidth-stage/DEBIAN/control <<CONTROL
Package: libtext-charwidth-perl
Version: 0.04-11+nemoclaw1
Architecture: ${arch}
Depends: libc6 (>= 2.41), perl-base (= 5.44.0-1nemoclaw1)
Maintainer: NemoClaw fork dependency audit
Description: Text::CharWidth rebuilt against the selected r2 Perl ABI for a dependency probe
CONTROL
dpkg-deb --build --root-owner-group /tmp/charwidth-stage "/out/libtext-charwidth-perl-${arch}.deb"
dpkg -i "/out/libtext-charwidth-perl-${arch}.deb"
perl -MText::CharWidth=mbswidth -e 'die "width mismatch" unless mbswidth("abc") == 3; print "perl-5.44-charwidth-load-ok\n"'
printf '\nTOOLS_DEPENDENCY_SIMULATION\n'
apt-get --simulate install --no-install-recommends \
  libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress \
  pandoc poppler-utils qpdf ghostscript \
  tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-tra tesseract-ocr-chi-sim \
  imagemagick ffmpeg libimage-exiftool-perl chromium libicu76 \
  fontconfig fonts-noto-cjk fonts-liberation fonts-dejavu-core \
  zip unzip ripgrep sqlite3
printf '\nCONTROLLED_PACKAGE_CHECK\n'
while IFS='=' read -r package version; do
  if [[ "$package" == architecture ]]; then continue; fi
  [[ "$(dpkg-query -W -f='${Version}' "$package")" == "$version" ]]
done <"$inventory"
printf 'controlled-packages-unchanged\n'
sha256sum "/out/libtext-charwidth-perl-${arch}.deb"
