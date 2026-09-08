// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { copyBuildContextDir } from "../build-context";
import { resolveAgentImageDefinition } from "./agent-image-definition";
import type { ImageStageFlags } from "./command-support";

export type StageImageBuildContextResult = {
  agent: string;
  dockerfile: string;
  baseDockerfile: string;
  contextPath: string;
  sourceCommit: string;
  contentHash: string;
};

export type StageImageBuildContextOptions = {
  agent: string;
  repoRoot: string;
  outputDir: string;
  sourceCommit: string;
};

export async function stageImageBuildContext(
  options: StageImageBuildContextOptions,
): Promise<StageImageBuildContextResult> {
  const def = resolveAgentImageDefinition(options.agent, options.repoRoot);
  const contextPath = path.join(options.outputDir, "context");
  fs.mkdirSync(contextPath, { recursive: true });

  // Copy the agent's build context into contextPath, respecting the shared
  // exclusion rules (node_modules, .git, .DS_Store, etc.).
  copyBuildContextDir(def.contextRoot, contextPath);

  // Docker builds resolve the Dockerfile relative to the staged context. The
  // repository root also contains the OpenClaw Dockerfiles, so explicitly
  // place the selected agent's pair at the context root after copying the
  // shared repository context.
  fs.copyFileSync(def.dockerfilePath, path.join(contextPath, "Dockerfile"));
  fs.copyFileSync(def.baseDockerfilePath, path.join(contextPath, "Dockerfile.base"));

  // Compute contentHash over the actual staged file contents so it is a
  // meaningful cache key: identical inputs produce identical hashes, and any
  // Dockerfile or source change produces a different hash.
  const contentHash = hashStagedContext(contextPath, options.sourceCommit);

  const metadata = {
    agent: def.agent,
    dockerfile: def.dockerfilePath,
    baseDockerfile: def.baseDockerfilePath,
    contextPath,
    sourceCommit: options.sourceCommit,
    contentHash,
  };

  // Write metadata.json so the staged directory is self-describing for
  // downstream consumers (CI, fork-local wrappers).
  fs.writeFileSync(path.join(contextPath, "metadata.json"), JSON.stringify(metadata, null, 2));

  return metadata;
}

function hashStagedContext(contextPath: string, sourceCommit: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(`sourceCommit=${sourceCommit}\n`);
  const entries = walkFiles(contextPath);
  for (const rel of entries) {
    hash.update(`${rel}\n`);
    hash.update(fs.readFileSync(path.join(contextPath, rel)));
    hash.update("\n");
  }
  return `sha256:${hash.digest("hex")}`;
}

function walkFiles(root: string): string[] {
  const results: string[] = [];
  const stack: string[] = [""];
  while (stack.length > 0) {
    const rel = stack.pop()!;
    const abs = rel ? path.join(root, rel) : root;
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "metadata.json") continue; // avoid self-referential hash
      const childRel = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        stack.push(childRel);
      } else if (entry.isFile()) {
        results.push(childRel);
      }
    }
  }
  results.sort();
  return results;
}

export function resolveSourceCommit(repoRoot: string): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8" }).trim();
  } catch {
    return "HEAD";
  }
}

export async function runImageStage(flags: ImageStageFlags): Promise<StageImageBuildContextResult> {
  const agent = String(flags.agent ?? "openclaw");
  const repoRoot = process.cwd();
  const outputDir = flags.output ?? `/tmp/nemoclaw-image-stage/${agent}`;
  const sourceCommit = resolveSourceCommit(repoRoot);
  return stageImageBuildContext({ agent, repoRoot, outputDir, sourceCommit });
}
