#!/usr/bin/env python3
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Keep explicitly disabled Hermes platforms inert under ambient credentials.

Hermes v0.21.3 moved environment overrides into ``gateway.config_env`` and
routes every built-in and plugin enablement path through the
``_enabled_explicit`` marker, so ambient credentials no longer flip
``enabled`` on an explicitly disabled platform. The table-driven credential
steps still copy those credentials into the disabled platform's ``extra``,
which leaves them in the adapter's runtime configuration. A neutral managed
image explicitly disables every packaged optional platform. Preserve those
complete platform objects across environment processing so credentials cannot
activate an adapter or become part of its runtime configuration before a
validated NemoClaw plan writes ``enabled: true``.

The Dockerfile binds this patch to the exact pinned ``gateway/config.py`` hash.
Remove it when the minimum supported Hermes release leaves explicitly disabled
platform objects untouched across every environment override path.
"""

from __future__ import annotations

import argparse
from pathlib import Path

FUNCTION_ANCHOR = '''def _apply_env_overrides(config: GatewayConfig) -> None:
    """Apply environment variable overrides to config (see ``gateway.config_env``)."""
    from gateway.config_env import _apply_env_overrides as _impl
    _impl(config)
'''
PATCHED_FUNCTION_ANCHOR = '''def _apply_env_overrides(config: GatewayConfig) -> None:
    """Apply environment variable overrides to config (see ``gateway.config_env``)."""
    from copy import deepcopy

    from gateway.config_env import _apply_env_overrides as _impl
    explicitly_disabled_platforms = {
        platform: deepcopy(platform_config)
        for platform, platform_config in config.platforms.items()
        if not platform_config.enabled
        and bool(platform_config.extra.get("_enabled_explicit", False))
    } if os.getenv("NEMOCLAW_MANAGED_IMAGE_CAPABILITY_UNION") == "1" else {}
    _impl(config)
    # Environment variables may populate credentials on explicitly disabled
    # adapters. Restore every explicit disable as a complete object; validated
    # configurations with enabled=True are deliberately not captured. The
    # delegate already scrubbed the marker, so drop it from the restored copy.
    for platform, platform_config in explicitly_disabled_platforms.items():
        platform_config.extra.pop("_enabled_explicit", None)
        config.platforms[platform] = platform_config
'''


def patch_file(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    if source.count(PATCHED_FUNCTION_ANCHOR) == 1:
        return
    old_count = source.count(FUNCTION_ANCHOR)
    new_count = source.count(PATCHED_FUNCTION_ANCHOR)
    if old_count != 1 or new_count != 0:
        raise SystemExit(
            "ERROR: Hermes neutral platform environment source shape changed; "
            f"expected one unpatched function anchor, found {old_count} "
            f"(already patched anchors: {new_count})"
        )
    path.write_text(source.replace(FUNCTION_ANCHOR, PATCHED_FUNCTION_ANCHOR), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "path",
        nargs="?",
        default="/opt/hermes/gateway/config.py",
        help="Hermes gateway configuration module to patch",
    )
    args = parser.parse_args()
    patch_file(Path(args.path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
