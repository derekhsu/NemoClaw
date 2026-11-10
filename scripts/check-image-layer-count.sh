#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Fail when a pushed image has more layers than Docker can pull.
#
# Docker's overlay2 storage driver refuses an image with more than 125 layers
# ("failed to register layer: max depth exceeded"). Podman has no such limit,
# so a Podman-only check does not catch it (derekhsu/NemoClaw#70).
# MAX_LAYERS=115 leaves 10 layers for later Dockerfile changes.
#
# Usage: check-image-layer-count.sh IMAGE@sha256:DIGEST...
# Each reference is an image manifest or an index. For an index, every
# platform image is checked; attestation manifests (platform unknown/unknown)
# are skipped.

set -euo pipefail

MAX_LAYERS=115

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 IMAGE@sha256:DIGEST..." >&2
  exit 2
fi

failed=0

check_manifest() {
  local ref=$1 label=$2 raw count
  raw=$(docker buildx imagetools inspect --raw "$ref")
  count=$(jq -er '.layers | length' <<<"$raw") || {
    echo "ERROR: $label has no layer list" >&2
    failed=1
    return
  }
  if [ "$count" -gt "$MAX_LAYERS" ]; then
    echo "ERROR: $label has $count layers; the limit is $MAX_LAYERS (Docker refuses more than 125)" >&2
    failed=1
  else
    echo "$label: $count layers (limit $MAX_LAYERS)"
  fi
}

for ref in "$@"; do
  if [[ ! "$ref" =~ ^[^@[:space:]]+@sha256:[0-9a-f]{64}$ ]]; then
    echo "ERROR: expected IMAGE@sha256:DIGEST, got: $ref" >&2
    exit 2
  fi
  repo=${ref%@*}
  raw=$(docker buildx imagetools inspect --raw "$ref")
  if jq -e 'has("manifests")' <<<"$raw" >/dev/null; then
    platforms=$(jq -r '.manifests[]
      | select((.platform.os // "unknown") != "unknown")
      | "\(.digest) \(.platform.os)/\(.platform.architecture)\(if .platform.variant then "/" + .platform.variant else "" end)"' <<<"$raw")
    if [ -z "$platforms" ]; then
      echo "ERROR: $ref is an index with no platform images" >&2
      failed=1
      continue
    fi
    while read -r digest platform; do
      check_manifest "$repo@$digest" "$ref ($platform)"
    done <<<"$platforms"
  else
    check_manifest "$ref" "$ref"
  fi
done

exit "$failed"
