#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Fail when a Trivy JSON report has a CRITICAL or HIGH finding with a fixed
# version that no reviewed exception covers.
#
#   scripts/security/reject-fixable-trivy-findings.sh <trivy.json> <exceptions.json> <out-dir> <label>
#
# An exception matches one finding exactly: vulnerability ID, package, installed
# version, severity, and package path. The script fails when an exception is
# malformed, expires within more than 30 days, has expired, or matches no
# finding. Set TRIVY_EXCEPTIONS_TODAY=YYYY-MM-DD to test date handling.
set -euo pipefail

report="${1:?usage: reject-fixable-trivy-findings.sh <trivy.json> <exceptions.json> <out-dir> <label>}"
exceptions="${2:?missing exceptions file}"
out="${3:?missing output directory}"
label="${4:?missing label}"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"

today="${TRIVY_EXCEPTIONS_TODAY:-$(date -u +%F)}"
if [[ ! "$today" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "ERROR: TRIVY_EXCEPTIONS_TODAY must use YYYY-MM-DD" >&2
  exit 2
fi
max_expiry="$(date -u -d "$today + 30 days" +%F 2>/dev/null || date -u -j -v+30d -f %F "$today" +%F)"
mkdir -p "$out"

# Validate the exception file.
jq -e --arg today "$today" --arg max "$max_expiry" '
  def nonempty: type == "string" and length > 0;
  .schemaVersion == 1
  and (.exceptions | type == "array")
  and all(.exceptions[];
    (.vulnerability | nonempty) and (.package | nonempty)
    and (.installedVersion | nonempty) and (.pkgPath | nonempty)
    and (.severity == "CRITICAL" or .severity == "HIGH")
    and (.decision == "not-affected" or .decision == "temporary-risk-acceptance")
    and (.owner | nonempty) and (.rationale | nonempty)
    and (.trackingIssue | type == "string" and test("^https://github\\.com/NVIDIA/NemoClaw/(issues|pull)/[0-9]+$"))
    and (.expires | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$"))
    and .expires >= $today and .expires <= $max
    and (.compensatingControls | type == "array" and length > 0 and all(.[]; nonempty)))
  and ([.exceptions[] | [.vulnerability, .package, .installedVersion, .pkgPath]] | length == (unique | length))
' "$exceptions" >/dev/null || {
  echo "ERROR: $exceptions is malformed, has a duplicate, has expired, or expires after $max_expiry" >&2
  exit 1
}

# Split fixable findings into excepted and rejected.
jq -r --slurpfile ex "$exceptions" '
  [.Results[]? | .Target as $target | .Vulnerabilities[]?
    | select(.FixedVersion != null and .FixedVersion != "")
    | . as $v
    | ([$ex[0].exceptions[] | select(.vulnerability == $v.VulnerabilityID and .package == $v.PkgName
        and .installedVersion == $v.InstalledVersion and .severity == $v.Severity
        and .pkgPath == ($v.PkgPath // ""))] | length > 0) as $excepted
    | "\(if $excepted then "EXCEPTED" else "REJECTED" end)\t\(.Severity) \(.VulnerabilityID) \(.PkgName) \(.InstalledVersion) -> \(.FixedVersion) (\($target))"]
  | .[]' "$report" | sort -u >"$out/fixable-classified.txt"
grep '^REJECTED' "$out/fixable-classified.txt" | cut -f2 >"$out/fixable.txt" || true
grep '^EXCEPTED' "$out/fixable-classified.txt" | cut -f2 >"$out/excepted.txt" || true

# Every exception must still match a finding.
jq -r --slurpfile report "$report" '
  .exceptions[] | . as $e
  | select([$report[0].Results[]?.Vulnerabilities[]?
      | select(.VulnerabilityID == $e.vulnerability and .PkgName == $e.package
          and .InstalledVersion == $e.installedVersion and .Severity == $e.severity
          and (.PkgPath // "") == $e.pkgPath)] | length == 0)
  | "\(.vulnerability) \(.package) \(.installedVersion) \(.pkgPath)"' "$exceptions" >"$out/unused-exceptions.txt"

jq -r '[.Results[]?.Vulnerabilities[]? | select(.FixedVersion == null or .FixedVersion == "")] | length' \
  "$report" >"$out/unfixed-count.txt"

{
  echo "### Trivy ($label)"
  echo
  echo "- fixable CRITICAL/HIGH: $(wc -l <"$out/fixable.txt" | tr -d ' ')"
  echo "- fixable CRITICAL/HIGH covered by a reviewed exception: $(wc -l <"$out/excepted.txt" | tr -d ' ')"
  echo "- CRITICAL/HIGH without a fix: $(cat "$out/unfixed-count.txt")"
  if [ -s "$out/fixable.txt" ]; then
    echo
    sed 's/^/- /' "$out/fixable.txt"
  fi
  if [ -s "$out/excepted.txt" ]; then
    echo
    echo "Excepted (${exceptions}):"
    sed 's/^/- /' "$out/excepted.txt"
  fi
} | tee -a "$summary"

status=0
if [ -s "$out/unused-exceptions.txt" ]; then
  echo "ERROR: exceptions in $exceptions match no finding; remove them:" >&2
  sed 's/^/  /' "$out/unused-exceptions.txt" >&2
  status=1
fi
if [ -s "$out/fixable.txt" ]; then
  echo "ERROR: the image has fixable CRITICAL or HIGH findings" >&2
  status=1
fi
exit "$status"
