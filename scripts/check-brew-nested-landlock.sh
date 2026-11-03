#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Check that `brew install` works in an OpenClaw sandbox image when Homebrew runs
# inside an outer Landlock sandbox that, like the OpenShell filesystem policy,
# does not grant read on "/".
#
#   scripts/check-brew-nested-landlock.sh <image> [formula]
#
# The formula defaults to himalaya: its dependencies (ca-certificates, openssl@4)
# run post-install steps, which `hello` does not exercise. The check fails when:
#   - the image's Homebrew is too old for the current formula API, or
#   - Homebrew stops honouring HOMEBREW_NO_SANDBOX_LINUX (Homebrew/brew#24446).
# It needs network access to formulae.brew.sh and ghcr.io.
set -euo pipefail

image="${1:?usage: check-brew-nested-landlock.sh <image> [formula]}"
formula="${2:-himalaya}"
if [[ ! "$formula" =~ ^[a-z0-9][a-z0-9+._@-]*$ ]]; then
  echo "ERROR: invalid formula name: $formula" >&2
  exit 2
fi
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker run --rm \
  --user sandbox \
  --workdir /sandbox \
  --env HOME=/sandbox \
  --env FORMULA="$formula" \
  --volume "$here/lib/landlock-no-root-readdir.pl:/opt/check/landlock-no-root-readdir.pl:ro" \
  --entrypoint /bin/bash \
  "$image" -c '
    set -euo pipefail
    perl /opt/check/landlock-no-root-readdir.pl /bin/sh -c "! ls / >/dev/null 2>&1" \
      || { echo "ERROR: the outer Landlock sandbox did not deny listing /" >&2; exit 1; }
    echo "== $(/usr/local/bin/brew --version | head -1)"
    set +e
    perl /opt/check/landlock-no-root-readdir.pl /usr/local/bin/brew install "$FORMULA" > /tmp/brew-install.log 2>&1
    rc=$?
    set -e
    cat /tmp/brew-install.log
    if [ "$rc" -ne 0 ]; then
      echo "ERROR: brew install $FORMULA exited $rc under nested Landlock" >&2
      grep -n -E "dir_initialize|post_install|HOMEBREW_NO_SANDBOX_LINUX|^Error" /tmp/brew-install.log >&2 || true
      exit 1
    fi
    if grep -q "HOMEBREW_NO_SANDBOX_LINUX is disabled" /tmp/brew-install.log; then
      echo "ERROR: Homebrew no longer honours HOMEBREW_NO_SANDBOX_LINUX" >&2
      exit 1
    fi
    "/home/linuxbrew/.linuxbrew/bin/$FORMULA" --version
    echo "== brew install $FORMULA succeeded under nested Landlock"
  '
