<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# OpenClaw 2026.9.2 dependency review

Review date: 2026-12-26

## Decision

Pin the production OpenClaw runtime and matching official plugins to the
non-prerelease `v2026.9.2` release. This replaces `2026.7.1`. OpenShell remains
pinned at `0.0.101`; this migration does not change any OpenShell pin, the
child-visible credential manifest, or the exact-version supervisor gate.

The production OpenClaw install uses the authoritative committed lock at
`agents/openclaw/openclaw-runtime/package-lock.json`, with SHA-256
`31734b077d02076ab3b38fd43ba5d686543d3dccb8f0c4c8f741d905c19ce826`.
NemoClaw regenerates that lock from the SRI-verified `openclaw@2026.9.2`
archive. The published `openclaw@2026.9.2` archive now carries the corrected
dependency identities that the `2026.7.1` remediation rewrote, so the install
requires no core remediation entry. The OpenClaw runtime manifest instead pins
reviewed overrides for `@modelcontextprotocol/sdk@1.31.0`, `hono@4.12.34`,
`tar@7.5.21`, `fast-uri@3.1.7`, and `undici@8.10.2`.

The managed messaging runtime manifest selects the `2026.9.2` channel plugin
graph, `@tencent-weixin/openclaw-weixin@2.4.9`, `@emnapi/core@1.11.1`,
`@emnapi/runtime@1.11.3`, `axios@1.19.0`, `undici@8.10.2`, and the reviewed npm
alias overrides `fast-uri@4.1.4`, `ip-address@10.5.0`, `protobufjs@8.7.2`,
`qs@6.15.3`, `uuid@14.0.2`, and `proxy-addr@2.0.8`. The committed WeChat
runtime lock is `agents/openclaw/wechat-runtime/package-lock.json` with
SHA-256 `84f2b731e9ffe731d29c28ebbe795116217771971c729b577df1a8816296f9b8`.

OpenClaw `2026.9.2` requires Node
`>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0`. The reviewed managed base image
already reports Node `22.23.1`, which stays inside that contract, so the base
image pin does not move.

The long-term source of truth for these behaviors remains upstream OpenClaw,
and this upgrade does not turn NemoClaw's compiled-dist shims into supported
upstream APIs.

## Reviewed identities

- `openclaw@2026.9.2`
  - `sha512-M6C7UsnX815nv26qBJFYGe6aGzv+ftZLRzV6S9oRXUtXg2Yn67eVntpssT94kgkquKVSeUxerUg0j1ONp4WYQg==`
  - `https://registry.npmjs.org/openclaw/-/openclaw-2026.9.2.tgz`
- `@openclaw/diagnostics-otel@2026.9.2`
  - `sha512-yilG4G1Fd1yvW65Qy+qNPR+x6tBjwVmTWv+7BULoN70HY3BJqt9YVOL42PvWXHYpaTs/LwUlisqxjbJRfYyi9A==`
- `@openclaw/brave-plugin@2026.9.2`
  - `sha512-6416aPlfnAKlu8IBrrjgfoiss/10xB32ywFwnIf/fkVMQE61qsmzA/qxUniQuDwOB6EBFNEkNs54DhIT7g3UVg==`
- `@openclaw/tavily-plugin@2026.9.2`
  - `sha512-FYK2e7aXagwcGiTRQfidS3PThIfJkAQoqYEtlkadiGxmgeChYY71YLeD6nQAHZKHmTAOw9U7njDxMBvYyXPf5w==`
- `@openclaw/discord@2026.9.2`
  - `sha512-j+fSHxbXA+DSxwbL8SvtsDNL6tvBX4+RmH+EerVW6dCbeIwSconXj6J/+AaN/mhzZI4g0jPPj30TUhdCRRbc2w==`
- `@openclaw/googlechat@2026.9.2`
  - `sha512-LUO8Lg07IhzJfEzxn+GSij8WMS/uX3hTmv0SydTy/0fKSN7iZksf74TaZg50kOoBi8FzeqeXo/zoGVuk0Mj1Ig==`
- `@openclaw/slack@2026.9.2`
  - `sha512-6M1M6gL3iXahpalNsYAUuA+wvnV8lbMlNNH2ToegFvaSJcIll4S9kFa5mv3GFoquhMRHQjEjnkXPHP/pXwaWcA==`
  - remediated package tree: `sha512-li/y4SFf6t3Z6JvP2R2H8dfauu0eybiwzd408QMCR9+zzi6oVVVffi+LGRDDYMh2TFCGgQ8Pnv2a5FiXMmPt1A==`
- `@openclaw/whatsapp@2026.9.2`
  - `sha512-vOWQIk7FpLHrhMmO+FaLi+pnFB82hiWNJJFJONkBuofERh2SMEz7EMut/vECFFEjFnmOZSVlYfRlxhbNkd/R6g==`
- `@openclaw/msteams@2026.9.2`
  - `sha512-py5KvGOTcd0qGGRf3EuqbH2jO+kZtvMquDMjwGkT6x9F4XZtaCBL/lmLitb4hDb5xaIpPP8ZLIbT8GIMXQr3Og==`
- `@tencent-weixin/openclaw-weixin@2.4.9`
  - `sha512-SfaYehR1Cwq2VV5HxJBp9sVilMms420VfZlMbF4YjRbWomr5+GxfXp9HkeU6y5TbnOc4Ysq0qPw1yBvJwbenBA==`
  - `https://registry.npmjs.org/@tencent-weixin/openclaw-weixin/-/openclaw-weixin-2.4.9.tgz`
- `@zed-industries/codex-acp@0.11.1`
  - `sha512-My2VSlBtvJipJhImHjFDej2ut/p00QqOISRnZgLgLrSIzjgvdcQvAhaZviWj7XPhk4UIdIb0OoA+Lrls824uiQ==`
  - `https://registry.npmjs.org/@zed-industries/codex-acp/-/codex-acp-0.11.1.tgz`
- `tar@7.5.21` (NemoClaw plugin direct dependency)
  - `sha512-XdhtCvlMywwxpCW8YEq3lOXBJpUPTR2OHHcwLPO3HwsJqOHa2Ok/oJ7ruGzp+JrKoRPVCzJwAdEjqLW/vNRPHA==`
  - `https://registry.npmjs.org/tar/-/tar-7.5.21.tgz`
- `undici@8.10.2` (NemoClaw CLI and OpenClaw runtime override)
  - `https://registry.npmjs.org/undici/-/undici-8.10.2.tgz`
- `proxy-addr@2.0.8` (Slack bundled-dependency remediation)
  - `sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==`
  - `https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz`
  - `MIT`; dependencies `forwarded@0.2.0` and `ipaddr.js@1.9.1`; Node `>= 0.10`
- `mcporter@0.7.3` committed runtime lock
  - SHA-256: `962dee34f6b0a493521d1619d1cf030e2630cbdfce8bf0598217202f57078793`

## Audit result and temporary dependency remediations

The reviewed audit materializes three production-compatible boundaries: the
remediated reviewed-archive graph, the committed OpenClaw runtime lock, and the
committed WeChat and mcporter runtime locks. Point-in-time `npm audit` results
under Node `22.23.1` against the official registry:

- OpenClaw locked runtime: `info=0`, `low=0`, `moderate=2`, `high=0`,
  `critical=0`, `clean` at the configured `high` threshold.
- WeChat locked runtime: `info=0`, `low=0`, `moderate=0`, `high=0`,
  `critical=0`, `clean`.
- Managed messaging locked runtime (advisory scan, not a threshold gate):
  `info=0`, `low=0`, `moderate=4`, `high=1`, `critical=1`.

Lower-severity findings remain visible below the configured `high`
threshold.

The managed messaging lock's `critical` finding is the bundled
`proxy-addr@2.0.7` inside the published `@openclaw/slack@2026.9.2` archive's
`@slack/bolt@5.0.0` → `express@5.2.1` dependency tree, affected by
`GHSA-jqcg-44mw-7w3h`. The reviewed Slack remediation replaces that bundled
package with `proxy-addr@2.0.8` after verifying the Slack, Bolt, Express, and
proxy-addr package identities and dependency shapes. The messaging runtime
manifest's own `proxy-addr@2.0.8` override covers the resolved top-level graph.
The Slack remediation's remediated package tree is pinned to
`sha512-li/y4SFf6t3Z6JvP2R2H8dfauu0eybiwzd408QMCR9+zzi6oVVVffi+LGRDDYMh2TFCGgQ8Pnv2a5FiXMmPt1A==`
and was reproduced byte-for-byte on the real `2026.9.2` archive.

The OpenClaw locked runtime's two moderate findings are `hono@4.12.34`
(`<4.13.5`, `<4.13.7` ranges) and `fast-uri@3.1.7`
(`GHSA-hrr3-gc8f-f4qj`, `<3.1.8`), both below the `high` threshold. They are the
reviewed override pins; upgrade decisions stay with the override review, not
this pin.

The messaging lock's `axios@1.19.0` direct dependency reports a `high`
severity advisory affecting `>=1.7.0 <1.20.0` published after the reviewed
upstream pin. Axios is the messaging runtime's own HTTP client; the finding is
recorded here and remains under review rather than silently overriding the
reviewed pin.

The `2026.7.1` core remediations are intentionally absent from the `2026.9.2`
graph: the published `openclaw@2026.9.2` archive ships corrected
`brace-expansion`, `fast-uri`, `undici`, and `ip-address` identities, so the
`current-core` branch stays bound to `2026.7.1` and rejects anything else. The
`2026.7.1` Discord `undici`, Slack and Microsoft Teams `axios`, and
diagnostics-otel Jaeger remediations likewise stay bound to their reviewed
`2026.7.1` archives.

`scripts/lib/openclaw-npm-remediation.mts` verifies each original package and
replacement package identity before it writes the archive. For Slack it
requires `@openclaw/slack@2026.9.2`, bundled `@slack/bolt@5.0.0`, bundled
`express@5.2.1` declaring `proxy-addr@^2.0.7`, bundled `proxy-addr@2.0.7` with
`forwarded@0.2.0` and `ipaddr.js@1.9.1`, and a replacement package that is
exactly `proxy-addr@2.0.8` with the same dependency shape, MIT license, and
`>= 0.10` engine. It then verifies the deterministic remediated package-tree
integrity before installation. This canonical tree digest is independent of
npm-generated tar metadata, which can vary between npm patch releases without
changing package contents.

OpenClaw `2026.9.2` installs official plugins into package-specific managed
npm projects. Remediating the archive alone does not guarantee the installed
project tree carries the replacement when the managed project re-resolves its
own dependency graph. The installed-tree `proxy-addr` verification and repair
that upstream added for this boundary is tracked as follow-up work for the
managed messaging install path; until it lands, the Slack channel's installed
bundled tree keeps the reviewed but advisory-affected `proxy-addr@2.0.7`, and
the top-level messaging graph override keeps the resolved `2.0.8`.

The reviewed installer verifies each registry identity and downloaded tarball
integrity. `scripts/lib/reviewed-npm-archive.mts` uses `npm pack --json` and
rejects reported archive filenames containing unsafe archive paths. Its archive
checks bind reviewed npm installs to verified local archives: they compare each
reviewed npm plugin registry integrity, and the helper returns only the
verified local `.tgz` path. Its
locked-runtime checks bind the OpenClaw and mcporter installs to exact
committed lock digests, the official registry origin, and post-install graph
verification.

The final OpenClaw image materializes its optional OTEL, Brave, and Tavily
plugins, the WeChat runtime, the complete managed-messaging dependency graph,
and `@zed-industries/codex-acp@0.11.1` without network access in any
package-install instruction. For these components, BuildKit fetches every
source archive through a checksum-addressed `ADD` instruction. The optional
plugin boundary verifies the committed SHA-512 identities for
`@openclaw/diagnostics-otel@2026.9.2`, `@openclaw/brave-plugin@2026.9.2`, and
`@openclaw/tavily-plugin@2026.9.2`. The WeChat dependencies
`openclaw-weixin@2.4.9`, `qrcode-terminal@0.12.0`, and `zod@4.4.3` use
committed SHA-256 source checksums and their lockfile SHA-512 identities.
The managed-messaging lock selects `430` unique archives: `410` common
archives plus `10` architecture-specific archives for each of `linux-x64` and
`linux-arm64`. Archive basenames that collide across scopes carry a
SHA-256-of-URL prefix so distinct packages can never share one cache entry.
The Dockerfile selects the exact platform stage, verifies every archive again
against the committed lockfile SHA-512 identity, and runs `npm ci` with
`NPM_CONFIG_OFFLINE=true` under `RUN --network=none`.
`scripts/lib/seed-reviewed-npm-cache.mts` rejects missing, extra, symlinked,
off-registry, or integrity-mismatched archives before it creates the minimal
npm resolver metadata. Package materialization cannot fall back to the public
registry.

## Existing security and runtime contracts

The supply-chain gates are unchanged: unpinned versions are rejected, versions
below `MIN_VER` are rejected, a committed lock SHA-256 mismatch is rejected,
registry-origin drift is rejected, and `NPM_CONFIG_OFFLINE=true` install
instructions still run under `--network=none`. The `2026.7.1` pin family is
removed; the `2026.3.11` and `2026.4.24` pins remain only as E2E legacy
fixtures gated behind production rejection.

The compiled-dist patch inventory, the pairing and config surfaces, and the
supervisor and shields boundaries are unchanged by this pin bump. Patch
anchors verified against the `2026.7.1` dist must be re-verified against the
`2026.9.2` dist before the agent is declared runnable; that re-verification is
tracked separately and this document does not assert it. Comments inside the
Dockerfile that name `2026.7.1` mark the dist version each patch was last
verified against and are updated as re-verification lands.
