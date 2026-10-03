<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Hermes Browser Source Fixtures

These fixtures contain complete `tools/browser_tool.py` files from two reviewed Hermes 0.20.6 base images.
The regression test uses the original bytes to verify the browser-specific source identity gate.
It does not execute the browser module.

| Fixture | Source | Uncompressed SHA-256 |
|---|---|---|
| `local.py.gz` | Local base `nemoclaw-hermes-sandbox-base:0.20.6`, Docker image ID `sha256:7142241115d2d0f051ee6f0e65fc1688ea4976fc0b55934a0021d9f0b36ae4eb` | `66008422f53a218dd7be5b1f5f3573a92254b75abba6f99f84e111e03a3e1b36` |
| `public.py.gz` | Official `v0.0.122` base, OCI index `sha256:348ad969b238576eae9b4dfb26585acd5c56cf80c084503998d9428998e1505f` | `b43608826bb10f9bf919ca97757bf36fc95247bd8b14fa8626a113c639cfd73e` |

The local image ID and public OCI index digest identify different artifact types.
The extraction path inside both images is `/opt/hermes/tools/browser_tool.py`.
The uncompressed file sizes are 267,923 bytes for the local fixture and 267,849 bytes for the public fixture.
Each gzip header has `mtime=0`.
Compression preserves the full source bytes; do not replace these fixtures with abbreviated or synthetic modules.

The complete source comparison found only these differences:

- The local source uses `agent-browser@^0.26.0`.
- The public source uses `agent-browser@0.26.0`.
- The adjacent comment explains the public base's exact NPX version pin.

All other browser program code is identical.
The patcher accepts both reviewed hashes only for the browser source kind.
It retains each source's NPX specification and rejects unknown bytes, including an added trailing newline.

## Original Source License

The SPDX header above applies to this provenance document.
It does not relicense the Hermes source fixtures.
Preserve the original Hermes source license and notices when redistributing these files.
The original MIT license is preserved in [LICENSE.hermes](LICENSE.hermes).
It was copied verbatim from `/opt/hermes/LICENSE` in the reviewed local 0.20.6 base.
The notice identifies `Copyright (c) 2025 Nous Research`.
