#!/usr/bin/env python3
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Pin the api profile's HERMES_HOME as the agent home.

The OpenShell 0.1.x api profile (derekhsu/NemoClaw#52) keeps its HERMES_HOME
read-only under Landlock, so ``state.db`` there is an admin-made symlink into
the api-writable ``state/`` tree. Hermes v0.21.3 ``agent.system_prompt._agent_home``
falls back to ``Path(session_db.db_path).parent`` when no profile home is bound,
and the session DB registry resolves symlinks first. The api agent's home
therefore became ``profiles/api/state``: SOUL.md, the skills index and the
other context files were read from the api-writable tree instead of the
admin-edited profile root, so the reviewed SOUL.md never applied and an api
caller could plant one.

Anything derived from the DB path can be steered by the api side, which can
replace ``state/state.db`` with symlinks of its own. The api launcher
(``api-landlock-exec.py``) therefore pins the home: it sets
``NEMOCLAW_HERMES_PIN_AGENT_HOME=1`` next to the ``HERMES_HOME`` it validated,
and with the pin the agent home is ``HERMES_HOME``, never the DB directory.
Processes without the pin (the default profile, the Dashboard) keep Hermes'
behaviour. The exact source-shape check fails closed when the pinned Hermes
implementation changes. Remove this patch when Hermes binds the profile home
for its api server.
"""

from __future__ import annotations

import argparse
from pathlib import Path

OLD = (
    '        db_path = getattr(getattr(agent, "_session_db", None), "db_path", None)\n'
    "        return Path(db_path).parent if db_path else None\n"
)
NEW = (
    "        # NemoClaw #52: the Landlock api launcher pins the profile root; never derive\n"
    "        # the home from the session DB path, which the api side can redirect.\n"
    '        if os.environ.get("NEMOCLAW_HERMES_PIN_AGENT_HOME") == "1" and os.environ.get("HERMES_HOME"):\n'
    '            return Path(os.environ["HERMES_HOME"])\n'
    + OLD
)


def patch_file(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    if source.count(NEW) == 1 and source.count(OLD) == 1:
        return  # already patched (NEW keeps the original fallback after the pin)
    if source.count(OLD) != 1 or source.count(NEW) != 0 or "import os" not in source.splitlines():
        raise SystemExit(
            "ERROR: Hermes agent.system_prompt._agent_home source shape changed; expected one "
            f"unpatched db_path fallback, found {source.count(OLD)} "
            f"(already patched: {source.count(NEW)})"
        )
    path.write_text(source.replace(OLD, NEW), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default="/opt/hermes/agent/system_prompt.py")
    args = parser.parse_args()
    patch_file(Path(args.path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
