#!/usr/bin/env python3
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Patch pinned Hermes v0.20.6 session-list previews to show the latest user turn.

Source-of-truth note for this localized Hermes runtime patch:
  - Invalid state: Hermes v0.20.6 computes `sessions list` preview text from
    the first user message, but #5254's resumed/continued one-shot UX expects
    the original row to reflect the latest appended turn.
  - Value being patched: pinned/prebuilt `/opt/hermes/hermes_state.py` and
    `/opt/hermes/hermes_state_portability.py` occurrences of
    `ORDER BY m.timestamp, m.id LIMIT 1` inside the `_preview_raw` subqueries
    (`SessionDB.list_sessions_rich`, `list_unlinked_telegram_sessions_for_user`,
    `list_cron_job_runs`, `_get_session_rich_rows_batch`). The preview sites
    split across the facade and the portability sibling in the v0.20.x
    decomposition, so the Dockerfile invokes this patcher once per file with a
    per-file expected count.
  - Source-fix constraint: NemoClaw layers a sandbox image on top of the
    published Hermes runtime; the source fix belongs upstream in Hermes, not in
    NemoClaw's TypeScript or wrapper code.
  - Regression test: this script's exact occurrence count fails closed when the
    pinned source shape drifts, the Dockerfile greps for the patched query
    pattern after patching, and the Dockerfile smoke test creates a
    `SessionDB`, appends first/latest user turns, and asserts the list preview
    returns `NEMOCLAW_PREVIEW_LATEST`.
  - Removal condition: delete this patch when the pinned Hermes runtime
    natively uses the latest user turn for `sessions list` previews.
"""

from __future__ import annotations

import argparse
from pathlib import Path

OLD = "ORDER BY m.timestamp, m.id LIMIT 1"
NEW = "ORDER BY m.timestamp DESC, m.id DESC LIMIT 1"
# v0.20.6: hermes_state.py holds 5 _preview_raw sites (3 in list_sessions_rich,
# 2 in list_unlinked_telegram_sessions_for_user); hermes_state_portability.py
# holds 2 more (list_cron_job_runs, _get_session_rich_rows_batch).
DEFAULT_EXPECTED_OCCURRENCES = 5


def patch_file(path: Path, expected: int) -> None:
    source = path.read_text(encoding="utf-8")
    old_count = source.count(OLD)
    new_count = source.count(NEW)
    if old_count == 0 and new_count == expected:
        return
    if old_count != expected:
        raise SystemExit(
            "ERROR: Hermes session preview query shape changed; "
            f"expected {expected} unpatched occurrences, found {old_count} "
            f"(already patched occurrences: {new_count})"
        )
    path.write_text(source.replace(OLD, NEW), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "path",
        nargs="?",
        default="/opt/hermes/hermes_state.py",
        help="Hermes state module to patch",
    )
    parser.add_argument(
        "--expected",
        type=int,
        default=DEFAULT_EXPECTED_OCCURRENCES,
        help="Expected unpatched occurrences in the target file",
    )
    args = parser.parse_args()
    patch_file(Path(args.path), args.expected)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
