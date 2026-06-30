<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Image-Only CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Implementation Status

This plan is split into two tiers. Both tiers are complete on
`feat/image-only-cli`.

- **Tier 1 (Tasks 1-7): Contract scaffold.** DONE. Implements the CLI command
  surface, JSON metadata contract, service layer boundaries, minimal patcher,
  and GitHub Actions entrypoint.
- **Tier 2 (Tasks 8-12): Real Docker integration.** DONE. Wires the stage
  service to copy real build context, the build service to spawn
  `docker build` / `docker push`, base image resolution to reuse
  `src/lib/sandbox-base-image.ts`, and `contentHash` to hash actual file
  contents.

See `docs/superpowers/specs/2026-06-29-image-only-cli-design.md` Implementation
Status section for the full tier boundary.

**Goal:** Add `nemoclaw image stage` and `nemoclaw image build` commands that produce agent-specific runtime-image artifacts without running onboarding or sandbox lifecycle logic.

**Architecture:** Introduce a small image pipeline beside `onboard`, not inside it. The pipeline has three layers: resolve one agent's image inputs, stage a deterministic build context, then build and optionally push an agent runtime image while emitting stable JSON metadata. Reuse existing Docker/build-context primitives, but split minimal image patching from onboarding-specific Dockerfile patch behavior.

**Tech Stack:** TypeScript, oclif, Vitest, existing NemoClaw Docker/build-context helpers, GitHub Actions YAML

---

## Tier 1: Contract Scaffold (Tasks 1-7, DONE)

Tasks 1-7 below are complete on `feat/image-only-cli`. They are preserved here
for reference and to document what was reviewed and merged. Do not re-run these
tasks unless reverting and re-implementing.



## File Structure

**Create**

- `src/commands/image/stage.ts` — oclif command for staged build-context output
- `src/commands/image/build.ts` — oclif command for local build and optional push
- `src/commands/image/stage.test.ts` — command parsing and dispatch tests for `image stage`
- `src/commands/image/build.test.ts` — command parsing and dispatch tests for `image build`
- `src/lib/image/command-support.ts` — shared flag builders, JSON mode flags, help examples
- `src/lib/image/command-support.test.ts` — flag/help contract tests
- `src/lib/image/agent-image-definition.ts` — map agent name to Dockerfile family and required source inputs
- `src/lib/image/agent-image-definition.test.ts` — openclaw/hermes resolution and missing-source tests
- `src/lib/image/stage.ts` — deterministic staged build-context service
- `src/lib/image/stage.test.ts` — staged metadata and file-selection tests
- `src/lib/image/build.ts` — build/push orchestration and JSON output
- `src/lib/image/build.test.ts` — build flow, base-image policy, JSON output tests
- `src/lib/image/dockerfile-patch.ts` — minimal image-only Dockerfile patcher
- `src/lib/image/dockerfile-patch.test.ts` — guarantees model/provider are not baked
- `src/lib/actions/image/stage.ts` — thin action wrapper for the stage command
- `src/lib/actions/image/build.ts` — thin action wrapper for the build command
- `.github/workflows/image-build.yaml` — manual GitHub Actions entrypoint for image build/push

**Modify**

- `src/lib/actions/global.ts` — export image action entrypoints if shared command patterns benefit from it
- `src/lib/build-context.ts` — expose or factor reusable helpers needed by the new stage service
- `src/lib/sandbox-base-image.ts` — reuse existing base-image resolution entrypoints without onboarding coupling
- `src/lib/onboard/dockerfile-patch.ts` — only if extracting shared low-level helpers is cleaner than duplicating sanitization logic
- `docs/superpowers/specs/2026-06-29-image-only-cli-design.md` — only if implementation clarifies a spec detail discovered during Task 1 or 2

**Test**

- `src/commands/image/stage.test.ts`
- `src/commands/image/build.test.ts`
- `src/lib/image/command-support.test.ts`
- `src/lib/image/agent-image-definition.test.ts`
- `src/lib/image/stage.test.ts`
- `src/lib/image/build.test.ts`
- `src/lib/image/dockerfile-patch.test.ts`

## Task 1: Command Surface and Flag Contract

**Files:**
- Create: `src/lib/image/command-support.ts`
- Create: `src/lib/image/command-support.test.ts`
- Create: `src/commands/image/stage.ts`
- Create: `src/commands/image/build.ts`
- Create: `src/commands/image/stage.test.ts`
- Create: `src/commands/image/build.test.ts`

- [ ] **Step 1: Write the failing flag/help tests for the shared image command support**

```ts
// src/lib/image/command-support.test.ts
import { describe, expect, it } from "vitest";

import { buildImageStageFlags, buildImageBuildFlags, imageBuildExamples } from "./command-support";

describe("image command support", () => {
  it("defines the shared image flags", () => {
    const stageFlags = buildImageStageFlags();
    const buildFlags = buildImageBuildFlags();

    expect(stageFlags.agent).toBeDefined();
    expect(stageFlags.output).toBeDefined();
    expect(stageFlags.json).toBeDefined();

    expect(buildFlags.agent).toBeDefined();
    expect(buildFlags.tag).toBeDefined();
    expect(buildFlags.push).toBeDefined();
    expect(buildFlags["base-image"]).toBeDefined();
  });

  it("documents an explicit base-image override in examples", () => {
    expect(imageBuildExamples.join("\n")).toContain("--base-image");
    expect(imageBuildExamples.join("\n")).toContain("--push");
  });
});
```

- [ ] **Step 2: Run the shared flag/help test to verify it fails**

Run: `rtk npx vitest run src/lib/image/command-support.test.ts`

Expected: FAIL with module-not-found errors for `src/lib/image/command-support.ts`.

- [ ] **Step 3: Write the shared image command-support module**

```ts
// src/lib/image/command-support.ts
import { Flags } from "@oclif/core";

import { describeAgentFlag } from "../onboard/agent-flag-help";

export const imageStageExamples = [
  "<%= config.bin %> image stage --agent openclaw --output /tmp/openclaw-stage",
];

export const imageBuildExamples = [
  "<%= config.bin %> image build --agent openclaw --tag ghcr.io/example/openclaw-runtime:main-<sha>",
  "<%= config.bin %> image build --agent hermes --tag ghcr.io/example/hermes-runtime:main-<sha> --push",
  "<%= config.bin %> image build --agent openclaw --tag registry.example.com/openclaw-runtime:test --base-image ghcr.io/example/base@sha256:<digest>",
];

export function buildImageStageFlags(): Record<string, unknown> {
  return {
    agent: Flags.string({ description: describeAgentFlag(["openclaw", "hermes"]) }),
    output: Flags.string({ description: "Directory to write the staged build context into" }),
    json: Flags.boolean({ description: "Emit machine-readable JSON metadata" }),
    quiet: Flags.boolean({ description: "Suppress human-oriented progress logs" }),
  };
}

export function buildImageBuildFlags(): Record<string, unknown> {
  return {
    agent: Flags.string({ description: describeAgentFlag(["openclaw", "hermes"]) }),
    tag: Flags.string({ description: "Fully qualified target image tag", required: true }),
    push: Flags.boolean({ description: "Push the built image after a successful local build" }),
    "base-image": Flags.string({ description: "Explicit base image reference override" }),
    json: Flags.boolean({ description: "Emit machine-readable JSON metadata" }),
    quiet: Flags.boolean({ description: "Suppress human-oriented progress logs" }),
  };
}
```

- [ ] **Step 4: Run the shared flag/help test to verify it passes**

Run: `rtk npx vitest run src/lib/image/command-support.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing command dispatch tests**

```ts
// src/commands/image/stage.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runImageStageAction } from "../../lib/actions/image/stage";
import ImageStageCommand from "./stage";

vi.mock("../../lib/actions/image/stage", () => ({
  runImageStageAction: vi.fn().mockResolvedValue(undefined),
}));

describe("image stage oclif command", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards typed flags to the image stage action", async () => {
    await ImageStageCommand.run(["--agent", "openclaw", "--output", "/tmp/out", "--json"], process.cwd());

    expect(runImageStageAction).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "openclaw", output: "/tmp/out", json: true }),
    );
  });
});
```

```ts
// src/commands/image/build.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import { runImageBuildAction } from "../../lib/actions/image/build";
import ImageBuildCommand from "./build";

vi.mock("../../lib/actions/image/build", () => ({
  runImageBuildAction: vi.fn().mockResolvedValue(undefined),
}));

describe("image build oclif command", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards tag, push, and base-image flags", async () => {
    await ImageBuildCommand.run(
      [
        "--agent",
        "hermes",
        "--tag",
        "ghcr.io/example/hermes-runtime:test",
        "--push",
        "--base-image",
        "ghcr.io/example/hermes-base@sha256:abc",
        "--json",
      ],
      process.cwd(),
    );

    expect(runImageBuildAction).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "hermes",
        tag: "ghcr.io/example/hermes-runtime:test",
        push: true,
        "base-image": "ghcr.io/example/hermes-base@sha256:abc",
        json: true,
      }),
    );
  });
});
```

- [ ] **Step 6: Run the command dispatch tests to verify they fail**

Run: `rtk npx vitest run src/commands/image/stage.test.ts src/commands/image/build.test.ts`

Expected: FAIL with module-not-found errors for the new commands and action wrappers.

- [ ] **Step 7: Write the minimal command classes and action wrappers**

```ts
// src/commands/image/stage.ts
import { NemoClawCommand } from "../../lib/cli/nemoclaw-oclif-command";
import { runImageStageAction } from "../../lib/actions/image/stage";
import { buildImageStageFlags, imageStageExamples } from "../../lib/image/command-support";

export default class ImageStageCommand extends NemoClawCommand {
  static id = "image:stage";
  static strict = true;
  static summary = "Stage a deterministic agent runtime image build context";
  static examples = imageStageExamples;
  static flags = buildImageStageFlags();

  public async run(): Promise<void> {
    const { flags } = await this.parse(ImageStageCommand);
    await runImageStageAction(flags);
  }
}
```

```ts
// src/commands/image/build.ts
import { NemoClawCommand } from "../../lib/cli/nemoclaw-oclif-command";
import { runImageBuildAction } from "../../lib/actions/image/build";
import { buildImageBuildFlags, imageBuildExamples } from "../../lib/image/command-support";

export default class ImageBuildCommand extends NemoClawCommand {
  static id = "image:build";
  static strict = true;
  static summary = "Build and optionally push an agent runtime image";
  static examples = imageBuildExamples;
  static flags = buildImageBuildFlags();

  public async run(): Promise<void> {
    const { flags } = await this.parse(ImageBuildCommand);
    await runImageBuildAction(flags);
  }
}
```

```ts
// src/lib/actions/image/stage.ts
export async function runImageStageAction(flags: Record<string, unknown>): Promise<void> {
  const { runImageStage } = await import("../../image/stage");
  await runImageStage(flags);
}
```

```ts
// src/lib/actions/image/build.ts
export async function runImageBuildAction(flags: Record<string, unknown>): Promise<void> {
  const { runImageBuild } = await import("../../image/build");
  await runImageBuild(flags);
}
```

- [ ] **Step 8: Run the command tests to verify they pass**

Run: `rtk npx vitest run src/commands/image/stage.test.ts src/commands/image/build.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
rtk git add src/lib/image/command-support.ts src/lib/image/command-support.test.ts src/commands/image/stage.ts src/commands/image/build.ts src/commands/image/stage.test.ts src/commands/image/build.test.ts src/lib/actions/image/stage.ts src/lib/actions/image/build.ts
rtk git commit -m "feat(image): add image command surface"
```

## Task 2: Agent Image Definition and Missing-Source Validation

**Files:**
- Create: `src/lib/image/agent-image-definition.ts`
- Create: `src/lib/image/agent-image-definition.test.ts`

- [ ] **Step 1: Write the failing agent-definition tests**

```ts
// src/lib/image/agent-image-definition.test.ts
import { describe, expect, it } from "vitest";

import {
  MissingAgentImageSourcesError,
  resolveAgentImageDefinition,
} from "./agent-image-definition";

describe("resolveAgentImageDefinition", () => {
  it("maps openclaw to the root Dockerfile family", () => {
    const def = resolveAgentImageDefinition("openclaw", "/repo");
    expect(def.dockerfilePath).toBe("/repo/Dockerfile");
    expect(def.baseDockerfilePath).toBe("/repo/Dockerfile.base");
  });

  it("maps hermes to the hermes Dockerfile family", () => {
    const def = resolveAgentImageDefinition("hermes", "/repo");
    expect(def.dockerfilePath).toBe("/repo/agents/hermes/Dockerfile");
    expect(def.baseDockerfilePath).toBe("/repo/agents/hermes/Dockerfile.base");
  });

  it("throws a clear error when the selected agent sources are missing", () => {
    expect(() => resolveAgentImageDefinition("hermes", "/repo-without-hermes")).toThrow(
      MissingAgentImageSourcesError,
    );
  });
});
```

- [ ] **Step 2: Run the agent-definition tests to verify they fail**

Run: `rtk npx vitest run src/lib/image/agent-image-definition.test.ts`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Write the minimal agent-definition module**

```ts
// src/lib/image/agent-image-definition.ts
import fs from "node:fs";
import path from "node:path";

export class MissingAgentImageSourcesError extends Error {}

export type AgentImageDefinition = {
  agent: string;
  dockerfilePath: string;
  baseDockerfilePath: string;
  contextRoot: string;
};

export function resolveAgentImageDefinition(agent: string, repoRoot: string): AgentImageDefinition {
  if (agent === "openclaw") {
    return {
      agent,
      dockerfilePath: path.join(repoRoot, "Dockerfile"),
      baseDockerfilePath: path.join(repoRoot, "Dockerfile.base"),
      contextRoot: repoRoot,
    };
  }
  if (agent === "hermes") {
    const dockerfilePath = path.join(repoRoot, "agents", "hermes", "Dockerfile");
    const baseDockerfilePath = path.join(repoRoot, "agents", "hermes", "Dockerfile.base");
    if (!fs.existsSync(dockerfilePath) || !fs.existsSync(baseDockerfilePath)) {
      throw new MissingAgentImageSourcesError(
        "Hermes agent sources are missing from this checkout; cannot build a Hermes runtime image.",
      );
    }
    return { agent, dockerfilePath, baseDockerfilePath, contextRoot: repoRoot };
  }
  throw new Error(`Unknown agent '${agent}'. Expected one of: openclaw, hermes`);
}
```

- [ ] **Step 4: Run the agent-definition tests to verify they pass**

Run: `rtk npx vitest run src/lib/image/agent-image-definition.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/image/agent-image-definition.ts src/lib/image/agent-image-definition.test.ts
rtk git commit -m "feat(image): define agent image inputs"
```

## Task 3: Deterministic Stage Service and JSON Contract

**Files:**
- Create: `src/lib/image/stage.ts`
- Create: `src/lib/image/stage.test.ts`
- Modify: `src/lib/build-context.ts`

- [ ] **Step 1: Write the failing stage-service tests**

```ts
// src/lib/image/stage.test.ts
import { describe, expect, it } from "vitest";

import { stageImageBuildContext } from "./stage";

describe("stageImageBuildContext", () => {
  it("returns stable JSON metadata for openclaw", async () => {
    const result = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot: "/repo",
      outputDir: "/tmp/nemoclaw-image-stage/openclaw-94dc7e6",
      sourceCommit: "94dc7e6",
    });

    expect(result).toMatchObject({
      agent: "openclaw",
      dockerfile: "/repo/Dockerfile",
      baseDockerfile: "/repo/Dockerfile.base",
      contextPath: "/tmp/nemoclaw-image-stage/openclaw-94dc7e6/context",
      sourceCommit: "94dc7e6",
    });
    expect(result.contentHash).toMatch(/^sha256:/);
  });
});
```

- [ ] **Step 2: Run the stage-service test to verify it fails**

Run: `rtk npx vitest run src/lib/image/stage.test.ts`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement the stage service on top of existing build-context helpers**

```ts
// src/lib/image/stage.ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { resolveAgentImageDefinition } from "./agent-image-definition";

export type StageImageBuildContextResult = {
  agent: string;
  dockerfile: string;
  baseDockerfile: string;
  contextPath: string;
  sourceCommit: string;
  contentHash: string;
};

export async function stageImageBuildContext(options: {
  agent: string;
  repoRoot: string;
  outputDir: string;
  sourceCommit: string;
}): Promise<StageImageBuildContextResult> {
  const def = resolveAgentImageDefinition(options.agent, options.repoRoot);
  const contextPath = path.join(options.outputDir, "context");
  fs.mkdirSync(contextPath, { recursive: true });
  const contentHash = `sha256:${crypto
    .createHash("sha256")
    .update([def.agent, def.dockerfilePath, def.baseDockerfilePath, options.sourceCommit].join("\n"))
    .digest("hex")}`;

  return {
    agent: def.agent,
    dockerfile: def.dockerfilePath,
    baseDockerfile: def.baseDockerfilePath,
    contextPath,
    sourceCommit: options.sourceCommit,
    contentHash,
  };
}
```

- [ ] **Step 4: Add a regression test that staged metadata matches the spec JSON contract**

```ts
it("serializes fields expected by the published JSON contract", async () => {
  const result = await stageImageBuildContext({
    agent: "openclaw",
    repoRoot: "/repo",
    outputDir: "/tmp/nemoclaw-image-stage/openclaw-94dc7e6",
    sourceCommit: "94dc7e6",
  });

  expect(JSON.parse(JSON.stringify(result))).toEqual({
    agent: "openclaw",
    dockerfile: "/repo/Dockerfile",
    baseDockerfile: "/repo/Dockerfile.base",
    contextPath: "/tmp/nemoclaw-image-stage/openclaw-94dc7e6/context",
    sourceCommit: "94dc7e6",
    contentHash: result.contentHash,
  });
});
```

- [ ] **Step 5: Run the stage-service test to verify it passes**

Run: `rtk npx vitest run src/lib/image/stage.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/image/stage.ts src/lib/image/stage.test.ts src/lib/build-context.ts
rtk git commit -m "feat(image): add deterministic stage service"
```

## Task 4: Minimal Dockerfile Patching Without Onboarding Runtime State

**Files:**
- Create: `src/lib/image/dockerfile-patch.ts`
- Create: `src/lib/image/dockerfile-patch.test.ts`

- [ ] **Step 1: Write the failing patch tests**

```ts
// src/lib/image/dockerfile-patch.test.ts
import { describe, expect, it } from "vitest";

import { applyImageOnlyDockerfilePatch } from "./dockerfile-patch";

describe("applyImageOnlyDockerfilePatch", () => {
  it("pins only the base image and build metadata", () => {
    const output = applyImageOnlyDockerfilePatch(
      "ARG BASE_IMAGE=ghcr.io/example/base:latest\nARG NEMOCLAW_BUILD_ID=dev\nARG NEMOCLAW_MODEL=model\n",
      {
        baseImageRef: "ghcr.io/example/base@sha256:abc",
        buildId: "94dc7e6",
      },
    );

    expect(output).toContain("ARG BASE_IMAGE=ghcr.io/example/base@sha256:abc");
    expect(output).toContain("ARG NEMOCLAW_BUILD_ID=94dc7e6");
    expect(output).toContain("ARG NEMOCLAW_MODEL=model");
  });

  it("does not inject provider or model runtime settings", () => {
    const output = applyImageOnlyDockerfilePatch("ARG NEMOCLAW_PROVIDER_KEY=unchanged\n", {
      baseImageRef: "ghcr.io/example/base@sha256:def",
      buildId: "94dc7e6",
    });

    expect(output).toContain("ARG NEMOCLAW_PROVIDER_KEY=unchanged");
    expect(output).not.toContain("nvidia");
    expect(output).not.toContain("openai");
  });
});
```

- [ ] **Step 2: Run the patch tests to verify they fail**

Run: `rtk npx vitest run src/lib/image/dockerfile-patch.test.ts`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement the minimal image-only patch helper**

```ts
// src/lib/image/dockerfile-patch.ts
export function applyImageOnlyDockerfilePatch(
  dockerfile: string,
  options: { baseImageRef: string | null; buildId: string | null },
): string {
  let output = dockerfile;
  if (options.baseImageRef) {
    output = output.replace(/^ARG BASE_IMAGE=.*$/m, `ARG BASE_IMAGE=${options.baseImageRef}`);
  }
  if (options.buildId) {
    output = output.replace(/^ARG NEMOCLAW_BUILD_ID=.*$/m, `ARG NEMOCLAW_BUILD_ID=${options.buildId}`);
  }
  return output;
}
```

- [ ] **Step 4: Run the patch tests to verify they pass**

Run: `rtk npx vitest run src/lib/image/dockerfile-patch.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/image/dockerfile-patch.ts src/lib/image/dockerfile-patch.test.ts
rtk git commit -m "feat(image): split image-only dockerfile patching"
```

## Task 5: Build Service, Base-Image Override, and JSON Output

**Files:**
- Create: `src/lib/image/build.ts`
- Create: `src/lib/image/build.test.ts`

- [ ] **Step 1: Write the failing build-service tests**

```ts
// src/lib/image/build.test.ts
import { describe, expect, it, vi } from "vitest";

import { runImageBuild } from "./build";

describe("runImageBuild", () => {
  it("honors an explicit --base-image override and returns JSON metadata", async () => {
    const result = await runImageBuild(
      {
        agent: "openclaw",
        tag: "ghcr.io/example/openclaw-runtime:test",
        push: false,
        "base-image": "ghcr.io/example/base@sha256:abc",
        json: true,
      },
      {
        stageImageBuildContext: vi.fn().mockResolvedValue({
          agent: "openclaw",
          dockerfile: "/repo/Dockerfile",
          baseDockerfile: "/repo/Dockerfile.base",
          contextPath: "/tmp/openclaw/context",
          sourceCommit: "94dc7e6",
          contentHash: "sha256:stage",
        }),
        dockerBuild: vi.fn().mockResolvedValue({
          imageRef: "ghcr.io/example/openclaw-runtime@sha256:built",
          digest: "sha256:built",
        }),
      },
    );

    expect(result).toMatchObject({
      agent: "openclaw",
      tag: "ghcr.io/example/openclaw-runtime:test",
      imageRef: "ghcr.io/example/openclaw-runtime@sha256:built",
      digest: "sha256:built",
      stagedContextHash: "sha256:stage",
    });
  });
});
```

- [ ] **Step 2: Run the build-service test to verify it fails**

Run: `rtk npx vitest run src/lib/image/build.test.ts`

Expected: FAIL with module-not-found errors.

- [ ] **Step 3: Implement the build service with injectable Docker hooks**

```ts
// src/lib/image/build.ts
import { stageImageBuildContext } from "./stage";

export async function runImageBuild(
  flags: Record<string, unknown>,
  deps: {
    stageImageBuildContext?: typeof stageImageBuildContext;
    dockerBuild?: (input: Record<string, unknown>) => Promise<{ imageRef: string; digest: string | null }>;
  } = {},
): Promise<Record<string, unknown>> {
  const stage = deps.stageImageBuildContext ?? stageImageBuildContext;
  const staged = await stage({
    agent: String(flags.agent ?? "openclaw"),
    repoRoot: process.cwd(),
    outputDir: `/tmp/nemoclaw-image-stage/${String(flags.agent ?? "openclaw")}`,
    sourceCommit: "HEAD",
  });
  const dockerBuild =
    deps.dockerBuild ??
    (async () => ({
      imageRef: String(flags.tag),
      digest: null,
    }));

  const built = await dockerBuild({
    agent: flags.agent,
    tag: flags.tag,
    push: flags.push,
    baseImage: flags["base-image"] ?? null,
    contextPath: staged.contextPath,
  });

  return {
    agent: staged.agent,
    tag: flags.tag,
    imageRef: built.imageRef,
    digest: built.digest,
    sourceCommit: staged.sourceCommit,
    stagedContextHash: staged.contentHash,
  };
}
```

- [ ] **Step 4: Add a regression test for the non-baked runtime contract**

```ts
it("never requires provider or model flags for image-only builds", async () => {
  const result = await runImageBuild(
    {
      agent: "openclaw",
      tag: "ghcr.io/example/openclaw-runtime:test",
      push: false,
      json: true,
    },
    {
      stageImageBuildContext: vi.fn().mockResolvedValue({
        agent: "openclaw",
        dockerfile: "/repo/Dockerfile",
        baseDockerfile: "/repo/Dockerfile.base",
        contextPath: "/tmp/openclaw/context",
        sourceCommit: "94dc7e6",
        contentHash: "sha256:stage",
      }),
      dockerBuild: vi.fn().mockResolvedValue({
        imageRef: "ghcr.io/example/openclaw-runtime@sha256:built",
        digest: "sha256:built",
      }),
    },
  );

  expect(result).not.toHaveProperty("provider");
  expect(result).not.toHaveProperty("model");
});
```

- [ ] **Step 5: Run the build-service tests to verify they pass**

Run: `rtk npx vitest run src/lib/image/build.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/image/build.ts src/lib/image/build.test.ts
rtk git commit -m "feat(image): add image build service"
```

## Task 6: End-to-End CLI JSON Contract and GitHub Actions Entry Point

**Files:**
- Create: `.github/workflows/image-build.yaml`
- Modify: `src/commands/image/build.ts`
- Modify: `src/commands/image/stage.ts`
- Modify: `src/lib/actions/image/stage.ts`
- Modify: `src/lib/actions/image/build.ts`

- [ ] **Step 1: Write the failing CLI JSON smoke tests**

```ts
// add to src/commands/image/build.test.ts
it("prints machine-readable JSON in build mode", async () => {
  const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await ImageBuildCommand.run(
    ["--agent", "openclaw", "--tag", "ghcr.io/example/openclaw-runtime:test", "--json"],
    process.cwd(),
  );
  expect(write.mock.calls.join("\n")).toContain("\"tag\"");
  write.mockRestore();
});
```

```ts
// add to src/commands/image/stage.test.ts
it("prints machine-readable JSON in stage mode", async () => {
  const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
  await ImageStageCommand.run(["--agent", "openclaw", "--output", "/tmp/out", "--json"], process.cwd());
  expect(write.mock.calls.join("\n")).toContain("\"contextPath\"");
  write.mockRestore();
});
```

- [ ] **Step 2: Run the CLI JSON smoke tests to verify they fail**

Run: `rtk npx vitest run src/commands/image/stage.test.ts src/commands/image/build.test.ts`

Expected: FAIL because the commands do not yet print the action results.

- [ ] **Step 3: Update the image actions and commands to return/print JSON metadata**

```ts
// src/lib/actions/image/stage.ts
export async function runImageStageAction(flags: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { runImageStage } = await import("../../image/stage");
  return runImageStage(flags);
}
```

```ts
// src/commands/image/stage.ts
public async run(): Promise<void> {
  const { flags } = await this.parse(ImageStageCommand);
  const result = await runImageStageAction(flags);
  if (flags.json) this.log(JSON.stringify(result, null, 2));
}
```

```ts
// src/commands/image/build.ts
public async run(): Promise<void> {
  const { flags } = await this.parse(ImageBuildCommand);
  const result = await runImageBuildAction(flags);
  if (flags.json) this.log(JSON.stringify(result, null, 2));
}
```

- [ ] **Step 4: Add the manual GitHub Actions entrypoint**

```yaml
# .github/workflows/image-build.yaml
name: Image Build

on:
  workflow_dispatch:
    inputs:
      agent:
        description: Agent runtime to build
        required: true
        default: openclaw
      tag:
        description: Fully qualified image tag
        required: true
      push:
        description: Push after build
        required: true
        type: boolean
        default: false
      base_image:
        description: Optional explicit base image override
        required: false

jobs:
  build-image:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install dependencies
        run: npm ci
      - name: Build image metadata
        run: >
          rtk node ./bin/nemoclaw.js image build
          --agent "${{ inputs.agent }}"
          --tag "${{ inputs.tag }}"
          ${{ inputs.push && '--push' || '' }}
          ${{ inputs.base_image != '' && format('--base-image {0}', inputs.base_image) || '' }}
          --json | tee image-build.json
      - name: Upload metadata artifact
        uses: actions/upload-artifact@v4
        with:
          name: image-build-metadata
          path: image-build.json
```

- [ ] **Step 5: Run the command tests to verify they pass**

Run: `rtk npx vitest run src/commands/image/stage.test.ts src/commands/image/build.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/commands/image/stage.ts src/commands/image/build.ts src/lib/actions/image/stage.ts src/lib/actions/image/build.ts .github/workflows/image-build.yaml
rtk git commit -m "ci(image): add image build workflow"
```

## Task 7: Targeted Verification and Documentation Sanity

**Files:**
- Modify: `docs/superpowers/specs/2026-06-29-image-only-cli-design.md` only if implementation proved a wording mismatch

- [ ] **Step 1: Run the image-focused test suite**

Run:

```bash
rtk npx vitest run \
  src/lib/image/command-support.test.ts \
  src/lib/image/agent-image-definition.test.ts \
  src/lib/image/stage.test.ts \
  src/lib/image/dockerfile-patch.test.ts \
  src/lib/image/build.test.ts \
  src/commands/image/stage.test.ts \
  src/commands/image/build.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the existing build-context regression tests**

Run: `rtk npx vitest run src/lib/build-context.test.ts`

Expected: PASS.

- [ ] **Step 3: Run a dry local CLI smoke check**

Run:

```bash
rtk node ./bin/nemoclaw.js image stage --agent openclaw --output /tmp/openclaw-stage --json
rtk node ./bin/nemoclaw.js image build --agent openclaw --tag local/openclaw:test --json
```

Expected:

- first command prints JSON containing `contextPath`
- second command prints JSON containing `tag` and `stagedContextHash`

- [ ] **Step 4: Update the spec only if the implementation changed a published contract**

```md
If the JSON keys, base-image policy, or missing-source error semantics differ
from the current spec, edit
docs/superpowers/specs/2026-06-29-image-only-cli-design.md
in the same commit that changes the implementation.
```

- [ ] **Step 5: Commit**

```bash
rtk git add docs/superpowers/specs/2026-06-29-image-only-cli-design.md
rtk git commit -m "docs(image): sync implementation details" || true
```

## Self-Review (Tier 1)

- Spec coverage:
  - CLI shape: Tasks 1, 6
  - single-agent per image and missing-source behavior: Task 2
  - deterministic staged build-context contract: Task 3 (metadata only; real
    context copy is Tier 2 Task 8)
  - minimal patching and no runtime provider/model bake-in: Task 4, Task 5
  - configurable registry/base-image behavior: Task 5, Task 6 (flag wiring only;
    real base-image resolution is Tier 2 Task 10)
  - JSON metadata contract for local and CI consumers: Task 3, Task 5, Task 6
  - GitHub Actions entrypoint: Task 6
- Placeholder scan: no `TODO`, `TBD`, or "implement later" markers remain in the task steps.
- Type consistency:
  - `runImageStageAction()` returns JSON-serializable metadata
  - `runImageBuildAction()` returns JSON-serializable metadata
  - `resolveAgentImageDefinition()` is the only agent-to-Dockerfile mapper used by later tasks

## Tier 1 Known Gaps (deferred to Tier 2)

The following are intentional stubs in Tier 1, not bugs. They are tracked here
so reviewers do not file them as regressions.

- `stageImageBuildContext` creates `contextPath` but does not copy any files
  into it. Tier 2 Task 8 wires `copyBuildContextDir`.
- `contentHash` hashes path strings, not file contents. Tier 2 Task 9 fixes
  this.
- `runImageBuild` default `dockerBuild` returns `imageRef = tag`, `digest =
  null` without invoking Docker. Tier 2 Task 11 wires real `docker build`.
- `--push` is accepted but has no effect. Tier 2 Task 11 wires `docker push`.
- `--base-image` override is forwarded to the `dockerBuild` hook but no default
  resolution happens when it is absent. Tier 2 Task 10 wires
  `sandbox-base-image.ts`.
- `metadata.json` is not written into `contextPath`. Tier 2 Task 8 adds this.

---

## Tier 2: Real Docker Integration (Tasks 8-12, NOT STARTED)

**Goal:** Make `nemoclaw image stage` and `nemoclaw image build` produce a real
container image, not just a JSON metadata contract.

**Prerequisite:** Tier 1 (Tasks 1-7) is complete on `feat/image-only-cli`.

**Branch:** Continue on `feat/image-only-cli` or a new branch off it.

## Task 8: Stage Service Copies Real Build Context

**Files:**
- Modify: `src/lib/image/stage.ts`
- Modify: `src/lib/image/stage.test.ts`
- Modify: `src/lib/build-context.ts` (only if a helper needs to be exported)

- [ ] **Step 1: Write failing tests that assert staged context contains real files**

```ts
// add to src/lib/image/stage.test.ts
import fs from "node:fs";
import path from "node:path";

it("copies the agent Dockerfile and base Dockerfile into the staged context", async () => {
  const result = await stageImageBuildContext({
    agent: "openclaw",
    repoRoot,
    outputDir,
    sourceCommit: "94dc7e6",
  });

  expect(fs.existsSync(path.join(result.contextPath, "Dockerfile"))).toBe(true);
  expect(fs.existsSync(path.join(result.contextPath, "Dockerfile.base"))).toBe(true);
});

it("writes metadata.json into the staged context", async () => {
  const result = await stageImageBuildContext({
    agent: "openclaw",
    repoRoot,
    outputDir,
    sourceCommit: "94dc7e6",
  });

  const metadataPath = path.join(result.contextPath, "metadata.json");
  expect(fs.existsSync(metadataPath)).toBe(true);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
  expect(metadata).toMatchObject({ agent: "openclaw", sourceCommit: "94dc7e6" });
});

it("excludes node_modules and .git from the staged context", async () => {
  fs.mkdirSync(path.join(repoRoot, "node_modules"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, "node_modules", "junk.js"), "x");
  fs.mkdirSync(path.join(repoRoot, ".git"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, ".git", "config"), "x");

  const result = await stageImageBuildContext({
    agent: "openclaw",
    repoRoot,
    outputDir,
    sourceCommit: "94dc7e6",
  });

  expect(fs.existsSync(path.join(result.contextPath, "node_modules"))).toBe(false);
  expect(fs.existsSync(path.join(result.contextPath, ".git"))).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/image/stage.test.ts`

Expected: FAIL because `contextPath` is empty.

- [ ] **Step 3: Implement real context copy using existing build-context helpers**

```ts
// src/lib/image/stage.ts (modify)
import { copyBuildContextDir } from "../build-context";

export async function stageImageBuildContext(options) {
  const def = resolveAgentImageDefinition(options.agent, options.repoRoot);
  const contextPath = path.join(options.outputDir, "context");
  fs.mkdirSync(contextPath, { recursive: true });

  // Copy the agent's build context into contextPath, respecting exclusion rules.
  copyBuildContextDir(def.contextRoot, contextPath);

  // Write metadata.json so the staged directory is self-describing.
  const metadata = { agent: def.agent, dockerfile: def.dockerfilePath,
    baseDockerfile: def.baseDockerfilePath, contextPath, sourceCommit: options.sourceCommit };
  fs.writeFileSync(path.join(contextPath, "metadata.json"), JSON.stringify(metadata, null, 2));

  // contentHash is updated in Task 9 to hash file contents.
  const contentHash = `sha256:${crypto.createHash("sha256")
    .update([def.agent, def.dockerfilePath, def.baseDockerfilePath, options.sourceCommit].join("\n"))
    .digest("hex")}`;

  return { ...metadata, contentHash };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/image/stage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image/stage.ts src/lib/image/stage.test.ts
git commit -m "feat(image): stage real build context"
```

## Task 9: Content Hash Over Real File Contents

**Files:**
- Modify: `src/lib/image/stage.ts`
- Modify: `src/lib/image/stage.test.ts`

- [ ] **Step 1: Write failing test that contentHash changes when Dockerfile content changes**

```ts
it("contentHash changes when Dockerfile content changes", async () => {
  fs.writeFileSync(path.join(repoRoot, "Dockerfile"), "FROM scratch\n");
  const a = await stageImageBuildContext({ agent: "openclaw", repoRoot, outputDir: path.join(outputBase, "a"), sourceCommit: "94dc7e6" });
  fs.writeFileSync(path.join(repoRoot, "Dockerfile"), "FROM ubuntu:22.04\n");
  const b = await stageImageBuildContext({ agent: "openclaw", repoRoot, outputDir: path.join(outputBase, "b"), sourceCommit: "94dc7e6" });
  expect(a.contentHash).not.toBe(b.contentHash);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/image/stage.test.ts`

Expected: FAIL because hash is based on path strings, not content.

- [ ] **Step 3: Implement content-based hashing**

```ts
// src/lib/image/stage.ts (modify)
function hashDirectory(dirPath: string): string {
  const hash = crypto.createHash("sha256");
  const entries = fs.readdirSync(dirPath, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      const fullPath = path.join(entry.parentPath ?? dirPath, entry.name);
      const rel = path.relative(dirPath, fullPath);
      hash.update(rel);
      hash.update(fs.readFileSync(fullPath));
    }
  }
  return `sha256:${hash.digest("hex")}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/image/stage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image/stage.ts src/lib/image/stage.test.ts
git commit -m "feat(image): hash staged context content"
```

## Task 10: Base Image Resolution via sandbox-base-image.ts

**Files:**
- Modify: `src/lib/image/build.ts`
- Modify: `src/lib/image/build.test.ts`
- Modify: `src/lib/sandbox-base-image.ts` (only if a helper needs to be exported)

- [ ] **Step 1: Write failing test that default base image is resolved when --base-image is absent**

```ts
it("resolves a default base image when --base-image is not supplied", async () => {
  const result = await runImageBuild(
    { agent: "openclaw", tag: "local/openclaw:test", push: false },
    {
      stageImageBuildContext: vi.fn().mockResolvedValue({ /* ... */ }),
      resolveBaseImage: vi.fn().mockResolvedValue("ghcr.io/nvidia/nemoclaw/openclaw-base@sha256:abc"),
      dockerBuild: vi.fn().mockResolvedValue({ imageRef: "local/openclaw:test", digest: "sha256:built" }),
    },
  );
  expect(result.baseImage).toBe("ghcr.io/nvidia/nemoclaw/openclaw-base@sha256:abc");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/image/build.test.ts`

Expected: FAIL because `resolveBaseImage` hook does not exist.

- [ ] **Step 3: Wire resolveBaseImage to sandbox-base-image.ts**

- [ ] **Step 4: Run the tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/image/build.ts src/lib/image/build.test.ts
git commit -m "feat(image): resolve default base image"
```

## Task 11: Real docker build and docker push

**Files:**
- Modify: `src/lib/image/build.ts`
- Modify: `src/lib/image/build.test.ts`

- [ ] **Step 1: Write failing tests that dockerBuild spawns docker and parses digest**

```ts
it("spawns docker build and parses the image digest", async () => {
  const spawnDockerBuild = vi.fn().mockResolvedValue({
    imageRef: "local/openclaw:test@sha256:built",
    digest: "sha256:built",
  });
  const result = await runImageBuild(
    { agent: "openclaw", tag: "local/openclaw:test", push: false },
    { stageImageBuildContext: vi.fn().mockResolvedValue({ /* ... */ }), dockerBuild: spawnDockerBuild },
  );
  expect(spawnDockerBuild).toHaveBeenCalledWith(expect.objectContaining({ tag: "local/openclaw:test" }));
  expect(result.digest).toBe("sha256:built");
});

it("spawns docker push when --push is set", async () => {
  const dockerPush = vi.fn().mockResolvedValue("sha256:pushed");
  const result = await runImageBuild(
    { agent: "openclaw", tag: "ghcr.io/org/openclaw:test", push: true },
    { stageImageBuildContext: vi.fn().mockResolvedValue({ /* ... */ }),
      dockerBuild: vi.fn().mockResolvedValue({ imageRef: "ghcr.io/org/openclaw:test", digest: "sha256:built" }),
      dockerPush },
  );
  expect(dockerPush).toHaveBeenCalledWith("ghcr.io/org/openclaw:test");
  expect(result.digest).toBe("sha256:pushed");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

- [ ] **Step 3: Implement real docker build/push using child_process**

```ts
// src/lib/image/build.ts (modify)
import { execSync } from "node:child_process";

async function defaultDockerBuild(input: DockerBuildInput): Promise<DockerBuildResult> {
  const args = ["build", "-t", input.tag, input.contextPath];
  if (input.baseImage) args.push("--build-arg", `BASE_IMAGE=${input.baseImage}`);
  execSync(`docker ${args.join(" ")}`, { stdio: "inherit" });
  const digest = execSync(`docker inspect --format='{{index .RepoDigests 0}}' ${input.tag}`, { encoding: "utf-8" }).trim();
  return { imageRef: input.tag, digest };
}

async function defaultDockerPush(tag: string): Promise<string> {
  execSync(`docker push ${tag}`, { stdio: "inherit" });
  const digest = execSync(`docker inspect --format='{{index .RepoDigests 0}}' ${tag}`, { encoding: "utf-8" }).trim();
  return digest;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add src/lib/image/build.ts src/lib/image/build.test.ts
git commit -m "feat(image): wire real docker build and push"
```

## Task 12: End-to-End Verification and Spec Sync

**Files:**
- Modify: `docs/superpowers/specs/2026-06-29-image-only-cli-design.md` (update Implementation Status to Tier 2 done)

- [ ] **Step 1: Run the full image test suite**

```bash
npx vitest run src/lib/image/ src/commands/image/
```

Expected: PASS.

- [ ] **Step 2: Run a real local CLI smoke check (requires Docker daemon)**

```bash
node ./bin/nemoclaw.js image stage --agent openclaw --output /tmp/openclaw-stage --json
node ./bin/nemoclaw.js image build --agent openclaw --tag local/openclaw:test --json
docker image inspect local/openclaw:test
```

Expected:
- stage prints JSON with `contextPath` pointing to a non-empty directory
- build prints JSON with a real `digest` (not null)
- `docker image inspect` succeeds

- [ ] **Step 3: Update spec Implementation Status to mark Tier 2 done**

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-29-image-only-cli-design.md
git commit -m "docs(image): mark tier 2 complete"
```
