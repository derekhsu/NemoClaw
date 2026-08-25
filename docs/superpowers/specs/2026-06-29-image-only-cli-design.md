<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# NemoClaw Image-Only CLI Design

Date: 2026-06-29
Status: Draft for review
Owner: derekhsu/NemoClaw fork

## Implementation Status

This spec is implemented in two tiers. Both tiers are complete on
`feat/image-only-cli`.

### Tier 1: Contract Scaffold (implemented)

- CLI command surface (`nemoclaw image stage`, `nemoclaw image build`)
- Shared flags (`--agent`, `--json`, `--quiet`, `--tag`, `--push`, `--base-image`, `--output`)
- Agent image definition resolution (openclaw, hermes, missing-source errors)
- JSON metadata contract fields and shape
- Minimal image-only Dockerfile patcher (base image + build id pinning only)
- Build service with injectable Docker hooks
- GitHub Actions workflow entrypoint (`workflow_dispatch`)
- Test coverage for command parsing, agent resolution, patcher guarantees, and
  JSON contract shape

### Tier 2: Real Docker Integration (implemented)

- Stage service copies real build context files (Dockerfile, Dockerfile.base,
  `nemoclaw-blueprint/`, agent sources) into `contextPath` using
  `copyBuildContextDir` with symlink and exclusion handling
- Stage service writes `metadata.json` into `contextPath` so the staged
  directory is self-describing for downstream consumers
- `contentHash` is computed over the actual staged file contents, not over
  path strings, making it a meaningful cache key
- Build service `dockerBuild` hook spawns `docker build` via the shared adapter
  and parses the image digest from `dockerImageInspectFormat`
- Build service `dockerPush` hook spawns `docker push` when `--push` is set and
  prefers the registry-returned digest over the local build digest
- Base image resolution reuses `src/lib/sandbox-base-image.ts` when
  `--base-image` is not supplied
- `copyBuildContextDir` skips symlinks and uses `dereference: false` to avoid
  self-copy errors on repo-local symlinks (e.g. `.claude/skills`)

### Remaining work

- End-to-end smoke test with a real Docker daemon (requires Docker running
  locally; not covered by unit tests)
- GitHub Actions workflow has not been run against a real registry



## Summary

Add a new `nemoclaw image ...` CLI surface that builds and optionally pushes
agent-specific sandbox runtime images without running the rest of the
`onboard` lifecycle.

This flow exists for deployments where NemoClaw is the image source of truth
but another system, such as ClawShell, owns sandbox creation, runtime env,
inference configuration, and lifecycle management.

The design keeps NemoClaw's existing single-agent-per-sandbox model. The new
CLI surface is shared, but each invocation targets exactly one agent runtime
image such as OpenClaw or Hermes.

This spec is the upstream-style CLI direction. It is related to the fork-local
design in `docs/modification/2026-06-29-image-build-pipeline.md`, which
describes a shell-script-first path for producing the same class of artifact.
The staged build-context contract and JSON metadata contract defined here are
intended to be stable enough for that fork-local path to adopt.

## Problem

Today, NemoClaw's build logic is coupled to `onboard` and rebuild-style flows.
Those flows do more than image creation:

- prompt for credentials
- select provider/model
- configure inference
- create sandboxes through OpenShell
- persist lifecycle state for resume/rebuild

That is the wrong abstraction for ClawShell-managed deployments. The fork
needs a stable way to:

1. stage a minimal sandbox build context
2. build an agent runtime image locally for validation
3. build and push the same image from GitHub Actions
4. publish machine-readable image metadata for downstream consumers

without creating or mutating a sandbox.

## Goals

- Provide a first-class image-only CLI flow in NemoClaw.
- Keep local builds and GitHub Actions builds on the same build contract.
- Support at least `openclaw` and `hermes` as separate agent targets.
- Produce a generic sandbox runtime image that does not bake model/provider
  runtime choices into the artifact.
- Support configurable target registries including GHCR, Docker Hub, and custom
  registries.
- Output machine-readable metadata for downstream systems.

## Non-Goals

- Creating sandboxes through OpenShell.
- Managing ClawShell configuration or blueprints.
- Persisting onboarding sessions for image-only runs.
- Selecting providers, models, or credentials during image creation.
- Producing one multi-agent image that hosts OpenClaw and Hermes together.

## Existing Constraints

### Multi-agent repo, single-agent image

The repo supports multiple agents, but each agent has its own runtime shape and
image inputs.

- OpenClaw uses the root-level Docker build path.
- Hermes uses `agents/hermes/`.

The design must preserve the current one-agent-per-image model rather than
inventing a shared multi-agent runtime image.

### Existing build primitives already exist

The repo already contains reusable logic for:

- staging optimized build contexts
- resolving sandbox base images
- building Docker images
- resolving agent manifests and paths

The new feature should reuse those primitives where possible and avoid a
parallel shell-only implementation that would drift from the TypeScript source
of truth.

## User Model

Two primary usage modes are required.

### Local validation

A developer validates that a target agent image builds correctly from the fork:

```bash
nemoclaw image build --agent openclaw --tag local/openclaw:test
nemoclaw image build --agent hermes --tag local/hermes:test
```

### CI release

GitHub Actions stages the same build context, builds the image, optionally
pushes it to a configured registry, and emits metadata for downstream release
automation:

```bash
nemoclaw image build \
  --agent openclaw \
  --tag ghcr.io/example/openclaw-sandbox:main-abc1234 \
  --push \
  --json
```

## Proposed CLI Surface

Introduce a new top-level command group:

```text
nemoclaw image <subcommand>
```

Initial subcommands:

- `nemoclaw image stage`
- `nemoclaw image build`

The first release does not need a separate `image push` command. `build` can
take `--push`.

### Shared flags

- `--agent <name>`: target agent runtime; default may be `openclaw`
- `--json`: emit machine-readable output
- `--quiet`: suppress human-oriented logs when possible

### `image stage`

Example:

```bash
nemoclaw image stage --agent openclaw --output /tmp/openclaw-stage
```

Responsibilities:

- resolve the target agent
- locate the agent-specific Dockerfile and related inputs
- stage the minimal Docker build context into a directory
- write metadata describing the staged artifact

Suggested outputs:

- staged context directory
- `metadata.json` containing:
  - `agent`
  - `dockerfile`
  - `baseDockerfile`
  - `contextPath`
  - `sourceCommit`
  - `contentHash`

Suggested JSON example:

```json
{
  "agent": "openclaw",
  "dockerfile": "/repo/Dockerfile",
  "baseDockerfile": "/repo/Dockerfile.base",
  "contextPath": "/tmp/nemoclaw-image-stage/openclaw-94dc7e6/context",
  "sourceCommit": "94dc7e6b3d7c2d5f0d7e2a3b4c5d6e7f8a9b0c1d",
  "contentHash": "sha256:2c10f7d8f6e1f8b0469f502b8f32f73e64a3b8608124886b8b881f2f62f3d8ef"
}
```

### `image build`

Example:

```bash
nemoclaw image build \
  --agent hermes \
  --tag ghcr.io/example/hermes-sandbox:main-abc1234 \
  --push \
  --json
```

Responsibilities:

- call the stage pipeline or consume an existing staged context
- resolve or pin the base image reference for the agent
- apply minimal image patching needed for a generic runtime artifact
- run `docker build`
- optionally run `docker push`
- emit final image metadata

Suggested outputs:

- `agent`
- `tag`
- `imageRef`
- `digest` when available
- `sourceCommit`
- `stagedContextHash`

Suggested JSON example:

```json
{
  "agent": "openclaw",
  "tag": "ghcr.io/example/openclaw-runtime:main-94dc7e6",
  "imageRef": "ghcr.io/example/openclaw-runtime@sha256:0d9d02b0f3d8f8fd4f12f1c2c4a0af1f8d2c9987654f2cb4f06f8f7e9f1d3b41",
  "digest": "sha256:0d9d02b0f3d8f8fd4f12f1c2c4a0af1f8d2c9987654f2cb4f06f8f7e9f1d3b41",
  "sourceCommit": "94dc7e6b3d7c2d5f0d7e2a3b4c5d6e7f8a9b0c1d",
  "stagedContextHash": "sha256:2c10f7d8f6e1f8b0469f502b8f32f73e64a3b8608124886b8b881f2f62f3d8ef"
}
```

## Behavioral Boundaries

The image-only flow should include only the parts of `onboard` that directly
serve image creation.

### Included

- agent resolution
- staged build context creation
- base image resolution and pinning
- minimal Dockerfile patching for image metadata
- local Docker build
- optional registry push

### Explicitly excluded

- provider/model/inference selection
- credential prompts or credential bridges
- OpenShell sandbox creation
- gateway startup or provider registration
- onboarding session persistence
- rebuild/resume lifecycle behavior

This creates a clean boundary:

```text
stage -> build -> optional push
```

Everything after that remains the responsibility of ClawShell or other runtime
orchestration layers.

## Agent-Specific Behavior

The CLI surface is shared, but image inputs stay agent-specific.

### OpenClaw

- Dockerfile source: repo root `Dockerfile`
- Base Dockerfile source: repo root `Dockerfile.base`
- Existing optimized build-context logic is the starting point

### Hermes

- Dockerfile source: `agents/hermes/Dockerfile`
- Base Dockerfile source: `agents/hermes/Dockerfile.base`
- Stage/build logic must respect Hermes-specific files and config generation

If a checkout does not carry the required sources for the selected agent, the
command must fail explicitly. For example, a fork that omits `agents/hermes/`
must return a clear Hermes-source-missing error rather than silently falling
back to OpenClaw behavior.

The command must reject attempts to produce a combined runtime image for more
than one agent in a single invocation.

## Build Context Contract

The staged build context is the stable contract shared by local execution and
GitHub Actions.

That means:

- local developers should be able to inspect and build from it
- GitHub Actions should build from the same staged inputs
- the context should be minimal and deterministic

Preferred implementation:

- keep TypeScript staging logic as the source of truth
- expose it through the new CLI
- avoid maintaining a separate handwritten shell copy list unless required for
  bootstrapping

If a temporary shell wrapper exists, it should delegate to the TypeScript path
instead of duplicating file selection rules.

## Base Image Policy

The image CLI should support both a deterministic default path and an explicit
override.

### Default behavior

When the caller does not pass an override, the CLI resolves the selected agent's base image.
OpenClaw uses `ghcr.io/nvidia/nemoclaw/sandbox-base` and the root `Dockerfile.base`.
Hermes prefers the reviewed immutable digest from `agents/hermes/Dockerfile` and uses `agents/hermes/Dockerfile.base` for a permitted local fallback.
The Hermes resolver verifies the required Model Context Protocol runtime before it accepts a candidate.

The default path:

- respects the Dockerfile family for the selected agent
- rejects a missing or invalid Hermes pin before the final image build
- avoids prompting
- emits the chosen base image reference in JSON mode

The image-only flow must remain non-interactive by default.

### Explicit override

The CLI should accept:

```text
--base-image <ref>
```

When present, this flag bypasses the default resolution chain and pins the
selected Dockerfile family to the provided ref, subject to normal validation.

## Minimal Dockerfile Patching

The new image flow should not reuse the full onboarding patch behavior.

Current onboarding-oriented patching can bake runtime selections such as model
or provider into the image. That is incorrect for this use case because
ClawShell owns runtime inference decisions.

The image-only path should allow only minimal patching such as:

- base image ref pinning
- build ID when it is intentionally part of artifact metadata
- other artifact-level metadata that is independent of runtime provider/model

The implementation should therefore split "generic image patching" from the
current onboarding-specific patch behavior instead of calling the existing patch
entry point unchanged.

The build ID policy must be explicit: if the implementation writes a build ID
into the Dockerfile or image config, it must be reproducible under CI inputs
such as commit SHA or an explicit caller-provided value. It must not default to
wall-clock timestamps.

## Registry Contract

The feature must support configurable registries rather than hard-coding GHCR.

Supported targets:

- GHCR
- Docker Hub
- custom registry host

The build command should accept a fully qualified target tag. Registry-specific
credential handling belongs to the caller environment, especially GitHub
Actions.

Examples:

```bash
nemoclaw image build --agent openclaw --tag ghcr.io/org/openclaw-sandbox:main-abc1234 --push
nemoclaw image build --agent openclaw --tag docker.io/org/openclaw-sandbox:main-abc1234 --push
nemoclaw image build --agent openclaw --tag registry.example.com/openclaw-sandbox:main-abc1234 --push
```

## GitHub Actions Design

GitHub Actions should call the new CLI rather than reimplementing the pipeline.

### Workflow inputs

Suggested inputs:

- `agent`
- `registry_type`
- `registry_host`
- `repository`
- `tag`
- `push`

`registry_type` can guide login behavior, but the CLI itself should primarily
care about the final image tag/ref.

### Workflow flow

1. check out the repo
2. authenticate to the target registry
3. run `nemoclaw image build --agent ... --tag ... [--push] --json`
4. store CLI JSON output as an artifact and expose key values as workflow
   outputs

### Workflow outputs

- `imageRef`
- `digest`
- `agent`
- `commitSha`

This keeps local and CI execution aligned on a single contract.

## Known Fork Consumers

The fork-local document `docs/modification/2026-06-29-image-build-pipeline.md`
describes a shell-script-first consumer of the same image pipeline. This spec's
staged build-context contract and JSON output should be treated as stable
interfaces so that fork-local wrappers can consume them without re-encoding
NemoClaw's file-selection logic.

## Internal Refactoring Plan

The feature should not be implemented by copying `onboard` into a new command
and removing lines until it works.

Instead, refactor toward three layers:

1. `agent image definition`
   - resolve Dockerfile paths and agent-specific build inputs
2. `image stage service`
   - stage deterministic build context for one agent
3. `image build service`
   - resolve base image, perform minimal patching, build, and optionally push

`onboard` may continue using lower-level shared primitives, but the new image
commands should not depend on onboarding state-machine behavior.

## Error Handling

Expected error cases:

- unknown agent
- missing Dockerfile or manifest inputs for the selected agent
- base image resolution failure
- Docker daemon unavailable
- registry push authentication failure
- attempt to use onboarding-only flags with `image` commands

Errors should be:

- concise in human mode
- structured in JSON mode
- explicit about whether the failure happened during stage, build, or push

## Testing Strategy

Minimum test coverage for the first implementation:

- command parsing for `image stage` and `image build`
- agent resolution for `openclaw` and `hermes`
- staged context content tests
- minimal patching tests that prove model/provider are not baked into the image
- build command unit tests with Docker adapter mocking
- JSON output contract tests

If GitHub Actions workflow changes land in the same implementation cycle, add a
targeted workflow or script-level test that validates the expected CLI outputs
used by CI.

Concrete assertion strategies for "model/provider not baked into the image"
must include at least one artifact-level check and one runtime-visible check:

- inspect the built image config or Docker history to verify that onboarding
  runtime selections such as provider/model-specific values were not injected
  by the image-only patch layer
- run `docker run --rm <image> env` or an equivalent inspection step and assert
  that image-only builds do not expose runtime-selection env vars that belong
  to ClawShell-managed configuration

## Rollout Plan

The rollout is split into tiers that map to the Implementation Status section
above.

### Tier 1: Contract Scaffold (done)

- implement `image stage` and `image build` command surface
- define JSON metadata contract fields and shape
- define service layer boundaries (agent definition, stage, build, patch)
- add GitHub Actions workflow entrypoint that calls the CLI
- add test coverage for command parsing, agent resolution, patcher guarantees,
  and JSON contract shape

### Tier 2: Real Docker Integration (done)

- stage service copies real build context files into `contextPath`
- `contentHash` is computed over staged file contents
- build service spawns `docker build` and parses image ref and digest
- build service spawns `docker push` when `--push` is set
- base image resolution reuses `src/lib/sandbox-base-image.ts`
- stage service writes `metadata.json` into the staged directory
- tests cover staged context content and real Docker output parsing

### Tier 3: Fork Shell Script Migration (optional, not started)

- optionally migrate existing fork-specific shell scripts to become thin
  wrappers around the new CLI

The original Phase 1 / Phase 2 / Phase 3 split in earlier drafts conflated the
contract scaffold with real Docker integration. The tier split makes the
boundary explicit: Tier 1 is reviewable and mergeable on its own, Tier 2 is the
work that makes the CLI actually produce images.

## Open Decisions Resolved By This Spec

- The flow is image-only, not sandbox-creating.
- The artifact is a generic sandbox runtime image.
- Runtime provider/model choices remain outside the image and belong to
  ClawShell.
- The repo supports multiple agents, but each image build targets exactly one
  agent.
- Local and GitHub builds share the staged build context contract.
- The preferred implementation path is to adjust NemoClaw's CLI rather than
  relying on an external shell script as the primary interface.
