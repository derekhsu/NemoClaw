# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Keep the Hermes tools image on Hermes' built-in browser tools (derekhsu/NemoClaw#74, #79).

Usage: configure-tools-browser.py <config.yaml> <managed-policy.json>

With browser.backend unset, Hermes replaces its browser tools with the Browser
Use CLI whenever uvx is on PATH, and that CLI is fetched from PyPI with
`uvx browser-use` when it is first used. The tools image instead runs the
built-in browser tools on the pinned agent-browser and the image's Chromium,
so this script sets browser.backend to "off".

The base image writes the managed `browser:` block. The script inserts one
line after it and changes nothing else, so comments and key order stay as the
base image wrote them. Quoting "off" keeps it a string; YAML 1.1 reads a bare
off as false, which Hermes also accepts.

The same value goes into the managed policy, and browser.backend becomes a
managed path. The dashboard config seeder copies the gateway config only when
each managed section equals the policy, and it copies the managed paths into
the dashboard profile, so the dashboard also gets browser.backend "off" (#79).
"""

import json
import sys

BROWSER_BLOCK = "browser:"
BACKEND_LINE = '  backend: "off"'
BACKEND_PATH = "browser.backend"
# Keep the browser paths together in the policy's managed_paths list.
BACKEND_PATH_AFTER = "browser.restrict_evaluate"


def configure(text: str) -> str:
    """Return ``text`` with browser.backend set to "off"; raise ValueError otherwise."""
    lines = text.split("\n")
    starts = [i for i, line in enumerate(lines) if line == BROWSER_BLOCK]
    if len(starts) != 1:
        raise ValueError(f"expected one top-level {BROWSER_BLOCK!r} line, found {len(starts)}")
    start = starts[0]
    end = start + 1
    while end < len(lines) and (lines[end].startswith(" ") or lines[end] == ""):
        if lines[end].lstrip().startswith("backend:") and lines[end].startswith("  ") and not lines[end].startswith("   "):
            raise ValueError("browser.backend is already set")
        end += 1
    if end == start + 1:
        raise ValueError("the browser block is empty")
    lines.insert(start + 1, BACKEND_LINE)
    return "\n".join(lines)


def configure_policy(text: str) -> str:
    """Return the policy ``text`` with browser.backend "off" managed; raise ValueError otherwise."""
    policy = json.loads(text)
    browser = policy.get("config", {}).get("browser")
    paths = policy.get("managed_paths")
    if not isinstance(browser, dict) or not isinstance(paths, list):
        raise ValueError("the policy has no config.browser mapping or managed_paths list")
    if "backend" in browser or BACKEND_PATH in paths:
        raise ValueError("the policy already sets browser.backend")
    if BACKEND_PATH_AFTER not in paths:
        raise ValueError(f"the policy does not manage {BACKEND_PATH_AFTER}")
    browser["backend"] = "off"
    paths.insert(paths.index(BACKEND_PATH_AFTER) + 1, BACKEND_PATH)
    # Same layout as the generator: JSON.stringify(policy, null, 2) plus a newline.
    return json.dumps(policy, indent=2, ensure_ascii=False) + "\n"


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    updates = []
    for path, change in ((sys.argv[1], configure), (sys.argv[2], configure_policy)):
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
        try:
            updates.append((path, change(text)))
        except ValueError as error:
            print(f"{path}: {error}", file=sys.stderr)
            return 1
    # Check both files before writing either. Write in place so the base
    # image's owner and mode stay unchanged.
    for path, updated in updates:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(updated)
    return 0


if __name__ == "__main__":
    sys.exit(main())
