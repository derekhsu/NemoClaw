#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

# Regenerate requirements.lock for Python 3.13 on Linux amd64 and arm64.
set -euo pipefail
cd "$(dirname "$0")"
uv pip compile requirements.in \
  --universal \
  --python-version 3.13 \
  --only-binary :all: \
  --generate-hashes \
  --no-header \
  --output-file requirements.lock
