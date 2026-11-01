#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
export HOME=/tmp/home
mkdir -p $HOME
rm -rf /tmp/app && cp -R /in/frontend-template /tmp/app && cd /tmp/app
/store/pnpm/bin/pnpm install --frozen-lockfile --store-dir /store/pnpm-store --cache-dir /store/pnpm-cache --ignore-scripts >/dev/null && echo pnpm-store-populated
