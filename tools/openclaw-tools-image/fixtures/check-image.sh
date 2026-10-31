#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Compare a built tools image with its base image (issue #16).
# Usage: check-image.sh BASE_REF TOOLS_REF OUT_DIR
# BASE_REF must be the digest-pinned base used by Dockerfile.tools.

set -euo pipefail

base=$1
tools=$2
out=$3
mkdir -p "$out"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

case "$base" in
  *@sha256:*) ;;
  *) fail "base reference is not digest-pinned: $base" ;;
esac

# The base index must publish both architectures.
docker buildx imagetools inspect --raw "$base" >"$out/base-index.json"
for arch in amd64 arm64; do
  jq -e --arg arch "$arch" \
    '.manifests[] | select(.platform.os == "linux" and .platform.architecture == $arch)' \
    "$out/base-index.json" >/dev/null || fail "base index lacks linux/$arch"
done

docker pull -q "$base" >/dev/null
fields='{User, Entrypoint, Cmd, WorkingDir, Env, Healthcheck}'
docker image inspect "$base" | jq ".[0].Config | $fields" >"$out/base-config.json"
docker image inspect "$tools" | jq ".[0].Config | $fields" >"$out/tools-config.json"
test "$(jq -r .User "$out/base-config.json")" = sandbox || fail "base user is not sandbox"
diff -u "$out/base-config.json" "$out/tools-config.json" || fail "image configuration differs from base"

# The release version comes from the image, not from this checkout.
base_version=$(docker run --rm --network none --entrypoint openclaw "$base" --version)
tools_version=$(docker run --rm --network none --entrypoint openclaw "$tools" --version)
test "$base_version" = "$tools_version" || fail "OpenClaw version changed: $base_version -> $tools_version"
printf '%s\n' "$tools_version" >"$out/openclaw-version.txt"

base_size=$(docker image inspect -f '{{.Size}}' "$base")
tools_size=$(docker image inspect -f '{{.Size}}' "$tools")
jq -n --argjson base "$base_size" --argjson tools "$tools_size" \
  '{base_bytes: $base, tools_bytes: $tools, added_bytes: ($tools - $base)}' >"$out/size.json"

docker run --rm --network none --entrypoint dpkg-query "$tools" \
  -W -f='${binary:Package}\t${Version}\n' >"$out/tools-packages.tsv"

echo "image checks passed"
cat "$out/size.json"
