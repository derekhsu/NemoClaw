#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Release rules for the fork's OpenClaw images on Docker Hub (issue #16).
# Used by .github/workflows/openclaw-sandbox-image.yaml.
#
#   plan                 Validate the request and reject existing release tags.
#   check-tools-version  Compare a tools tag with the image's `openclaw --version`.
#   publish              Create the manifest tags from per-architecture digests.
#
# Inputs come from the environment so that workflow inputs never reach shell
# source text: VARIANT, TAG, REPOSITORY, REF, IMAGE_NAME, and for publish,
# DIGEST_DIR. Results go to $GITHUB_OUTPUT and $GITHUB_STEP_SUMMARY when set.
#
# Tag grammars, with <version> the OpenClaw version (YYYY.M.D):
#   standard  <version> or <version>-r<n>; also writes <tag>-amd64,
#             <tag>-arm64, latest, and openclaw-<version>.
#   tools     <version>-tools.<n>; writes only that tag. <version> must equal
#             the version that the built image reports with openclaw --version.
# Release tags are never overwritten. latest and openclaw-<version> are the
# only tags that move, and only standard releases move them.

set -euo pipefail

ALLOWED_REPOSITORY=derekhsu/NemoClaw
ALLOWED_REF=refs/heads/feat/image-only-cli
ALLOWED_IMAGE=docker.io/derekhsu/openshell-openclaw
ROOT=${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
VERSION_RE='[0-9]{4}\.[1-9][0-9]?\.[1-9][0-9]?'

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

output() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$1" "$2" >>"$GITHUB_OUTPUT"
  fi
  printf '%s=%s\n' "$1" "$2"
}

summary() {
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    printf '%s\n' "$@" >>"$GITHUB_STEP_SUMMARY"
  fi
  printf '%s\n' "$@"
}

# Print the release tags. These tags are never overwritten.
release_tags() {
  case "$VARIANT" in
    standard) printf '%s\n' "$TAG" "$TAG-amd64" "$TAG-arm64" ;;
    tools) printf '%s\n' "$TAG" ;;
  esac
}

alias_tags() {
  if [ "$VARIANT" = standard ]; then
    printf '%s\n' latest "openclaw-$1"
  fi
}

# Succeed when the tag exists, fail when the registry reports it missing,
# and stop on any other registry error rather than guess.
tag_exists() {
  local err
  if err=$(docker buildx imagetools inspect "$IMAGE_NAME:$1" 2>&1 >/dev/null); then
    return 0
  fi
  case "$err" in
    *"not found"* | *"manifest unknown"*) return 1 ;;
    *) fail "cannot check $IMAGE_NAME:$1: $err" ;;
  esac
}

reject_existing_tags() {
  local tag
  while read -r tag; do
    if tag_exists "$tag"; then
      fail "$IMAGE_NAME:$tag already exists; release tags are never overwritten"
    fi
  done < <(release_tags)
}

validate_request() {
  [ "${REPOSITORY:-}" = "$ALLOWED_REPOSITORY" ] || fail "publication runs only in $ALLOWED_REPOSITORY, not '${REPOSITORY:-}'"
  [ "${REF:-}" = "$ALLOWED_REF" ] || fail "publication runs only from $ALLOWED_REF, not '${REF:-}'"
  [ "${IMAGE_NAME:-}" = "$ALLOWED_IMAGE" ] || fail "publication targets only $ALLOWED_IMAGE, not '${IMAGE_NAME:-}'"
  case "${VARIANT:-}" in
    standard)
      [[ "${TAG:-}" =~ ^($VERSION_RE)(-r[1-9][0-9]*)?$ ]] \
        || fail "standard tag must be <version> or <version>-r<n>, not '${TAG:-}'"
      ;;
    tools)
      [[ "${TAG:-}" =~ ^($VERSION_RE)-tools\.[1-9][0-9]*$ ]] \
        || fail "tools tag must be <version>-tools.<n>, not '${TAG:-}'"
      ;;
    *) fail "variant must be standard or tools, not '${VARIANT:-}'" ;;
  esac
  printf '%s\n' "${BASH_REMATCH[1]}"
}

cmd_plan() {
  local version pinned base=""
  version=$(validate_request)
  if [ "$VARIANT" = standard ]; then
    pinned=$(sed -n 's/^ARG OPENCLAW_VERSION=//p' "$ROOT/Dockerfile" | head -n1)
    [ "$version" = "$pinned" ] || fail "tag version $version does not match Dockerfile OPENCLAW_VERSION $pinned"
  else
    base=$(sed -n 's/^ARG BASE_IMAGE=//p' "$ROOT/Dockerfile.tools" | head -n1)
    [[ "$base" =~ ^$ALLOWED_IMAGE@sha256:[0-9a-f]{64}$ ]] \
      || fail "Dockerfile.tools BASE_IMAGE must be $ALLOWED_IMAGE pinned by digest, not '$base'"
  fi
  reject_existing_tags
  output version "$version"
  output base_image "$base"
  summary "### Release plan" "" "- Variant: \`$VARIANT\`" "- Version: \`$version\`"
  [ -z "$base" ] || summary "- Base: \`$base\`"
  local tag
  while read -r tag; do summary "- Release tag: \`$IMAGE_NAME:$tag\`"; done < <(release_tags)
  while read -r tag; do summary "- Moving alias: \`$IMAGE_NAME:$tag\`"; done < <(alias_tags "$version")
}

# Usage: check-tools-version TAG "OpenClaw <version>"
cmd_check_tools_version() {
  local tag=$1 reported=$2 version
  [[ "$tag" =~ ^($VERSION_RE)-tools\.[1-9][0-9]*$ ]] || fail "tools tag must be <version>-tools.<n>, not '$tag'"
  version=${BASH_REMATCH[1]}
  [[ "$reported" =~ ^OpenClaw\ ($VERSION_RE)([[:space:]]|$) ]] || fail "cannot read an OpenClaw version from '$reported'"
  [ "${BASH_REMATCH[1]}" = "$version" ] \
    || fail "tag version $version does not match the image's OpenClaw ${BASH_REMATCH[1]}"
  echo "tools tag $tag matches OpenClaw $version"
}

read_digest() {
  local file=$DIGEST_DIR/$1.txt ref
  [ -f "$file" ] || fail "missing $1 digest; both architectures must build before publication"
  ref=$(cat "$file")
  [[ "$ref" =~ ^$IMAGE_NAME@sha256:[0-9a-f]{64}$ ]] || fail "invalid $1 digest reference: '$ref'"
  printf '%s\n' "$ref"
}

cmd_publish() {
  local version amd64 arm64 written=()
  version=$(validate_request)
  amd64=$(read_digest amd64)
  arm64=$(read_digest arm64)
  # Check again just before writing: another run may have published the tag.
  reject_existing_tags

  # Write one manifest tag. On failure, report what is already written.
  create() {
    if docker buildx imagetools create "$@"; then
      return 0
    fi
    summary "### Publication incomplete" "" \
      "Docker Hub has no atomic multi-tag write. Written before the failure:" "" \
      "- amd64 digest: \`$amd64\`" "- arm64 digest: \`$arm64\`"
    local t
    for t in ${written[@]+"${written[@]}"}; do summary "- Tag: \`$IMAGE_NAME:$t\`"; done
    summary "" "Nothing was deleted. Retry with a new tag, or remove these tags by hand."
    exit 1
  }

  create -t "$IMAGE_NAME:$TAG" "$amd64" "$arm64"
  written+=("$TAG")
  if [ "$VARIANT" = standard ]; then
    create -t "$IMAGE_NAME:$TAG-amd64" "$amd64"
    written+=("$TAG-amd64")
    create -t "$IMAGE_NAME:$TAG-arm64" "$arm64"
    written+=("$TAG-arm64")
    create -t "$IMAGE_NAME:latest" -t "$IMAGE_NAME:openclaw-$version" "$amd64" "$arm64"
    written+=(latest "openclaw-$version")
  fi

  summary "### Published" "" "- amd64 digest: \`$amd64\`" "- arm64 digest: \`$arm64\`"
  local t
  for t in ${written[@]+"${written[@]}"}; do summary "- Tag: \`$IMAGE_NAME:$t\`"; done
  summary "- Index digest: \`$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$IMAGE_NAME:$TAG")\`"
}

case "${1:-}" in
  plan) cmd_plan ;;
  check-tools-version)
    [ $# -eq 3 ] || fail "usage: $0 check-tools-version TAG VERSION_TEXT"
    cmd_check_tools_version "$2" "$3"
    ;;
  publish) cmd_publish ;;
  *) fail "usage: $0 plan|check-tools-version|publish" ;;
esac
