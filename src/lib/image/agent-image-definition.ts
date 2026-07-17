// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";

export class MissingAgentImageSourcesError extends Error {
  constructor(agent: string, repoRoot: string) {
    super(
      `${agent} agent sources are missing from ${repoRoot}; cannot build a ${agent} runtime image.`,
    );
    this.name = "MissingAgentImageSourcesError";
  }
}

export class UnknownAgentError extends Error {
  constructor(agent: string) {
    super(`Unknown agent '${agent}'. Expected one of: openclaw, hermes.`);
    this.name = "UnknownAgentError";
  }
}

export type AgentImageDefinition = {
  agent: string;
  dockerfilePath: string;
  baseDockerfilePath: string;
  contextRoot: string;
};

export function resolveAgentImageDefinition(agent: string, repoRoot: string): AgentImageDefinition {
  if (agent === "openclaw") {
    const dockerfilePath = path.join(repoRoot, "Dockerfile");
    const baseDockerfilePath = path.join(repoRoot, "Dockerfile.base");
    if (!fs.existsSync(dockerfilePath) || !fs.existsSync(baseDockerfilePath)) {
      throw new MissingAgentImageSourcesError(agent, repoRoot);
    }
    return { agent, dockerfilePath, baseDockerfilePath, contextRoot: repoRoot };
  }
  if (agent === "hermes") {
    const hermesRoot = path.join(repoRoot, "agents", "hermes");
    const dockerfilePath = path.join(hermesRoot, "Dockerfile");
    const baseDockerfilePath = path.join(hermesRoot, "Dockerfile.base");
    if (!fs.existsSync(dockerfilePath) || !fs.existsSync(baseDockerfilePath)) {
      throw new MissingAgentImageSourcesError(agent, repoRoot);
    }
    return { agent, dockerfilePath, baseDockerfilePath, contextRoot: repoRoot };
  }
  throw new UnknownAgentError(agent);
}
