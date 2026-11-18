# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Keep the Hermes tools image on Hermes' built-in browser tools (derekhsu/NemoClaw#74).

Usage: configure-tools-browser.py <config.yaml>

With browser.backend unset, Hermes replaces its browser tools with the Browser
Use CLI whenever uvx is on PATH, and that CLI is fetched from PyPI with
`uvx browser-use` when it is first used. The tools image instead runs the
built-in browser tools on the pinned agent-browser and the image's Chromium,
so this script sets browser.backend to "off".

The base image writes the managed `browser:` block. The script inserts one
line after it and changes nothing else, so comments and key order stay as the
base image wrote them. Quoting "off" keeps it a string; YAML 1.1 reads a bare
off as false, which Hermes also accepts.
"""

import sys

BROWSER_BLOCK = "browser:"
BACKEND_LINE = '  backend: "off"'


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


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[2], file=sys.stderr)
        return 2
    path = sys.argv[1]
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    try:
        updated = configure(text)
    except ValueError as error:
        print(f"{path}: {error}", file=sys.stderr)
        return 1
    # Write in place so the base image's owner and mode stay unchanged.
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(updated)
    return 0


if __name__ == "__main__":
    sys.exit(main())
