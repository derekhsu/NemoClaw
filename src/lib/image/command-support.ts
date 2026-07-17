// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { Flags } from "@oclif/core";

import { describeAgentFlag } from "../onboard/agent-flag-help";

const IMAGE_AGENTS = ["openclaw", "hermes"] as const;
export type ImageAgent = (typeof IMAGE_AGENTS)[number];

export const imageStageExamples = [
  "<%= config.bin %> image stage --output ./dist/openclaw-image",
  "<%= config.bin %> image stage --agent hermes --json",
];

export const imageBuildExamples = [
  "<%= config.bin %> image build --tag ghcr.io/example/openclaw-runtime:latest",
  "<%= config.bin %> image build --agent hermes --tag ghcr.io/example/hermes-runtime:test --base-image ghcr.io/example/hermes-base@sha256:abc",
  "<%= config.bin %> image build --agent hermes --tag ghcr.io/example/hermes-runtime:test --push",
];

export type ImageStageFlags = {
  agent: ImageAgent | undefined;
  output: string | undefined;
  json: boolean | undefined;
  quiet: boolean | undefined;
};

export type ImageBuildFlags = {
  agent: ImageAgent | undefined;
  tag: string;
  push: boolean | undefined;
  "base-image": string | undefined;
  json: boolean | undefined;
  quiet: boolean | undefined;
};

export function buildImageStageFlags(): Record<string, any> {
  return {
    agent: Flags.string({
      description: describeAgentFlag(IMAGE_AGENTS),
      options: [...IMAGE_AGENTS],
    }),
    output: Flags.string({
      description: "Directory where the staged deterministic image build context will be written",
    }),
    json: Flags.boolean({
      description: "Emit the staged image context metadata as JSON",
    }),
    quiet: Flags.boolean({
      description: "Suppress non-error log output",
    }),
  };
}

export function buildImageBuildFlags(): Record<string, any> {
  return {
    agent: Flags.string({
      description: describeAgentFlag(IMAGE_AGENTS),
      options: [...IMAGE_AGENTS],
    }),
    tag: Flags.string({
      description: "Container image tag to build",
      required: true,
    }),
    push: Flags.boolean({
      description: "Push the built image tag to its registry after a successful build",
    }),
    "base-image": Flags.string({
      description: "Override the agent runtime base image reference used for the image build",
    }),
    json: Flags.boolean({
      description: "Emit the image build result as JSON",
    }),
    quiet: Flags.boolean({
      description: "Suppress non-error log output",
    }),
  };
}
