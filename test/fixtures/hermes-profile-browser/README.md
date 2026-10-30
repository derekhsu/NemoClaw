<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Hermes Browser Source Fixtures

These fixtures contain complete browser modules from the reviewed Hermes 0.21.3 source.
The regression test uses the original bytes to verify the browser-specific source identity gates.
It does not execute the browser modules.

| Fixture | Source | Uncompressed SHA-256 |
|---|---|---|
| `browser_tool.py.gz` | `tools/browser_tool.py` from the `v2026.9.14` tarball after `agents/hermes/security-dependencies.patch` | `29598fc950902eff9b503fa1fcfd02a8e4b15673acb6e8131fdc0bde65518f51` |
| `browser_tool_eval_policy.py.gz` | `tools/browser_tool_eval_policy.py` from the `v2026.9.14` tarball | `80d617bf062ff9e0e87fd592e8bbaadc3c6aaef7b96d2fe3ceb49fcfecaf368a` |

The uncompressed file sizes are 67,341 bytes for `browser_tool.py` and 8,639 bytes for `browser_tool_eval_policy.py`.
Each gzip header has `mtime=0`.
Compression preserves the full source bytes; do not replace these fixtures with abbreviated or synthetic modules.

Hermes 0.20.6 needed two reviewed `browser_tool.py` identities because the fork-built base kept the upstream `agent-browser@^0.26.0` NPX fallback while the official base pinned `agent-browser@0.26.0`.
The 0.21.3 security dependency patch applies the same exact pin as the official base, so a single reviewed identity remains for each browser source kind.
The patcher rejects unknown bytes, including an added trailing newline, and rejects a reviewed identity used for a different source kind.

## Original Source License

The SPDX header above applies to this provenance document.
It does not relicense the Hermes source fixtures.
Preserve the original Hermes source license and notices when redistributing these files.
The original MIT license is preserved in [LICENSE.hermes](LICENSE.hermes).
It is byte-identical to `LICENSE` in the `v2026.9.14` tarball.
The notice identifies `Copyright (c) 2025 Nous Research`.
