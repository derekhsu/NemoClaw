#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Release rules for the Hermes tools image (derekhsu/NemoClaw#74), used by
# .github/workflows/hermes-01x-tools-image.yaml.
#
#   plan     Check the request and print base_image= and tag= lines to
#            $GITHUB_OUTPUT (stdout when unset).
#            Env: TOOLS_RELEASE (n), REPOSITORY, REF.
#   publish  Point <tag>, <tag>-amd64, and <tag>-arm64 at the tested
#            platform digests. Env: TAG, DIGEST_DIR (amd64.txt, arm64.txt).
#
# The base image comes from ARG BASE_IMAGE in agents/hermes-01x/Dockerfile.tools,
# written as <image>:<tag>@<index digest>. The release tag is
# <base tag>-tools.<n>. Release tags are never overwritten, and the base
# image's own tags are never written.

set -euo pipefail

IMAGE_NAME=docker.io/derekhsu/openshell-hermes
DOCKERFILE=${DOCKERFILE:-agents/hermes-01x/Dockerfile.tools}
ALLOWED_REPOSITORY=derekhsu/NemoClaw
ALLOWED_REF=refs/heads/feat/image-only-cli
BASE_TAG_PATTERN='openshell01x-hermes-[0-9]+\.[0-9]+\.[0-9]+-[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}(\.[0-9]{1,3})?'

fail() {
  echo "ERROR: $*" >&2
  exit 1
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
  for tag in "$1" "$1-amd64" "$1-arm64"; do
    if tag_exists "$tag"; then
      fail "$IMAGE_NAME:$tag already exists; release tags are never overwritten"
    fi
  done
}

plan() {
  [ "${REPOSITORY:-}" = "$ALLOWED_REPOSITORY" ] || fail "publishing runs only in $ALLOWED_REPOSITORY, not ${REPOSITORY:-unset}"
  [ "${REF:-}" = "$ALLOWED_REF" ] || fail "publishing runs only from $ALLOWED_REF, not ${REF:-unset}"
  [[ "${TOOLS_RELEASE:-}" =~ ^[1-9][0-9]{0,3}$ ]] || fail "tools release must be a positive number, not '${TOOLS_RELEASE:-}'"

  local base
  base=$(sed -n 's/^ARG BASE_IMAGE=//p' "$DOCKERFILE" | head -n 1)
  [[ "$base" =~ ^${IMAGE_NAME//./\\.}:($BASE_TAG_PATTERN)@sha256:[0-9a-f]{64}$ ]] \
    || fail "BASE_IMAGE in $DOCKERFILE must be $IMAGE_NAME:<openshell01x tag>@sha256:<digest>, not '$base'"
  local tag="${BASH_REMATCH[1]}-tools.$TOOLS_RELEASE"

  reject_existing_tags "$tag"
  printf 'base_image=%s\ntag=%s\n' "$base" "$tag" >>"${GITHUB_OUTPUT:-/dev/stdout}"
}

digest_ref() {
  local ref
  ref=$(cat "${DIGEST_DIR:?}/$1.txt")
  [[ "$ref" =~ ^${IMAGE_NAME//./\\.}@sha256:[0-9a-f]{64}$ ]] || fail "invalid $1 digest reference: '$ref'"
  printf '%s\n' "$ref"
}

publish() {
  [[ "${TAG:-}" =~ ^${BASE_TAG_PATTERN}-tools\.[1-9][0-9]{0,3}$ ]] || fail "not a tools release tag: '${TAG:-}'"
  local amd64 arm64
  amd64=$(digest_ref amd64)
  arm64=$(digest_ref arm64)

  # A tag created after the plan job ran is not overwritten either.
  reject_existing_tags "$TAG"
  docker buildx imagetools create -t "$IMAGE_NAME:$TAG" "$amd64" "$arm64"
  docker buildx imagetools create -t "$IMAGE_NAME:$TAG-amd64" "$amd64"
  docker buildx imagetools create -t "$IMAGE_NAME:$TAG-arm64" "$arm64"
  echo "published $IMAGE_NAME:$TAG"
  docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$IMAGE_NAME:$TAG"
}

case "${1:-}" in
  plan) plan ;;
  publish) publish ;;
  *)
    echo "usage: $0 plan|publish" >&2
    exit 2
    ;;
esac
