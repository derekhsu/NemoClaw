#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Start the Hermes base image and its tools image the same way and require the
# same startup (issue #74): container state, startup output, the
# /tmp/nemoclaw-start.log written by start.sh and runtime-config-guard.py, and
# the process list. Run-specific timestamps and process IDs are masked.
#
# Plain Docker runs only the image's own setup before the interactive shell;
# the gateway and API runtime start under OpenShell, so this check does not
# cover them.
#
# Usage: check-tools-start.sh BASE_REF TOOLS_REF OUT_DIR

set -euo pipefail

base=$1
tools=$2
out=$3
mkdir -p "$out"

names=(nemoclaw-start-base-$$ nemoclaw-start-tools-$$)
# shellcheck disable=SC2329 # called by the EXIT trap
cleanup() { docker rm -f "${names[@]}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

mask_time='s/[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9:.,]+Z?/<time>/g'

start() {
  docker run -dit --name "$1" --network none --cap-drop ALL \
    --security-opt no-new-privileges "$2" >/dev/null
}

start "${names[0]}" "$base"
start "${names[1]}" "$tools"

# Wait until the start log of both containers stops growing for 15 s, or 300 s.
log_size() {
  docker exec "$1" sh -c 'wc -c </tmp/nemoclaw-start.log' 2>/dev/null | tr -d ' ' || true
}
previous=(none none)
for _ in $(seq 1 20); do
  sleep 15
  stable=0
  for i in 0 1; do
    size=$(log_size "${names[$i]}")
    [ -n "$size" ] && [ "$size" != 0 ] && [ "$size" = "${previous[$i]}" ] && stable=$((stable + 1))
    previous[i]=${size:-none}
  done
  [ "$stable" -eq 2 ] && break
done

for i in 0 1; do
  kind=base
  [ "$i" -eq 1 ] && kind=tools
  name=${names[$i]}
  docker inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' "$name" >"$out/$kind-state.txt"
  docker logs "$name" 2>&1 | sed -E "$mask_time; s/pid[= ][0-9]+/pid=<n>/g" >"$out/$kind-output.log"
  docker exec "$name" sh -c 'cat /tmp/nemoclaw-start.log 2>/dev/null' \
    | sed -E "$mask_time" >"$out/$kind-nemoclaw-start.log" || true
  docker exec "$name" ps -eo user,args 2>/dev/null \
    | sed -E 's/[0-9]{4,}/<n>/g' | LC_ALL=C sort >"$out/$kind-ps.txt" || true
done

grep -q '^running ' "$out/base-state.txt" || {
  echo "FAIL: the base image did not keep running: $(cat "$out/base-state.txt")" >&2
  exit 1
}
rc=0
for part in state.txt output.log nemoclaw-start.log ps.txt; do
  if ! diff -u "$out/base-$part" "$out/tools-$part"; then
    echo "FAIL: $part differs from the base image" >&2
    rc=1
  fi
done
[ "$rc" -eq 0 ] && echo "startup matches the base image"
exit "$rc"
