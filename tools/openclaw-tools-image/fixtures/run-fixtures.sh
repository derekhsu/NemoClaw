#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Run every tools image fixture offline as the sandbox user (issues #16, #74), with
# the same restrictions as the sandbox: read-only root, writable /tmp and /out only,
# no capabilities, and no network.
# Usage: run-fixtures.sh IMAGE OUT_DIR [openclaw|hermes]

set -euo pipefail

image=$1
out=$2
agent=${3:-openclaw}
fixtures=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$out"
chmod 0777 "$out"

rc=0
for phase in run-phase2.sh run-phase3.sh; do
  docker run --rm --user sandbox --network none --read-only \
    --tmpfs /tmp:rw,exec,size=2g --cap-drop ALL --security-opt no-new-privileges \
    --entrypoint /bin/bash \
    -e NEMOCLAW_TOOLS_AGENT="$agent" \
    -v "$fixtures:/fixtures:ro" \
    -v "$out:/out" \
    "$image" "/fixtures/$phase" || rc=1
done
exit "$rc"
