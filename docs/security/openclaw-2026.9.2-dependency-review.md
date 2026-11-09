<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# OpenClaw 2026.9.2 dependency review

Inherited migration review date: 2026-12-26.
The inherited date is later than this remediation and does not date its validation evidence.

## Decision

Pin the production OpenClaw runtime and matching official plugins to the
non-prerelease `v2026.9.2` release. This replaces `2026.7.1`. OpenShell remains
pinned at `0.0.101`; this migration does not change any OpenShell pin, the
child-visible credential manifest, or the exact-version supervisor gate.

The production OpenClaw install uses the authoritative committed lock at
`agents/openclaw/openclaw-runtime/package-lock.json`, with SHA-256
`154229a557bdff54be02e8ecd7c06f0355b6c11aa7efab8aa5443dcfb24e928a`.
NemoClaw regenerates that lock from the SRI-verified `openclaw@2026.9.2`
archive. The published `openclaw@2026.9.2` archive now carries the corrected
dependency identities that the `2026.7.1` remediation rewrote, so the install
requires no core remediation entry. The OpenClaw runtime manifest instead pins
reviewed overrides for `@modelcontextprotocol/sdk@1.32.0`, `hono@4.12.34`,
`tar@7.5.21`, `fast-uri@3.1.7`, `undici@8.12.2`, `body-parser@2.4.0`, and `zod@4.6.6`.

The managed messaging runtime manifest selects the `2026.9.2` channel plugin
graph, `@tencent-weixin/openclaw-weixin@2.4.9`, `@emnapi/core@1.11.1`,
`@emnapi/runtime@1.11.3`, `axios@1.19.0`, `undici@8.10.2`, and the reviewed npm
alias overrides `fast-uri@4.1.4`, `ip-address@10.5.0`, `protobufjs@8.7.2`,
`qs@6.15.3`, `uuid@14.0.2`, and `proxy-addr@2.0.8`. The committed WeChat
runtime lock is `agents/openclaw/wechat-runtime/package-lock.json` with
SHA-256 `74856e20d229528ee7e2d107e6238e2204beea36c0deb733a7102082bcd4e5ea`.

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
- `undici@8.10.2` (NemoClaw CLI and managed messaging pin; OpenClaw runtime overrides to `8.12.2`)
  - `https://registry.npmjs.org/undici/-/undici-8.10.2.tgz`
- `proxy-addr@2.0.8` (Slack bundled-dependency remediation)
  - `sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==`
  - `https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz`
  - `MIT`; dependencies `forwarded@0.2.0` and `ipaddr.js@1.9.1`; Node `>= 0.10`
- `mcporter@0.7.3` committed runtime lock
  - SHA-256: `c24649f412f19bebfed29bda9f0b17f714fb4834ff76d06ef97e792952c33ebd`

## Audit result and temporary dependency remediations

The reviewed audit materializes three production-compatible boundaries: the
remediated reviewed-archive graph, the committed OpenClaw runtime lock, and the
committed WeChat and mcporter runtime locks. Point-in-time `npm audit` results
under Node `22.23.1` against the official registry:

- OpenClaw locked runtime: `info=0`, `low=0`, `moderate=8`, `high=0`,
  `critical=0` in the isolated remediation candidate at the configured `high` threshold.
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

The isolated OpenClaw and mcporter remediation candidates each report `moderate=8`, `high=0`, and `critical=0`.
The candidates installed with lifecycle scripts disabled, and the unchanged repository audit wrapper returned exit code `0` and status `clean` for each graph.
Here, `clean` means no unaccepted finding at or above the configured `high` threshold.
These results do not establish final image acceptance.
The candidate retains lower-severity findings below the configured `high` threshold.
Both isolated installs passed `npm audit signatures` with exit code `0`.
Mcporter verified `120` package signatures and `16` attestations; OpenClaw verified `328` package signatures and `62` attestations.
Both image builds still require validation before publication.
Isolated smoke checks passed for `mcporter@0.7.3` and `openclaw@2026.9.2` CLI commands, SDK `StreamableHTTPServerTransport` shutdown, and one-issue rejection of an oversized Zod array.
The earlier focused six-file test run passed `77` tests; two known baseline failures remain tracked in issue `#4` for wording and a legacy `RUN` fixture.
After the archive-test and CI prefetch updates, the six-file run passed `63` tests and encountered six environment failures.
Those failures occurred before assertions because the host macOS Bash `3.2` lacks `readarray`; they do not establish a code regression or belong to issue `#4`.
The other five focused files passed `59` tests, and a separate four-file core run passed `44` tests.
Installed OpenClaw smoke checks also passed Undici streaming and valid gzip JSON parsing.
Malformed gzip returned HTTP `400`, and the Express/body-parser server remained responsive.

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

The published `@openclaw/msteams@2026.9.2` archive loads `dist/index.cjs`, which selects `./channel-plugin-api.cjs` through `defineBundledChannelEntry`.
The Teams mention-hint preload recognizes that `.cjs` entry and retains recognition of the `.js` entry.
Its loader hook remains limited to matching plugin entries within `@openclaw/msteams`.
The package-contract fixture records the reviewed archive SRI and entry-file SHA-256 values and models this package-load boundary.
If runtime patching fails, the preload restores the loader hook, emits a bounded warning, and continues with the unmodified upstream plugin.

The final OpenClaw image materializes its optional OTEL, Brave, and Tavily
plugins, the WeChat runtime, the complete managed-messaging dependency graph,
and `@zed-industries/codex-acp@0.11.1` without network access in any
package-install instruction. For these components, BuildKit fetches every
source archive through a checksum-addressed `ADD` instruction. The optional
plugin boundary verifies the committed SHA-512 identities for
`@openclaw/diagnostics-otel@2026.9.2`, `@openclaw/brave-plugin@2026.9.2`, and
`@openclaw/tavily-plugin@2026.9.2`. The WeChat dependencies
`openclaw-weixin@2.4.9`, `qrcode-terminal@0.12.0`, and `zod@4.6.6` use
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

The lock verifier treats nested `inBundle: true` records as contents of an enclosing archive, rather than separately downloadable packages.
It requires a non-bundled enclosing archive record that declares a nonempty `bundleDependencies` list.
The enclosing archive must still satisfy the registry-origin and SHA-512 identity checks, which cover its bundled bytes.
The verifier rejects standalone bundled records and bundled records without that archive owner.
Cache seeding excludes bundled records from separate archive identities, including when their package name and version match a separately locked archive.
This correction does not change dependency pins, audit thresholds, or audit exceptions.

## Dependency Remediation on October 26, 2026

Build `40314970360` stopped at the mcporter production advisory gate.
The candidate keeps `openclaw@2026.9.2` and `mcporter@0.7.3` and changes exact dependency overrides in their committed runtime graphs.
The OpenClaw graph also replaces upstream's exact `undici@8.10.2` and `zod@4.4.3` pins.
Those two replacements require downstream runtime validation because upstream did not declare a compatible version range.
The managed messaging graph remains a separate review boundary.
The selected WeChat runtime also overrides `zod` to exact `4.6.6`.
Regeneration uses `--legacy-peer-deps` and preserves the four original lock entries for the root, WeChat plugin, `qrcode-terminal`, and `zod`.
Its checksum-addressed Docker archive uses SHA-256 `312553620ac82cbb25d505100fbb41c1e219b3cd6979cf93c3a1b4dd5b79e039`, verified against the locked SRI.
The isolated WeChat `npm ci --legacy-peer-deps --ignore-scripts` installed exactly three packages.
Its production audit at the `low` threshold returned exit code `0` with `info=0`, `low=0`, `moderate=0`, `high=0`, and `critical=0`.
Its registry-signature check returned exit code `0` with three verified signatures and one attestation.
These package checks do not establish final image acceptance.

The following registry records bind each replacement to its package bytes and published source commit.

| Replacement | npm SRI | Registry Git Commit |
| --- | --- | --- |
| `@modelcontextprotocol/sdk@1.32.0` | `sha512-8BviX/hK4Gd2eL1KdTwm0gfl4d3wdoErW0Jd00h6nomUAtk6IJk5vwQJc6kfWtJTzN5OEV/lgIiJKI8fiDGAlA==` | `32549b00a9a808265f35a29f92fdf27fa4aac2ef` |
| `body-parser@2.4.0` | `sha512-Ifk1KcLrxaGt1occQagQNFNNOqRt1LFuehEnHHzB8Z6cRgIxRU1TBaiIsUiCdA+gy5PL7Y1IX31DNKkRmxtXjQ==` | `b4744d739e1e2e5257f2ddac31eed191aa5152a4` |
| `zod@4.6.6` | `sha512-4UmzQUF5fxvfcYHlbjBmejU+w+hbDnWFx4aS8kBx7nPBHcO2SqPbpAG8snbdg+Xse4pRefR98hgjFgIMCI/UhA==` | `284243fb0d6532665afdc9239188773bb624f73c` |
| `undici@8.12.2` | `sha512-XtuDWVdqTLr3NAxm2ly9/hU6kUsJOgGh1RASzMBbsw6aWCOaQzHdW+QQDfdERjfJ2V5vL5pRPa4RetO9UfivDg==` | `bb6cc0ae9b6827ed273ed5ba344148273629638f` |

The SDK source inventory at the registry commit retains client and server exports, the Node.js `>=18` floor, and the `zod@^3.25 || ^4.0` contract.
Mcporter's `^1.25.1` SDK range accepts `1.32.0`; OpenClaw's exact `1.30.0` dependency is intentionally overridden.
The existing SDK token-issuer review still applies.

Body-parser's source history at the registry commit identifies the fix for `GHSA-27r3-jxmh-p828`.
It also adds `zstd` content decoding and stops mutating parser options and request objects while reading bodies.
Express's `^2.2.1` range accepts `2.4.0`, and its Node.js `>=18` floor remains below the image's Node.js `22.23.1`.
Its changed transitive ranges include `content-type@^2.1.0`, `iconv-lite@^0.7.3`, and `qs@^6.16.1`.

The official Zod `v4.6.6` release checks array, set, and map bounds before element parsing.
The release records that compromised source commits were removed and were never published to npm.
It identifies registry commit `284243fb` as a pre-rewrite copy of `9c219833c3a3764fa1f1ea9c5ecec8254a63c0b1` with identical contents.
The review therefore binds the npm archive SRI and registry source commit instead of assuming the rewritten release commit has the same identity.
Mcporter's `^4.2.1` range accepts this replacement; OpenClaw's exact `4.4.3` pin is intentionally overridden.

The official Undici `v8.12.2` release fixes TLS renegotiation process crashes, dropped TLS verification callbacks, redirect-cache origin confusion, and excessive content-encoding crashes.
It also fixes decompression errors, mixed-case SRI algorithms, and unbounded EventSource and WebSocket buffering.
The package requires Node.js `>=22.19.0`, which the image's Node.js `22.23.1` satisfies.
Validation must exercise OpenClaw's HTTP dispatch, TLS options, streaming, and schema consumers before publication.

The review used official npm version records, the SDK package inventory and body-parser history at the immutable commits above, and official Zod and Undici release inventories.
The candidate does not add an audit exception, lower an audit threshold, disable signature verification, or establish final image acceptance.
The completed smoke checks cover CLI startup, SDK transport shutdown, Zod size-bound rejection, Undici streaming, and Express/body-parser gzip handling.
Final runtime and image validation remain pending.

## Base Remediation for 2026.9.2-r3

Trivy run `41219379848` scanned the published `2026.9.2-r2` image (`sha256:8f951046eaf0de9f2e00fb7ff7d8d33de62e5c5890758289e27ec405fb5c1d02`).
It reported 11 HIGH findings that have a fixed release.
This change rebuilds the standard OpenClaw sandbox image as `2026.9.2-r3` to remove them (#19).
The candidate keeps `openclaw@2026.9.2`, `npm@12.0.2`, and OpenShell `0.0.101`.

| Package | Location | r2 version | r3 version | Findings |
| --- | --- | --- | --- | --- |
| `libexpat1` | Debian package in the OpenClaw base | `2.8.3-1` | `2.9.0-1~deb13u1` | `CVE-2026-66046`, `CVE-2026-76956`, `CVE-2026-76957`, `CVE-2026-77214`, `CVE-2026-93990` |
| `undici` | npm private tree | `6.27.0` | `6.29.1` | `CVE-2026-19534`, `CVE-2026-87018`, `CVE-2026-109383`, `CVE-2026-109869` |
| `brace-expansion` | npm private tree | `5.0.9` | `5.0.12` | `CVE-2026-102276`, `CVE-2026-102278` |

Trivy did not report these findings in the OpenClaw runtime graph.
The npm findings are in `/usr/local/lib/node_modules/npm/node_modules/`.

### Expat

`Dockerfile.base` downloads `libexpat1_2.9.0-1~deb13u1` from Debian snapshot `20261017T204620Z`.
The snapshot file listing for `libexpat1/2.9.0-1~deb13u1` records the same files in the `debian-security` archive from `20261016T061025Z`.

| Architecture | SHA-256 | Snapshot SHA-1 |
| --- | --- | --- |
| `amd64` | `feff874772cae904ae4d24e917b35664952bec4b4ae9100a4edda5a7fa746832` | `074f4df385e654b2b9aaeda0eeb8be65608b7e22` |
| `arm64` | `d9e1c50fcdad079fe16d77f1578adcc763be1bf7f2da7fa8adca7010b0c84c83` | `e33be55b621c77c4de2ac114651600499d513fb4` |

The package keeps the `libexpat.so.1` soname; the shared-library file moves to `libexpat.so.1.13.0`.
It pre-depends on `libc6 (>= 2.36)`, and the base installs `libc6=2.41-12+deb13u4`.
The base image and the sandbox image assert that Python `pyexpat` reports `expat_2.9.0`.

For Expat, issue #19 changes only the OpenClaw base image, so only the OpenClaw security inventory changes.
The Hermes sandbox image builds on a pinned base digest that contains `libexpat1=2.8.3-1`.
The LangChain Deep Agents Code base image still installs `2.8.3-1`.
The shared inventory keeps `2.8.3-1` for both, and those images still carry the Expat findings.

### npm private tree

npm `12.2.1` bundles `undici@6.29.0`, which does not fix three of the four undici findings.
The candidate therefore keeps `npm@12.0.2` and replaces only the `undici` and `brace-expansion` packages in npm's private tree.

| Replacement | npm SRI | Registry Git Commit |
| --- | --- | --- |
| `undici@6.29.1` | `sha512-EvRlUt/QqAEvXdQeRMYUfwOQsfzpDztykrG2owGEE/rBOBoYv9uF39ZzsNDh4lTFHhTr2XOZjKkYgueD12ZmGA==` | `8c57f6c68c95465338ae97bfc991cb1513d2f76e` |
| `brace-expansion@5.0.12` | `sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==` | `f3410159d768f56c9d9f4511d3e1b46425fc1099` |

`scripts/lib/patch-bundled-npm-undici.mts` follows the `ip-address` replacement contract:

- It accepts only `npm@12.0.2` with exactly one `undici` package.
- It verifies the archive SRI and rejects symlinks in the replacement.
- It swaps the package and restores the original package when verification fails.
- It runs `npm --version` and `npx --version` only after the replacement passes verification.
- It requires `main: index.js`, `types: index.d.ts`, `engines.node: >=18.17`, and no dependencies.

npm's `node-gyp@13.0.0` declares `undici@^6.25.0`, which accepts `6.29.1`.
Only the OpenClaw base image and the OpenClaw sandbox image run the `undici` helper.

`scripts/patch-bundled-npm-brace-expansion.mts` now installs `5.0.12`.
It treats the earlier `5.0.9` replacement as affected and replaces it.
The `5.0.12` release keeps the `balanced-match@^4.0.2` dependency that the helper requires.
The Hermes and Deep Agents Code Dockerfiles also run this shared helper.
The next rebuild of each of those images installs `5.0.12`.

### Validation

- Unit tests cover these `undici` helper cases: replacement, already fixed, rollback, cleanup failure, layout drift, unsafe member, and wrong version.
- Dockerfile contract tests require the `undici` replacement after the `ip-address` replacement in `Dockerfile.base` and `Dockerfile`.
- Security package tests run the OpenClaw base image and sandbox image layers with the `2.9.0-1~deb13u1` inventory.
  They keep the `2.8.3-1` inventory for Hermes and Deep Agents Code.

The candidate does not add an audit exception, lower an audit threshold, or change network policy.
Image build, Trivy scan, and runtime validation of `2026.9.2-r3` remain pending.

## Homebrew Update for 2026.9.2-r4

`2026.9.2-r4` moves the bundled Homebrew from `5.1.12` to `7.0.12` so that `brew install` works inside an OpenShell sandbox (NVIDIA/NemoClaw#14092).
`Dockerfile.base` preinstalls Homebrew's portable Ruby `4.0.9`, so the scan covers the Ruby that `brew` runs.

The OpenClaw Standard Verify scan of the r4 candidate reports one new fixable finding on amd64 and arm64.

| Finding | Package | Location | Fixed in |
| --- | --- | --- | --- |
| `CVE-2026-33210` (CRITICAL, GHSA-3m6g-2423-7cp3) | `json` `2.18.0` default gem | `/home/linuxbrew/.linuxbrew/Homebrew/Library/Homebrew/vendor/portable-ruby/4.0.9/` | `2.19.2` |

Homebrew `7.0.12` and Homebrew `main` both ship portable Ruby `4.0.9`, so no Homebrew release contains the fix.
The advisory applies only when a caller parses JSON with `allow_duplicate_key: false`.
Homebrew `7.0.12` passes only `allow_duplicate_key: true`, in `Library/Homebrew/livecheck/strategy/json.rb`.

`ci/trivy-standard-image-exceptions.json` records a `not-affected` exception for this finding.
`scripts/security/reject-fixable-trivy-findings.sh` applies it with these rules:

- An entry matches one finding exactly: vulnerability ID, package, installed version, severity, and package path.
- An entry expires within 30 days and records an owner, a NemoClaw tracking issue, a rationale, and compensating controls.
- A malformed, duplicate, expired, or unused entry fails the gate.
- Every other fixable CRITICAL or HIGH finding still fails the gate.

Remove the entry when Homebrew ships a portable Ruby with `json` `2.19.2` or later, and bump `HOMEBREW_VERSION` to that release.

## Debian zlib and apt Updates

On November 8, 2026, the OpenClaw Standard Verify scan (run `42503891703`, derekhsu/NemoClaw#63) reported four new fixable HIGH findings on amd64 and arm64.
The images built since 2026.9.2-r4 have the same packages.

| Package | Location | Installed | Fixed | Findings |
| --- | --- | --- | --- | --- |
| `zlib1g` | Debian package in the OpenClaw base | `1:1.3.dfsg+really1.3.1-1+b1+nemoclaw1` | `1:1.3.dfsg+really1.3.1-1+deb13u1` | `CVE-2026-76844`, `CVE-2026-85091` |
| `apt`, `libapt-pkg7.0` | Debian packages from the Node base image | `3.0.3` | `3.0.4` | `CVE-2026-109518` |

`Dockerfile.base` installs `zlib1g=1:1.3.dfsg+really1.3.1-1+deb13u1`, `apt=3.0.4`, and `libapt-pkg7.0=3.0.4` from `trixie-security`.
The OpenClaw security inventory records these three versions.

The Debian zlib update carries two upstream fixes:

- `Fix-buffer-overflow-bug-in-non-blocking-gzwrite.patch` (`CVE-2026-85091`, Debian bug #1146895) makes the same `gz_write` change as the NemoClaw backport `scripts/security/patches/zlib-1.3.1-write-error.patch`.
- `Check-for-negative-lengths-in-crc32_combine-function.patch` adds a check that the backport does not have.

The OpenClaw base therefore installs Debian's package and does not install the NemoClaw `+nemoclaw1` backport.
`scripts/security/zlib-write-error.c` passes against a library built from the `deb13u1` source.
With the Debian gzwrite patch reversed, the same regression fails with exit status 4.

These updates change only the OpenClaw base image and its inventory, like the Expat update.
The Hermes and Deep Agents Code bases still install the zlib backport and the apt from the Node base image.
The shared inventory keeps `1:1.3.dfsg+really1.3.1-1+b1+nemoclaw1` for both, and those images still have these findings.

The update adds no Trivy exception.
The existing `json` exception is not changed.

## Existing security and runtime contracts

The supply-chain gates are unchanged: unpinned versions are rejected, versions
below `MIN_VER` are rejected, a committed lock SHA-256 mismatch is rejected,
registry-origin drift is rejected, and `NPM_CONFIG_OFFLINE=true` install
instructions still run under `--network=none`. The `2026.7.1` pin family is
removed; the `2026.3.11` and `2026.4.24` pins remain only as E2E legacy
fixtures gated behind production rejection.

The compiled-dist patch inventory is re-anchored against the `2026.9.2`
dist. Patch anchors carried from the `2026.7.1` family must be re-verified
against the `2026.9.2` dist before the agent is declared runnable on a new
dist. Upstream retired the downstream `chat.send` ordering workaround
(`patch-openclaw-chat-send.mts`) because run-ID lineage and empty-terminal
suppression are now upstream-owned; the script, its Dockerfile staging and
application, and its dedicated tests are removed. Three upstream scripts are
adopted: `patch-openclaw-container-restart.mts` (fresh-process `execve`
restart inside OpenShell sandboxes),
`patch-openclaw-secondary-main-session-delete.mts` (secondary `main` session
deletion guard), and `patch-openclaw-npm12-pack-json.mts` (npm 12 pack-JSON
parser verifier, which already recognizes the `2026.9.2` bundled parser).
`patch-openclaw-device-self-approval.mts` is updated to the upstream `9.x`
selector set with SQLite pairing persistence specs gated on the dist shape.
`patch-openclaw-shared-state-permissions.mts` keeps the NemoClaw split-user
group-shared modes on the `2026.9.2` migration shapes.
`patch-gateway-daemon-dialback.mts` drops its call-context spec because
`2026.9.2` merged both env-URL resolution sites into one unified resolver;
the remaining specs keep strict exact-one semantics.

## Internal Context Streaming Compatibility

Issue `#9` records an intermittent OpenClaw `2026.9.2` failure during native Chat Completions server-sent event (SSE) delivery.
Assistant events can expose an internal runtime-context block before a sanitized replacement removes that block.
The native HTTP handler then rejects the replacement because an append-only stream cannot retract bytes already sent to the client.

The candidate image recipe applies `scripts/lib/patch-openclaw-internal-context-sse.mts` before the OpenClaw runtime payload is assembled.
The patch projects assistant-event text through the existing canonical runtime-context stripper before the native handler checks replacement snapshots.
It withholds incomplete delimiter lines and trailing whitespace during streaming.
Assistant-item transitions close the previous item's sanitization state so a new item cannot hide a leading internal-context block inside a visible line.
After a successful agent result, it releases withheld literal text that does not form a protected delimiter.
The native handler retains its error for a genuine non-prefix replacement and continues to report upstream failures.
This change does not suppress structured errors in an external gateway.

The patch accepts only the reviewed OpenClaw `2026.9.2` runtime.
SHA-256 checks bind the HTTP handler, canonical runtime-context stripper, and regular-expression helper to their reviewed source bytes.
A changed source file or an unsupported runtime version stops patch application.
The existing `2026.3.11` and `2026.4.24` legacy test fixtures skip this patch.
Applying the patch again preserves the patched source, and `--audit` rejects an unpatched reviewed runtime.
Remove the patch when a reviewed published OpenClaw runtime passes the native internal-context replacement and split-delimiter regressions without it.

The regression harness supplies synthetic assistant events to the extracted native SSE branch.
It substitutes ingress and response objects instead of running an HTTP listener, a Gateway, or a provider.
It tests the boundary where internal-context text precedes a sanitized replacement, including an internal-context block that begins at a new assistant item.
The focused test run passed 32 tests, with one existing opt-in artifact test skipped.
Scoped TypeScript, formatting, and Dockerfile lint checks passed.
A local diagnostic image built on the published `2026.9.2-r1` image applied the patch and passed its source audit during the build.
The subsequent installed-runtime probe did not run because the Docker socket became unavailable.
That diagnostic build does not establish acceptance of the complete image recipe or the installed native stream behavior.
These results do not reproduce a complete provider session or the live `sessions_spawn` and `sessions_yield` sequence.
The complete image recipe build, real sandbox and model acceptance, multi-architecture builds, publication, and deployment remain separate validation steps.
