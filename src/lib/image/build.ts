// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";

import { hermesBaseImageSupportsMcp } from "../agent/base-image";
import { readHermesPinnedBaseImageRef } from "../agent/hermes-base-image-pin";
import { dockerBuild as adapterDockerBuild, dockerImageInspectFormat } from "../adapters/docker";
import { type ResolveBaseImageOptions, resolveSandboxBaseImage } from "../sandbox-base-image";
import { resolveAgentImageDefinition } from "./agent-image-definition";
import {
  resolveSourceCommit,
  stageImageBuildContext,
  type StageImageBuildContextResult,
} from "./stage";

export type ImageBuildFlags = {
  agent?: string;
  tag: string;
  push?: boolean;
  "base-image"?: string;
  "build-arg"?: string[];
  platform?: string;
  json?: boolean;
  quiet?: boolean;
};

export type DockerBuildInput = {
  agent?: string;
  tag: string;
  push?: boolean;
  baseImage: string | null;
  buildArgs: string[];
  platform?: string;
  contextPath: string;
};

export type DockerBuildResult = {
  imageRef: string;
  digest: string | null;
};

export type ResolveBaseImageInput = {
  agent: string;
  dockerfilePath: string;
  baseDockerfilePath: string;
  baseImageName: string;
  repoRoot: string;
};

export type ResolveDefaultImageBuildBaseImageDeps = {
  resolveSandboxBaseImage?: typeof resolveSandboxBaseImage;
  readHermesPinnedBaseImageRef?: typeof readHermesPinnedBaseImageRef;
  validateHermesBaseImage?: typeof hermesBaseImageSupportsMcp;
};

export type ImageBuildDeps = {
  stageImageBuildContext?: typeof stageImageBuildContext;
  resolveBaseImage?: (input: ResolveBaseImageInput) => Promise<string>;
  dockerBuild?: (input: DockerBuildInput) => Promise<DockerBuildResult>;
  dockerPush?: (tag: string) => Promise<string | null>;
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
  const repoRoot = process.cwd();
  const imageDefinition = resolveAgentImageDefinition(agent, repoRoot);
  const stage = deps.stageImageBuildContext ?? stageImageBuildContext;
  const staged: StageImageBuildContextResult = await stage({
    agent,
    repoRoot,
    outputDir: `/tmp/nemoclaw-image-stage/${agent}`,
    sourceCommit: resolveSourceCommit(repoRoot),
  });

  // Use explicit --base-image override when supplied; otherwise resolve a
  // default base image via the shared sandbox-base-image policy.
  let baseImage: string | null = flags["base-image"] ?? null;
  if (!baseImage) {
    const resolve = deps.resolveBaseImage ?? resolveDefaultImageBuildBaseImage;
    baseImage = await resolve({
      agent,
      dockerfilePath: staged.dockerfile,
      baseDockerfilePath: staged.baseDockerfile,
      baseImageName: imageDefinition.baseImageName,
      repoRoot,
    });
  }

  const dockerBuild = deps.dockerBuild ?? defaultDockerBuild;
  const built = await dockerBuild({
    agent,
    tag: flags.tag,
    push: flags.push,
    baseImage,
    buildArgs: flags["build-arg"] ?? [],
    platform: flags.platform,
    contextPath: staged.contextPath,
  });

  // When --push is set, push the built image to its registry and prefer the
  // registry-returned digest over the local build digest.
  let digest = built.digest;
  if (flags.push) {
    const dockerPush = deps.dockerPush ?? defaultDockerPush;
    const pushedDigest = await dockerPush(flags.tag);
    if (pushedDigest) digest = pushedDigest;
  }

  return {
    agent: staged.agent,
    tag: flags.tag,
    imageRef: built.imageRef,
    digest,
    sourceCommit: staged.sourceCommit,
    stagedContextHash: staged.contentHash,
    baseImage,
  };
}

export async function resolveDefaultImageBuildBaseImage(
  input: ResolveBaseImageInput,
  deps: ResolveDefaultImageBuildBaseImageDeps = {},
): Promise<string> {
  const options: ResolveBaseImageOptions = {
    imageName: input.baseImageName,
    dockerfilePath: input.baseDockerfilePath,
    localTag: `${input.baseImageName}:local`,
    requireOpenshellSandboxAbi: process.platform === "linux",
    rootDir: input.repoRoot,
  };
  if (input.agent === "hermes") {
    const readPin = deps.readHermesPinnedBaseImageRef ?? readHermesPinnedBaseImageRef;
    const validate = deps.validateHermesBaseImage ?? hermesBaseImageSupportsMcp;
    const pinnedRemoteRef = readPin(input.dockerfilePath);
    options.inputPaths = [input.dockerfilePath];
    options.pinnedRemoteRef = pinnedRemoteRef;
    options.preferPinnedRemoteRef = true;
    options.validateImage = validate;
    options.validationDescription = "the required MCP Streamable HTTP runtime";
  }
  const resolve = deps.resolveSandboxBaseImage ?? resolveSandboxBaseImage;
  const resolution = resolve(options);
  if (!resolution) {
    throw new Error(`Unable to resolve a compatible ${input.agent} base image.`);
  }
  return resolution.ref;
}

async function defaultDockerBuild(input: DockerBuildInput): Promise<DockerBuildResult> {
  const dockerfilePath = path.join(input.contextPath, "Dockerfile");
  const buildArgs: string[] = [];
  if (input.baseImage) {
    buildArgs.push(`BASE_IMAGE=${input.baseImage}`);
  }
  for (const arg of input.buildArgs) {
    buildArgs.push(arg);
  }
  const result = adapterDockerBuild(dockerfilePath, input.tag, input.contextPath, {
    quiet: false,
    buildArgs,
    platform: input.platform,
  });
  if (result.status !== 0) {
    throw new Error(`docker build failed for ${input.tag} (exit ${result.status})`);
  }
  const digest = inspectImageDigest(input.tag);
  return { imageRef: input.tag, digest };
}

async function defaultDockerPush(tag: string): Promise<string | null> {
  // dockerPush is a thin wrapper around `docker push`. We reuse the docker
  // adapter's run helper via inspect after push to capture the registry digest.
  const { dockerRun } = await import("../adapters/docker/run");
  const result = dockerRun(["push", tag], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`docker push failed for ${tag} (exit ${result.status})`);
  }
  return inspectImageDigest(tag);
}

function inspectImageDigest(tag: string): string | null {
  const digest = dockerImageInspectFormat("{{index .RepoDigests 0}}", tag, {
    ignoreError: true,
  });
  const trimmed = digest.trim();
  if (!trimmed) return null;
  // RepoDigests look like "repo@sha256:..."; extract the sha256:... part.
  const atIdx = trimmed.lastIndexOf("@");
  return atIdx >= 0 ? trimmed.slice(atIdx + 1) : trimmed;
}
