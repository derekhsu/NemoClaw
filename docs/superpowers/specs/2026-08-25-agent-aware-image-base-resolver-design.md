<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Agent-Aware Image Base Resolver Design

Date: 2026-08-25
Status: Approved for implementation
Owner: derekhsu/NemoClaw fork

## Scope

This design fixes default base image resolution for the fork-specific `nemoclaw image build` command.
It does not change upstream NemoClaw managed-image publication or OpenShell behavior.
It does not add another agent target.

## Problem

`nemoclaw image build --agent hermes` currently uses `OPENCLAW_SANDBOX_BASE_IMAGE` when the caller omits `--base-image`.
The resolver can therefore pass the OpenClaw base image to the Hermes Dockerfile.
The command also passes the final Dockerfile path to the base image resolver.
A local fallback can therefore build the final runtime Dockerfile instead of the selected agent's base Dockerfile.

The selected agent must control both the base image repository and the base Dockerfile.

## Existing Authority

`agents/hermes/Dockerfile` declares one immutable NVIDIA NemoClaw Hermes base image digest.
The repository publishes that image under `ghcr.io/nvidia/nemoclaw/hermes-sandbox-base`.
OpenShell runs the resulting sandbox image but does not publish this base image.

The Hermes onboarding resolver already applies these controls:

- It requires one immutable official Hermes base digest in the final Dockerfile.
- It prefers that reviewed digest over mutable tags.
- It verifies the Hermes Model Context Protocol runtime.
- It uses `agents/hermes/Dockerfile.base` for a permitted local fallback.

The image-only resolver must reuse these controls instead of defining a weaker Hermes policy.

## Required Behavior

The resolver must apply this precedence:

1. Use `--base-image` when the caller supplies it.
2. Use the existing OpenClaw resolution policy for `--agent openclaw`.
3. Use the reviewed Hermes digest for `--agent hermes`.

An explicit `--base-image` remains an operator override.
The default path must not replace or reinterpret that value.

### OpenClaw

The OpenClaw path must keep `ghcr.io/nvidia/nemoclaw/sandbox-base` as its base image repository.
The resolver must use the root `Dockerfile.base` for local base image builds.
The change must not alter OpenClaw tag precedence or JSON output fields.

### Hermes

The Hermes path must use `ghcr.io/nvidia/nemoclaw/hermes-sandbox-base` as its base image repository.
The resolver must read the reviewed immutable digest from `agents/hermes/Dockerfile`.
The resolver must prefer that digest before mutable version, source revision, or `latest` tags.
The resolver must verify the Hermes Model Context Protocol runtime before accepting a remote or local candidate.
The resolver must use `agents/hermes/Dockerfile.base` for a permitted local fallback.

The command must reject the default Hermes build before `docker build` when the final Dockerfile has any of these states:

- No `ARG BASE_IMAGE` declaration.
- More than one `ARG BASE_IMAGE` declaration.
- A mutable base image tag.
- A repository other than `ghcr.io/nvidia/nemoclaw/hermes-sandbox-base`.
- A malformed SHA-256 digest.

The command must also reject the build when the resolver cannot return a compatible Hermes base image.
It must not continue with an unreported implicit Dockerfile default.

## Component Changes

### Agent Image Definition

`src/lib/image/agent-image-definition.ts` remains the source for image-only agent paths.
Its resolved definition must expose the selected final Dockerfile, base Dockerfile, and base image repository.

The implementation must not add a general plugin registry for two supported image targets.
An explicit OpenClaw and Hermes branch is sufficient.

### Hermes Pin Validation

The implementation must reuse one Hermes pin validation function across onboarding and image-only builds.
It must not copy the official repository regular expression into a second resolver.
The shared function must accept the final Dockerfile path and return the exact reviewed digest or throw a specific validation error.

### Image Build Service

`src/lib/image/build.ts` must pass both Dockerfile paths to default resolution:

- The final Dockerfile supplies the Hermes reviewed pin.
- The base Dockerfile supplies the local base image build source.

The default resolver must choose the policy from `agent`.
It must pass `repoRoot` to the shared resolver so tests and fork worktrees do not depend on a process-global repository path.

The JSON result must report the exact resolved `baseImage` reference.

## Failure Behavior

The command must stop before the final image build when default resolution fails.
The error must name the selected agent and the failed base image requirement.
The error must not suggest an OpenClaw base image for Hermes.

An explicit `--base-image` bypasses default resolution.
Docker reports pull, compatibility, or build failures for that operator-selected value.

## Test Design

Unit tests must prove these contracts:

1. A default OpenClaw build resolves `ghcr.io/nvidia/nemoclaw/sandbox-base`.
2. A default OpenClaw build uses the root `Dockerfile.base` for local fallback input.
3. A default Hermes build resolves the immutable digest from `agents/hermes/Dockerfile`.
4. A default Hermes build never uses `ghcr.io/nvidia/nemoclaw/sandbox-base`.
5. A default Hermes build uses `agents/hermes/Dockerfile.base` for local fallback input.
6. A default Hermes build enables the Hermes runtime compatibility probe.
7. An explicit `--base-image` bypasses default resolution for both agents.
8. Missing, duplicate, mutable, malformed, and foreign Hermes pins fail before final image build.
9. A null Hermes resolution fails before final image build.
10. The result reports the exact selected base image reference.

A focused real-Docker test must run when a Docker daemon is available:

```bash
nemoclaw image build \
  --agent hermes \
  --tag local/hermes-resolver-test \
  --json
```

The test passes when the metadata reports the reviewed Hermes base digest and the built image contains `/usr/local/bin/hermes`.

## Non-Goals

This change does not:

- Publish a Hermes runtime image.
- Create a multi-architecture manifest.
- Change registry authentication.
- Add a Hermes release tag.
- Replace upstream managed-image contracts.
- Change explicit `--base-image` semantics.
- Generalize image-only builds beyond OpenClaw and Hermes.

## Documentation Impact

The image-only CLI examples must state that the default Hermes build uses the reviewed NVIDIA NemoClaw base digest.
The documentation must continue to identify image-only as fork-specific behavior.
No public upstream NemoClaw support claim is part of this change.
