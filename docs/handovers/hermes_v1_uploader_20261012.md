<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Hermes API Uploader Integration

This handover records the issue #109 API uploader contract for ClawShell integration.
Image build, image publication, and live API acceptance remain separate verification gates.
Source tests do not establish that an existing sandbox supports the contract.

## Profile Contract

ClawShell manages uploader registration with `register-api-uploader` and inspection with `inspect-api-uploader` through the root-only config guard.
The transaction targets the fixed API profile and uses the image-owned uploader executable.
The guard validates the signed sandbox scope syntax, compare-and-swap configuration state, and transaction journal before accepting a managed update.
Gateway verifies the sandbox scope proof.
The API registration uses the literal nonsecret `openshell:resolve:env:GATEWAY_API_KEY` credential placeholder.
The supervisor removes inherited key environment values before it launches the uploader.
Registration inspection checks the persisted configuration against the same fixed contract.

The API profile enables `file` and `mcp-sandbox-file-uploader` for API-server sessions.
An unrelated MCP entry or toolset must not expand the API session's tool policy.
New ClawShell provisioning does not register the local uploader in the default profile.
Existing default-profile registrations remain intact; this change does not remove them during an upgrade.

## Delivery Boundary

The uploader accepts only regular generated files owned by the API user inside the API profile home.
The source must have a single hard link and be at most 50 MiB.
It rejects dotfiles, reserved directories, symbolic links, hard-linked files, cross-profile sources, and secret paths.
For an accepted source, it copies the file to `deliveries/<32-lowerhex>/<original-name>` inside the API profile home.
The delivery copy has mode `0644`, and its directories have mode `0755`.
The trusted sandbox administrator can read these copies.
A delivery filename does not authorize access to the source profile's configuration or credentials.

ClawShell hides the entire `.hermes-api` tree from ordinary file-management requests.
For Hermes signed downloads, ClawShell permits only the staged delivery subtree.
Gateway checks API-user ownership, a single hard link, and the size limit through a descriptor chain that refuses symbolic links.
Gateway transfers a private sandbox-user-owned `/tmp/hermes-delivery-*` snapshot and attempts to remove it afterward.
Snapshot cleanup is best effort; a failed removal can leave the private snapshot in the sandbox.
Delivery copies remain until operator cleanup; signed-token expiry does not remove them.
The uploader package version is `sandbox-mcp-server` `0.1.1`, with existing dependency pins retained.
The existing signed-link scope, expiration, and download-count controls still apply.

## Upgrade And Acceptance

Build a candidate image from the API uploader source changes before attempting acceptance.
Record the source commit, immutable image digest, architecture, and installed contract probe results.
Use a separate candidate sandbox; do not copy API credentials or guarded profile state from an older sandbox.

Acceptance requires these observations:

- API-server sessions discover `file` and `mcp-sandbox-file-uploader`.
- A v1 JSON request generates a file, invokes `upload_file`, and returns a Gateway download link.
- A v1 SSE request returns a generated file through the same delivery contract.
- Downloaded bytes match the generated source.
- Link expiration, use limits, and cross-sandbox denial remain enforced.
- Reserved files, secret paths, symlinks, and cross-profile files remain denied.
- Default chat, provider reapply, lifecycle operations, and remote MCP behavior retain their existing contracts.

A `sandbox:` path alone does not pass delivery acceptance.
An older image's successful default-profile uploader test does not pass API-profile acceptance.
Keep candidate data and diagnostic evidence until the deployment owner records the acceptance result.

## Local acceptance receipt — 2026-10-12

Local ARM64 acceptance passed using image `sha256:25388caa3c92aced419208ca8b04918c575308fbdf267a1796bcd9fe01de27f9` and guard source `9d2dc9b`. V1 JSON/SSE requests through a FastAPI HTTP contract harness used real OpenShell relay and Hermes inference. Uploader publication and signed downloads used an isolated real HTTP server on port8002. Exact content, Chinese filename, profile/sandbox scope denials, expiration/use count, default chat and delivery after Reapply passed. Temporary API keys were revoked. The temporary HTTP service and validation sandbox container were stopped after validation. This receipt does not establish registry publication, multi-architecture support, production backend deployment or browser UI acceptance.
