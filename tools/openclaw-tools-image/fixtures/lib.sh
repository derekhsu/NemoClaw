# shellcheck shell=bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Shared setup and check runner for the tools image fixtures.
# Writes one log per check to $OUT/logs and appends to $OUT/summary.tsv.

OUT=${OUT:-/out}
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

finish() {
  printf '%s checks failed\n' "$failures"
  exit $((failures > 0))
}
