<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Hermes Default MCP Scope Handover

This handover records the October 06, 2026 ClawShell fork repair for the default Hermes profile's remote Model Context Protocol (MCP) server.
It does not establish a new supported NemoClaw integration or record image adoption.
The user authorized the companion helper repair and a separate candidate image build.

## Restore the Default Remote Server

ClawShell configures `clawshell-gateway` through the image-owned `hermes-mcp-config-transaction.py` helper.
The helper changes `/sandbox/.hermes/config.yaml` through the existing guarded transaction and gateway reload acknowledgement.
The helper does not configure `/sandbox/.hermes-api/profiles/api` or enable MCP tools in the restricted API profile.
The image's existing default-profile ownership, integrity, and reload requirements still apply.

The installed helper previously required exactly one `Authorization` header for HTTP MCP entries.
ClawShell also needs a sandbox scope claim, so that helper rejects the required two-header payload before configuration changes.
Updating the ClawShell backend alone cannot update the installed image helper.

## Payload Contract

For `clawshell-gateway`, the helper accepts `Authorization` alone or `Authorization` with `X-ClawShell-Sandbox-Id`.
Other server names accept only `Authorization`.
The helper requires the exact header names and rejects every other header.
The sandbox scope value must match `<sandbox-id>.<proof>`.
The sandbox ID starts with a letter or digit and contains one through 128 letters, digits, underscores, or hyphens.
The proof contains exactly 32 lowercase hexadecimal characters.
The helper validates the claim's format and does not cryptographically verify the proof.
ClawShell creates the HMAC proof, and the Gateway verifies it.

The ClawShell adapter normalizes its configured HTTPS URL inline with `urlsplit` and passes the canonical URL to the helper.
That normalization does not perform destination DNS preflight or OpenShell address pinning.
The helper retains its existing URL checks, including rejection of credentials, queries, fragments, noncanonical URLs, and unsupported destinations.
ClawShell uses this authorization reference:

```text
Bearer openshell:resolve:env:GATEWAY_API_KEY
```

The transaction stores the reference in the default profile configuration, not the credential value.
The OpenShell credential provider owns the actual `GATEWAY_API_KEY` value and resolves the reference for allowed requests.
This repair does not rotate or remove that provider credential.
Removing the managed server entry removes its configuration references through the existing transaction.

The following example uses an illustrative scope proof, not a usable credential or verified claim.

```json
{
  "server": "clawshell-gateway",
  "url": "https://gateway.example.com/mcp",
  "headers": {
    "Authorization": "Bearer openshell:resolve:env:GATEWAY_API_KEY",
    "X-ClawShell-Sandbox-Id": "sbx-example.00000000000000000000000000000000"
  },
  "replace_existing": true
}
```

The existing forced removal operation remains server-name scoped.
It can remove a legacy entry without validating that entry's previous URL or headers.

## Required Rejection Cases

Source tests must confirm the accepted two-header payload and preserve rejection of these inputs:

- `X-ClawShell-Sandbox-Id` on a server other than `clawshell-gateway`.
- An unknown header or a differently capitalized header name.
- A missing `Authorization` header or a raw bearer secret.
- A sandbox scope without its proof, with an invalid ID, or with an ID longer than 128 characters.
- A scope proof with uppercase hexadecimal characters, an incorrect length, or a nonstring value.
- An HTTP URL or a noncanonical HTTPS URL.

Adding the fixed `clawshell-gateway` entry permits the reserved `GATEWAY_API_KEY` name only with a syntactically valid `X-ClawShell-Sandbox-Id` claim.
The helper rejects that reserved credential without the claim or for any other server name.
All other reserved credential names remain rejected when adding remote MCP entries, including `clawshell-gateway`.
Generic remote MCP entries retain the existing Bearer placeholder contract.
The default profile repair must not change the API profile tool policy or its independent integrity state.

## Candidate Image Publication

Source test results do not verify an installed image.
The [candidate image workflow run 37395756882](https://github.com/derekhsu/NemoClaw/actions/runs/37395756882) completed successfully for source commit `f87bf1a60b87915bc9893953d10276b23e3b71c1`.
Both native architecture jobs passed the installed uploader probe and installed default MCP scope probe before Docker Hub publication.
The scope probe verifies the installed helper bytes and accepted and rejected payloads without network access.
These results verify the candidate image contracts, not a running ClawShell sandbox.

The [initial workflow run 37341123254](https://github.com/derekhsu/NemoClaw/actions/runs/37341123254) failed because the system Python interpreter lacked the `yaml` module.
The workflow now runs the scope probe with `/opt/hermes/.venv/bin/python`, which provides the helper's runtime dependencies.
The successful run includes that interpreter correction.

Docker Hub contains `derekhsu/openshell-hermes:candidate-hermes-default-mcp-20261006-37395756882-1`.
The registry verification record identifies these immutable digests and the same source commit on both platforms:

| Manifest | Digest |
| --- | --- |
| Image index | `sha256:1423523e249a3c32bc59c93f442de0dc76ddaa8d55df0d19f9882ee798303b8a` |
| Linux amd64 | `sha256:1f4e1631d3bf64b1da427366812b1d1b529f7ccd4a8194e0153cbbb7b44d69ae` |
| Linux arm64 | `sha256:0039745c0c890f515669aad4613dfcbeff9557a8d832a526d17350ffd8d0b4bc` |

Use the image index digest for sandbox adoption.
The published tag is a candidate tag and does not use `latest`.
The September 30 image digests and October 03 source evidence predate this repair and cannot verify its behavior.

## Live Verification Gates

Candidate publication does not establish sandbox adoption or successful registration against the real HTTPS MCP endpoint.
Those live results remain pending.

Before adopting the candidate, complete these checks against that digest:

1. Confirm the installed helper bytes include the sandbox scope contract.
2. Create a validation sandbox through ClawShell with the canonical HTTPS MCP endpoint.
3. Confirm the default profile contains the managed server and both expected headers.
4. Confirm the helper acknowledges the guarded configuration transaction and gateway reload.
5. Confirm invalid headers and scope claims fail without configuration mutation.
6. Confirm the restricted API profile retains its tool policy and contains no new MCP server entry.
7. Confirm default MCP configuration and API profile isolation across the required restart and rebuild operations.

This handover records candidate image verification and publication, but no deployment or live sandbox result.
The implementing agent must record source test results and candidate image results separately.
Paid inference and live probes are outside this documentation task.

## Documentation Validation

`npm_config_offline=true npm run docs` passed for this handover on October 06, 2026.
The Starter Prompt, generated agent variants, and published-route checks passed.
Fern reported zero errors and two warnings.
`git diff --check` also passed.
This Markdown handover is not a Fern navigation page and introduces no new guide variant.
The independent documentation writer review remains required before final handoff.
