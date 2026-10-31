#!/usr/bin/env python3
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Fail when the tools image adds a fixable CRITICAL or HIGH finding.

Usage: trivy-new-findings.py BASE_TRIVY_JSON TOOLS_TRIVY_JSON OUT_JSON

Findings already present in the base image are reported but do not fail;
they are fixed by rebuilding the standard image (issue #16 decision).
"""

import json
import sys


def fixable(path):
    findings = {}
    with open(path, encoding="utf-8") as handle:
        report = json.load(handle)
    for result in report.get("Results") or []:
        for vuln in result.get("Vulnerabilities") or []:
            if vuln.get("Severity") not in ("CRITICAL", "HIGH") or not vuln.get("FixedVersion"):
                continue
            key = (vuln["VulnerabilityID"], vuln["PkgName"], vuln.get("InstalledVersion", ""))
            findings[key] = {
                "id": vuln["VulnerabilityID"],
                "package": vuln["PkgName"],
                "installed": vuln.get("InstalledVersion", ""),
                "fixed": vuln["FixedVersion"],
                "severity": vuln["Severity"],
                "target": result.get("Target", ""),
            }
    return findings


def main():
    base_path, tools_path, out_path = sys.argv[1:4]
    base = fixable(base_path)
    tools = fixable(tools_path)
    added = [tools[key] for key in sorted(set(tools) - set(base))]
    inherited = [tools[key] for key in sorted(set(tools) & set(base))]
    summary = {"added": added, "inherited_from_base": inherited}
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)
    print(f"fixable CRITICAL/HIGH: {len(inherited)} inherited from base, {len(added)} added by tools")
    for item in added:
        print(f"ADDED {item['severity']} {item['id']} {item['package']} {item['installed']} -> {item['fixed']} ({item['target']})")
    return 1 if added else 0


if __name__ == "__main__":
    sys.exit(main())
