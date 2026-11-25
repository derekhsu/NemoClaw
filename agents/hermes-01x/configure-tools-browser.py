# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Keep the Hermes tools image on Hermes' built-in browser tools (derekhsu/NemoClaw#74, #79, #83).

Usage: configure-tools-browser.py <config.yaml> <managed-policy.json> <hermes-source-dir>

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

A named profile created with `hermes profile create` has no config.yaml, and
Hermes reads browser.backend from the profile's own YAML without the defaults,
so the two edits above do not reach it (#83). The script therefore changes two
Hermes source files under <hermes-source-dir>: a missing browser.backend reads
as "off" in tools/browser_use_cli.py, and the browser.backend default in
hermes_cli/config_defaults.py becomes "off". A profile that sets
browser.backend itself keeps its value. Each edit replaces one exact line and
fails if the line is missing or already changed.
"""

import json
import os
import sys

BROWSER_BLOCK = "browser:"
BACKEND_LINE = '  backend: "off"'
BACKEND_PATH = "browser.backend"
# Keep the browser paths together in the policy's managed_paths list.
BACKEND_PATH_AFTER = "browser.restrict_evaluate"

# Hermes source edits for profiles without browser.backend (#83): path under
# the Hermes source directory, the exact upstream text, and its replacement.
SOURCE_EDITS = (
    (
        "tools/browser_use_cli.py",
        '    raw = _read_browser_cfg().get("backend")\n',
        "    # NemoClaw tools image: a missing browser.backend keeps the built-in browser tools.\n"
        '    raw = _read_browser_cfg().get("backend", BACKEND_DISABLED)\n',
    ),
    (
        "hermes_cli/config_defaults.py",
        '        "backend": "",\n        "inactivity_timeout": 120,\n',
        "        # NemoClaw tools image: the built-in browser tools, not the Browser Use CLI.\n"
        '        "backend": "off",\n        "inactivity_timeout": 120,\n',
    ),
)


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


def source_edit(old: str, new: str):
    """Return a change that replaces the one ``old`` text with ``new``."""

    def change(text: str) -> str:
        if text.count(new):
            raise ValueError("the browser.backend default is already changed")
        if text.count(old) != 1:
            raise ValueError(f"expected one {old.strip()!r}, found {text.count(old)}")
        return text.replace(old, new)

    return change


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    changes = [(sys.argv[1], configure), (sys.argv[2], configure_policy)]
    for relative, old, new in SOURCE_EDITS:
        changes.append((os.path.join(sys.argv[3], relative), source_edit(old, new)))
    updates = []
    for path, change in changes:
        with open(path, encoding="utf-8") as handle:
            text = handle.read()
        try:
            updates.append((path, change(text)))
        except ValueError as error:
            print(f"{path}: {error}", file=sys.stderr)
            return 1
    # Check every file before writing any. Write in place so the base image's
    # owner and mode stay unchanged.
    for path, updated in updates:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(updated)
    return 0


if __name__ == "__main__":
    sys.exit(main())
