# shellcheck shell=bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Shared setup and check runner for the tools image fixtures.
# Writes one log per check to $OUT/logs and appends to $OUT/summary.tsv.

OUT=${OUT:-/out}
# The agent of the base image: openclaw (Dockerfile.tools) or hermes
# (agents/hermes-01x/Dockerfile.tools). run-fixtures.sh sets it.
AGENT=${NEMOCLAW_TOOLS_AGENT:-openclaw}
# PY is used by the phase scripts that source this file.
# shellcheck disable=SC2034
case "$AGENT" in
  openclaw) PY=python3 ;;
  # PATH resolves python3 to the Hermes virtual environment; the tools'
  # Python packages are in the system interpreter.
  hermes) PY=/usr/bin/python3 ;;
  *)
    echo "unknown agent: $AGENT" >&2
    exit 2
    ;;
esac
WORK=$(mktemp -d /tmp/fixtures.XXXXXX)
export HOME=$WORK/home MPLCONFIGDIR=$WORK/mpl SAL_USE_VCLPLUGIN=svp
mkdir -p "$HOME" "$MPLCONFIGDIR" "$OUT/logs" "$OUT/files"
touch "$OUT/summary.tsv"
failures=0

check() {
  local name=$1
  shift
  local rc
  # A standalone subshell keeps errexit active inside the check.
  (
    set -euo pipefail
    cd "$WORK"
    "$@"
  ) >"$OUT/logs/$name.log" 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then
    printf 'PASS\t%s\n' "$name" | tee -a "$OUT/summary.tsv"
  else
    printf 'FAIL\t%s\n' "$name" | tee -a "$OUT/summary.tsv"
    failures=$((failures + 1))
  fi
}

# Record a check that does not apply to this agent's image.
skip() {
  printf 'SKIP\t%s\t%s\n' "$1" "$2" | tee -a "$OUT/summary.tsv"
}

finish() {
  printf '%s checks failed\n' "$failures"
  exit $((failures > 0))
}
