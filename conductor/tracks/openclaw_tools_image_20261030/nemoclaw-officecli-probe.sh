#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
while IFS='=' read -r p _; do [[ $p == architecture ]] || apt-mark hold "$p" >/dev/null; done </usr/local/share/nemoclaw/security-packages.txt
apt-get -qq -o APT::Sandbox::User=root update && apt-get -qq -y -o APT::Sandbox::User=root install --no-install-recommends libicu76=76.1-4 >/dev/null
case $(dpkg --print-architecture) in amd64) b=officecli-linux-x64 ;; arm64) b=officecli-linux-arm64 ;; esac
install -m 0755 "/a/$b" /usr/local/bin/officecli
