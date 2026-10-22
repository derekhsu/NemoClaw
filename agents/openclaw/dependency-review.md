<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# OpenClaw MCP Runtime Dependency Review

This file records the reviewed `mcporter` baseline installed in the OpenClaw sandbox image.
Update it and `agents/openclaw/mcporter-runtime/package*.json` together whenever `MCPORTER_VERSION`, its integrity value, a manifest override, or the locked graph changes in `Dockerfile.base` or `Dockerfile`.

- Package: `mcporter@0.7.3`
- Purpose: in-sandbox OpenClaw MCP configuration and client adapter; it is not a host bridge, proxy, relay, or listener.
- Registry source: `https://registry.npmjs.org/mcporter/-/mcporter-0.7.3.tgz`
- Repository: `https://github.com/steipete/mcporter`
- License: `MIT`, from the npm registry package metadata.
- npm integrity: `sha512-egoPVYqTnWb3NjRIxo+xc8OrAI0dlPrJm9pAiZx0pImuNIV5rKhGtTnIfH/Y1ldGPVu74ibj3KR5c9U/QSdQFA==`
- Registry metadata independently queried from npm: 2026-06-30.
- Locked graph: `agents/openclaw/mcporter-runtime/package-lock.json` (npm lockfile version 3).
- Lock regeneration command: `npm --prefix agents/openclaw/mcporter-runtime install --package-lock-only --ignore-scripts --omit=dev`
- Advisory command: `npm --prefix agents/openclaw/mcporter-runtime ci --ignore-scripts --omit=dev && node --experimental-strip-types scripts/lib/reviewed-npm-audit.mts --directory agents/openclaw/mcporter-runtime --exceptions ci/npm-audit-exceptions.json --graph mcporter-runtime --threshold high && npm --prefix agents/openclaw/mcporter-runtime audit signatures`
- Advisory review date: 2026-10-16.
- Advisory result: `0` high and `0` critical vulnerabilities across the resolved production dependency graph; the current report keeps `8` moderate findings visible below the configured threshold. npm verified registry signatures for all `120` resolved packages and attestations for `15` packages.
- Security override: `@modelcontextprotocol/sdk@1.31.0` (`sha512-UvTMgnNlnIBO/22ob2RcVGDlcvOslQs8T59+FTGdA0L27a39fdGF/EDETNtDVK4DZGpwomlsYpRdA8UXcVL/pw==`) replaces `1.29.0` for `GHSA-6qxp-vccf-f47h`. The replacement stays within mcporter's declared `^1.25.1` range and preserves the MIT license and Node.js `>=18` floor. Mcporter persists complete token and client-information objects, preserving the patched SDK's `issuer` field. Existing OAuth credentials saved without `issuer` require clearing and a new sign-in, as specified by the advisory. Remove this override when the reviewed graph resolves to a patched SDK.
- Security override: `@hono/node-server@2.0.11` (`sha512-bjD221KPLoJTWUwso1J6fGKiTXEUFedG/s0visavY4zakFPkeGURMRNly+FhBHs7T8Dz4qHaZIMX9ZoJHSJtKA==`) replaces the SDK's vulnerable `1.19.14` resolution for `GHSA-frvp-7c67-39w9` and the previously reviewed `2.0.5` resolution affected by `GHSA-9mqv-5hh9-4cgg`. `2.0.5` is the first patched release for `GHSA-frvp-7c67-39w9`. The reviewed v2 range retains the `getRequestListener` API used by `@modelcontextprotocol/sdk`; its Node.js 20 floor is below NemoClaw's Node.js 22.19 floor, and the `/vercel` adapter is not consumed. Mcporter's production path imports the SDK's client transport, not the server adapter, and the image build still exercises the installed CLI after the locked install. Remove the override when the SDK's declared range resolves to a reviewed release outside both affected ranges.
- Security override: `fast-uri@3.1.7` (`sha512-dOvZVzjdZdz7phd9v6jCbwxrBW3fK6n8Rc0CtdmM4bumzMnxywBYhuph6J819RRw/ku+rLbelwfMunktuzVVHg==`) replaces the previous `3.1.5` pin. `GHSA-58mr-gqgx-xq4g`, `GHSA-5jgf-p345-68v8`, `GHSA-f65p-4m7j-42xc`, `GHSA-fph4-wmhf-6fwf`, `GHSA-jqff-g426-hqxp`, and `GHSA-qw65-cvwx-89v3` affect releases through `3.1.6`; `3.1.7` fixes all of them and retains the earlier `3.x` security fixes for `GHSA-v2hh-gcrm-f6hx` (through `3.1.3`) and `GHSA-7p8r-x3mc-p8w7` (`3.0.0` through `3.1.4`). The replacement remains within Ajv's declared `^3.0.1` range and preserves the reviewed v3 API boundary. Remove the override when the declared graph resolves to a reviewed release outside all affected ranges.
- Security override: `hono@4.12.34` (`sha512-GqXJqY/xJkJmuloTrnV1ZEXG3fqte+VjkUqoRNZXcrUidiUOP4fMSIHHY4tsqZBK++kVyWmt/AAfSUuy57/eSA==`) replaces the SDK's vulnerable `4.12.27` resolution. `GHSA-8j4g-w8fx-2239`, `GHSA-54fx-42gc-7vw4`, `GHSA-f23p-vx2j-j53r`, and `GHSA-79qm-7rj5-m7r9` are fixed in `4.12.34`. The replacement remains within the SDK's declared `^4.11.4` range and preserves Hono's Node.js `>=16.9.0` contract. Remove the override when the declared graph resolves to a reviewed release outside the affected ranges.
- Security override: `ip-address@10.3.1` (`sha512-1e9d3kb97NHJTIJDZW9rKqW2h6+dFa50Dy0fpPSMQp2ADje5gvKsXmdiK6dwY5t76TaTt5+P5N1Y/LoToIxP6g==`) replaces `express-rate-limit`'s vulnerable `10.2.0` resolution. `GHSA-mwp4-54f8-5fhr` affects releases through `10.3.0`; the replacement remains within the declared `^10.2.0` range, adds the leading-zero IPv4 rejection and host-only subnet classification required for trust-boundary checks, and preserves Node `>= 12`. Remove the override when the declared graph resolves to a reviewed release outside the affected range.
- Security override: `proxy-addr@2.0.8` (`sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==`) replaces `2.0.7` for `GHSA-jqcg-44mw-7w3h`. The replacement keeps the unchanged `forwarded@0.2.0` and `ipaddr.js@1.9.1` dependencies, the MIT license, and the existing Node.js engine floor. Remove the override when the declared graph resolves to a reviewed release outside the affected range.

Both image paths install the committed graph with `npm ci --ignore-scripts --omit=dev` because the published package declares no install-time lifecycle script and NemoClaw needs only its already-built CLI.
The reviewed audit wrapper reports lower-severity production findings and blocks unaccepted high or critical advisories. The default `ci/npm-audit-exceptions.json` registry is empty. Any future exception must match one advisory, graph, package, installed version, and severity; identify an owner and NemoClaw tracking issue; state a decision, rationale, and expiry no more than 30 days away; and include compensating controls for temporary risk acceptance. Missing, malformed, expired, overlong, mismatched, or unused exceptions fail closed. The repository-wide audit also rejects exceptions for unknown graph IDs. Registry signature verification remains a separate control.

## WeChat plugin runtime graph

- Package: `@tencent-weixin/openclaw-weixin@2.4.9`.
- Locked graph: `agents/openclaw/wechat-runtime/package-lock.json` (npm lockfile version 3).
- Lock regeneration: `npm install --package-lock-only --legacy-peer-deps --ignore-scripts --omit=dev --prefix agents/openclaw/wechat-runtime`.
- Installation boundary: the image materializes the reviewed lock into a root-owned dedicated npm cache and adds the exact package metadata needed by npm's offline resolver. Before that cache becomes immutable, the shared `scripts/lib/reviewed-npm-archive.mts` implementation re-packs every locked archive offline from the final cache and rejects registry-origin drift, metadata or packed-byte SRI drift, unsafe filenames, missing archives, and symlinks. The sandbox user copies that verified immutable source into a writable cache used for registry metadata lookup, archive packing, and the OpenClaw plugin install; no retrieval step falls back to `HOME/.npm`. The copy is deleted in the same image layer, and the trusted cache is never writable. The installer runs in offline, legacy-peer mode, then `verify-wechat-runtime-lock.mts` rejects integrity, version, dependency-set, or peer-range drift and refuses an image OpenClaw version below the plugin's locked peer minimum.
- Default CI gate: `wechat-runtime-audit` in `.github/workflows/pr.yaml` and `.github/workflows/main.yaml` invokes the reviewed `.github/actions/ci-wechat-runtime-audit` implementation.
  The pull request workflow resolves the action from the PR base SHA.
  If the PR base SHA does not contain the action, the pull request workflow fails.
  The `main.yaml` workflow uses the merged action.
  The action uses Node.js `22.19.0`.
  It downloads `npm@10.9.4` and verifies the archive against the committed Subresource Integrity (SRI) value.
  It installs the verified archive in npm offline mode with lifecycle scripts disabled.
  It materializes the committed graph with scripts disabled.
  The action rejects any low-or-higher production advisory and verifies registry signatures.
  The PR and main workflows upload the resulting reports.
  It also exercises the reviewed archive through a copied writable cache while the trusted source remains read-only.
  The action makes at most three `npm audit signatures` attempts.
  It retries a failed attempt only when the output contains `npm error Failed to download`.
  A failed attempt without this marker stops further attempts.
  Any final nonzero status fails the action.
  The report directory stores each attempt in `npm-audit-signatures-attempt-<n>.txt`.
  After a failed attempt, the action copies available npm debug logs to `npm-audit-signature-debug/`.
- Advisory command: `npm ci --ignore-scripts --omit=dev --legacy-peer-deps --prefix agents/openclaw/wechat-runtime && npm audit --omit=dev --audit-level=low --json --prefix agents/openclaw/wechat-runtime && npm audit signatures --prefix agents/openclaw/wechat-runtime`.
- Advisory review: `2026-07-12`; result: `0` known vulnerabilities across the resolved production graph.
- Regression tests: `test/wechat-locked-install.test.ts` keeps the manifest runtime-lock paths and installer verification dispatch synchronized; `test/verify-wechat-runtime-lock.test.ts` proves the installed graph and OpenClaw peer-range compatibility fail closed; `test/wechat-runtime-audit-workflow.test.ts` keeps the Docker cache lifecycle, audit threshold, bounded download-only signature retry, invalid-signature denial, and real npm-pack boundary synchronized.

The dedicated graph intentionally omits the plugin's `openclaw` peer dependency. The image already installs and integrity-verifies the reviewed OpenClaw runtime separately; auto-installing another OpenClaw copy would create a second unreviewed runtime graph.
Disabling scripts also prevents transitive packages from executing lifecycle code during the trusted image build.
The lock records the exact version, registry URL, and integrity for every transitive package; the top-level registry integrity check remains an independent control.

## Source-of-Truth Boundary

- `invalidState`: the image installs a package graph, tarball, license, or advisory state that differs from the independently queried npm registry records for `mcporter@0.7.3`, resolves `@hono/node-server` to any version other than exact `2.0.11`, resolves `@modelcontextprotocol/sdk` to any version other than exact `1.31.0`, resolves `fast-uri` to any version other than exact `3.1.7`, resolves `hono` to any version other than exact `4.12.34`, resolves `ip-address` to any version other than exact `10.3.1`, or resolves `proxy-addr` to any version other than exact `2.0.8`.
- `sourceBoundary`: npm owns registry metadata, tarball integrity, provenance signatures, and advisory responses; NemoClaw owns the exact lock, script-disabled install, Docker integrity assertion, empty-by-default audit exception registry, and review record.
- `whyNotSourceFix`: a repository note cannot make external registry state trustworthy, so image builds execute `npm audit` and `npm audit signatures` against the locked production graph and reviewers compare the lock with the registry response.
- `regressionTest`: `test/mcporter-supply-chain.test.ts` keeps the version, integrity, lock metadata, Docker install flags, audit commands, and this review synchronized; `test/reviewed-npm-audit.test.ts` proves exact matching and fail-closed exception validation.
- `removalCondition`: remove this runtime dependency and review when OpenClaw provides the required authenticated Streamable HTTP client lifecycle without mcporter, or repeat the independent review for a newly pinned version.
