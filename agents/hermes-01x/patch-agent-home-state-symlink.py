#!/usr/bin/env python3
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Keep the api profile's own HERMES_HOME as the agent home.

The OpenShell 0.1.x api profile (derekhsu/NemoClaw#52) keeps its HERMES_HOME
read-only under Landlock, so ``state.db`` there is an admin-made symlink into
the writable ``state/`` tree. Hermes v0.21.3 ``agent.system_prompt._agent_home``
falls back to ``Path(session_db.db_path).parent`` when no profile home is bound,
and the session DB registry resolves symlinks first. The api agent's home
therefore became ``profiles/api/state``: SOUL.md, the skills index and the
other context files were read from the api-writable state tree instead of the
admin-edited profile root, so the reviewed SOUL.md never applied and an api
caller could plant one.

When ``HERMES_HOME`` is set and its ``state.db`` resolves to the session DB,
use ``HERMES_HOME`` itself. Profiles whose ``state.db`` is a regular file get
the same directory as before. The exact source-shape check fails closed when
the pinned Hermes implementation changes. Remove this patch when Hermes keeps
the unresolved home for a symlinked state.db.
"""

from __future__ import annotations

import argparse
from pathlib import Path

OLD = (
    '        db_path = getattr(getattr(agent, "_session_db", None), "db_path", None)\n'
    "        return Path(db_path).parent if db_path else None\n"
)
NEW = (
    '        db_path = getattr(getattr(agent, "_session_db", None), "db_path", None)\n'
    "        if not db_path:\n"
    "            return None\n"
    "        # NemoClaw #52: a state.db symlinked into state/ resolves there; keep the\n"
    "        # HERMES_HOME that owns it so SOUL.md and skills/ come from the profile root.\n"
    '        configured = os.environ.get("HERMES_HOME")\n'
    "        if configured and os.path.realpath(os.path.join(configured, \"state.db\")) == os.path.realpath(str(db_path)):\n"
    "            return Path(configured)\n"
    "        return Path(db_path).parent\n"
)


def patch_file(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    if source.count(OLD) == 0 and source.count(NEW) == 1:
        return
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
