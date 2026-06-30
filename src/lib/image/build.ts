// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { resolveSandboxBaseImage, OPENCLAW_SANDBOX_BASE_IMAGE } from "../sandbox-base-image";
import { resolveSourceCommit, stageImageBuildContext, type StageImageBuildContextResult } from "./stage";

export type ImageBuildFlags = {
  agent?: string;
  tag: string;
  push?: boolean;
  "base-image"?: string;
  json?: boolean;
  quiet?: boolean;
};

export type DockerBuildInput = {
  agent?: string;
  tag: string;
  push?: boolean;
  baseImage: string | null;
  contextPath: string;
};

export type DockerBuildResult = {
  imageRef: string;
  digest: string | null;
};

export type ResolveBaseImageInput = {
  agent: string;
  dockerfilePath: string;
  repoRoot: string;
};

export type ImageBuildDeps = {
  stageImageBuildContext?: typeof stageImageBuildContext;
  resolveBaseImage?: (input: ResolveBaseImageInput) => Promise<string | null>;
  dockerBuild?: (input: DockerBuildInput) => Promise<DockerBuildResult>;
};

export type ImageBuildResult = {
  agent: string;
  tag: string;
  imageRef: string;
  digest: string | null;
  sourceCommit: string;
  stagedContextHash: string;
  baseImage: string | null;
};

export async function runImageBuild(
  flags: ImageBuildFlags,
  deps: ImageBuildDeps = {},
): Promise<ImageBuildResult> {
  const agent = String(flags.agent ?? "openclaw");
  const stage = deps.stageImageBuildContext ?? stageImageBuildContext;
  const staged: StageImageBuildContextResult = await stage({
    agent,
    repoRoot: process.cwd(),
    outputDir: `/tmp/nemoclaw-image-stage/${agent}`,
    sourceCommit: resolveSourceCommit(process.cwd()),
  });

  // Use explicit --base-image override when supplied; otherwise resolve a
  // default base image via the shared sandbox-base-image policy.
  let baseImage: string | null = flags["base-image"] ?? null;
  if (!baseImage) {
    const resolve = deps.resolveBaseImage ?? defaultResolveBaseImage;
    baseImage = await resolve({
      agent,
      dockerfilePath: staged.dockerfile,
      repoRoot: process.cwd(),
    });
  }

  const dockerBuild =
    deps.dockerBuild ??
    (async () => ({
      imageRef: String(flags.tag),
      digest: null,
    }));

  const built = await dockerBuild({
    agent,
    tag: flags.tag,
    push: flags.push,
    baseImage,
    contextPath: staged.contextPath,
  });

  return {
    agent: staged.agent,
    tag: flags.tag,
    imageRef: built.imageRef,
    digest: built.digest,
    sourceCommit: staged.sourceCommit,
    stagedContextHash: staged.contentHash,
    baseImage,
  };
}

async function defaultResolveBaseImage(input: ResolveBaseImageInput): Promise<string | null> {
  const imageName = OPENCLAW_SANDBOX_BASE_IMAGE;
  const resolution = resolveSandboxBaseImage({
    imageName,
    dockerfilePath: input.dockerfilePath,
    localTag: `${imageName}:local`,
  });
  return resolution?.ref ?? null;
}
