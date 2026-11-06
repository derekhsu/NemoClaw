#!/usr/bin/env python3
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Create Hermes atomic-write temp files beside the symlink target.

The OpenShell 0.1.x api profile (derekhsu/NemoClaw#52) keeps its HERMES_HOME
read-only under Landlock and points every top-level state file Hermes writes
(``channel_directory.json``, ``install_id``, ...) at ``state/`` through
admin-made symlinks. Hermes v0.21.3 ``utils._atomic_write`` already replaces
the symlink *target*, but creates its ``mkstemp`` temp file in the symlink's
own directory, which the confined api side cannot write. Create the temp file
in the target's directory instead, so the write and the rename stay inside the
writable state tree.

For a regular (non-symlink) path ``realpath(path).parent`` is the same
directory as before, so the default profile is unaffected. The exact
source-shape check fails closed when the pinned Hermes implementation changes.
Remove this patch when Hermes creates temp files beside the resolved target.
"""

from __future__ import annotations

import argparse
from pathlib import Path

OLD = '    fd, tmp_path = tempfile.mkstemp(dir=str(path.parent), prefix=prefix, suffix=".tmp")\n'
NEW = (
    "    tmp_dir = Path(os.path.realpath(str(path))).parent\n"
    '    fd, tmp_path = tempfile.mkstemp(dir=str(tmp_dir), prefix=prefix, suffix=".tmp")\n'
)


def patch_file(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    if source.count(OLD) == 0 and source.count(NEW) == 1:
        return
    if source.count(OLD) != 1 or source.count(NEW) != 0:
        raise SystemExit(
            "ERROR: Hermes utils._atomic_write source shape changed; expected one "
            f"unpatched mkstemp call, found {source.count(OLD)} "
            f"(already patched: {source.count(NEW)})"
        )
    path.write_text(source.replace(OLD, NEW), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", default="/opt/hermes/utils.py")
    args = parser.parse_args()
    patch_file(Path(args.path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
