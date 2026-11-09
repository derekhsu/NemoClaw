# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Turn on the OpenClaw browser tool in the tools image (derekhsu/NemoClaw#27).

Usage: configure-browser.py <openshell-line> <openclaw.json>

On OpenShell 0.0.x the sandbox has no DNS, so the browser tool cannot
navigate and the config is left unchanged. On 0.1.x the script adds:

- browser.executablePath: the Chromium binary that network policy sees
  (/usr/bin/chromium is a shell wrapper).
- browser.noSandbox and --no-zygote: OpenShell's seccomp refuses the user
  namespaces that Chromium's sandbox and zygote create. The OpenShell sandbox
  (seccomp, Landlock, network policy) still isolates the browser.
- browser.ssrfPolicy.allowRfc2544BenchmarkRange: policy DNS answers with
  198.18.0.0/15 addresses, which the SSRF check otherwise rejects.
- tools.alsoAllow "browser": adds the tool to whatever tool profile OpenClaw
  selects.
"""

import json
import sys

CHROMIUM = "/usr/lib/chromium/chromium"
BROWSER = {
    "enabled": True,
    "executablePath": CHROMIUM,
    "headless": True,
    "noSandbox": True,
    "extraArgs": ["--no-zygote", "--disable-gpu"],
    "ssrfPolicy": {"allowRfc2544BenchmarkRange": True},
}


def configure(line: str, config: dict) -> bool:
    """Add the browser settings for ``line``; return whether ``config`` changed."""
    if line == "0.0":
        return False
    if line != "0.1":
        raise ValueError(f"unknown OpenShell line {line!r}")
    if "browser" in config:
        raise ValueError("the base config already sets browser")
    config["browser"] = json.loads(json.dumps(BROWSER))
    allow = config.setdefault("tools", {}).setdefault("alsoAllow", [])
    if "browser" not in allow:
        allow.append("browser")
    return True


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.splitlines()[2], file=sys.stderr)
        return 64
    line, path = argv[1], argv[2]
    with open(path, encoding="utf-8") as handle:
        config = json.load(handle)
    if not configure(line, config):
        print(f"OpenShell {line}: browser tool left off")
        return 0
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)
        handle.write("\n")
    print(f"OpenShell {line}: browser tool on ({CHROMIUM})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
