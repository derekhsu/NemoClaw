#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

layout="${1:?OCI layout directory is required}"
exported_digest="${2:?BuildKit export digest is required}"
platform="${3:-linux/amd64}"
case "$platform" in
  linux/amd64 | linux/arm64) architecture="${platform#linux/}" ;;
  *) fail "unsupported source base platform" ;;
esac
[[ "$layout" == /* && "$layout" != *$'\n'* && "$layout" != *$'\r'* && "$layout" != *@* ]] \
  || fail "invalid source base layout path"
[[ "$exported_digest" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail "invalid source base export digest"
test -f "$layout/index.json" && test ! -L "$layout/index.json" \
  || fail "missing regular source base index"

digest="$(jq -er '
  .manifests | if length == 1 and .[0].mediaType == "application/vnd.oci.image.manifest.v1+json"
  then .[0].digest else error("not one OCI image manifest") end
' "$layout/index.json")" || fail "source base index must contain one image manifest"
[[ "$digest" == "$exported_digest" ]] \
  || fail "source base descriptor differs from the BuildKit export digest"

manifest="$layout/blobs/sha256/${digest#sha256:}"
test -f "$manifest" && test ! -L "$manifest" \
  || fail "missing regular source base manifest"
actual="sha256:$(sha256sum "$manifest" | awk '{print $1}')"
[[ "$actual" == "$digest" ]] || fail "source base manifest bytes differ from its digest"
config_digest="$(jq -er '.config.digest' "$manifest")" || fail "source base config digest is missing"
[[ "$config_digest" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail "invalid source base config digest"
config="$layout/blobs/sha256/${config_digest#sha256:}"
test -f "$config" && test ! -L "$config" || fail "missing regular source base config"
actual="sha256:$(sha256sum "$config" | awk '{print $1}')"
[[ "$actual" == "$config_digest" ]] || fail "source base config bytes differ from its digest"
jq -e --arg architecture "$architecture" '.os == "linux" and .architecture == $architecture' "$config" >/dev/null \
  || fail "source base must be $platform"

printf 'ref=nemoclaw-hermes-pr-base\ncontext=nemoclaw-hermes-pr-base=oci-layout://%s@%s\n' \
  "$layout" "$digest" >>"${GITHUB_OUTPUT:?GitHub output path is required}"
