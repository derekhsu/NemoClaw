#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Compare a built tools image with its base image (issues #16, #74).
# Usage: check-image.sh BASE_REF TOOLS_REF OUT_DIR [openclaw|hermes]
# BASE_REF must be the digest-pinned base used by Dockerfile.tools or
# agents/hermes-01x/Dockerfile.tools.

set -euo pipefail

base=$1
tools=$2
out=$3
agent=${4:-openclaw}
case "$agent" in
  openclaw | hermes) ;;
  *)
    echo "unknown agent: $agent" >&2
    exit 2
    ;;
esac
here=$(cd "$(dirname "$0")" && pwd)
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

# The release version comes from the image, not from this checkout. Hermes
# prints its version on the first line.
agent_version() {
  docker run --rm --network none --entrypoint "$agent" "$1" --version | sed -n 1p
}
base_version=$(agent_version "$base")
tools_version=$(agent_version "$tools")
test -n "$tools_version" || fail "$agent printed no version"
test "$base_version" = "$tools_version" || fail "$agent version changed: $base_version -> $tools_version"
printf '%s\n' "$tools_version" >"$out/$agent-version.txt"

# Every setuid, setgid, or file-capability file the tools layer adds must be
# listed in privileged-files-added.txt. Paths under the multiarch library
# directory are written as <multiarch>.
privileged_files() {
  docker run --rm --network none --user root --entrypoint /usr/bin/python3 "$1" -c '
import os, re, stat
for root, dirs, files in os.walk("/"):
    if root == "/":
        dirs[:] = [d for d in dirs if d not in ("proc", "sys", "dev")]
    for name in files:
        path = os.path.join(root, name)
        try:
            mode = os.lstat(path).st_mode
        except OSError:
            continue
        if not stat.S_ISREG(mode):
            continue
        shown = re.sub(r"/(x86_64|aarch64)-linux-gnu/", "/<multiarch>/", path)
        if mode & stat.S_ISUID:
            print("setuid", shown)
        if mode & stat.S_ISGID:
            print("setgid", shown)
        try:
            os.getxattr(path, "security.capability", follow_symlinks=False)
            print("caps", shown)
        except OSError:
            pass
' | LC_ALL=C sort
}
privileged_files "$base" >"$out/base-privileged.txt"
privileged_files "$tools" >"$out/tools-privileged.txt"
LC_ALL=C comm -13 "$out/base-privileged.txt" "$out/tools-privileged.txt" >"$out/added-privileged.txt"
grep -Ev '^(#|$)' "$here/../privileged-files-added.txt" | LC_ALL=C sort >"$out/allowed-privileged.txt"
unexpected=$(LC_ALL=C comm -23 "$out/added-privileged.txt" "$out/allowed-privileged.txt")
test -z "$unexpected" || fail "tools layer adds privileged files not in privileged-files-added.txt:
$unexpected"

base_size=$(docker image inspect -f '{{.Size}}' "$base")
tools_size=$(docker image inspect -f '{{.Size}}' "$tools")
jq -n --argjson base "$base_size" --argjson tools "$tools_size" \
  '{base_bytes: $base, tools_bytes: $tools, added_bytes: ($tools - $base)}' >"$out/size.json"

docker run --rm --network none --entrypoint dpkg-query "$tools" \
  -W -f='${binary:Package}\t${Version}\n' >"$out/tools-packages.tsv"

echo "image checks passed"
cat "$out/size.json"
