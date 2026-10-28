// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { NODE_BASES_REQUIRING_BUNDLED_NPM_TAR_PATCH } from "../scripts/patch-bundled-npm-tar.mts";
import {
  requireReviewedDockerfileRunCommands,
  requireSingleDockerfileCopySource,
  requireSingleReviewedDockerfileRunCommand,
} from "./helpers/dockerfile-run-commands";

const repoRoot = path.resolve(import.meta.dirname, "..");
const dockerfiles = [
  {
    file: "Dockerfile.base",
    installsPatchDownloader: false,
    installsWithNpm: true,
    nodePrefix: "node",
    patchCount: 2,
  },
  {
    file: "Dockerfile",
    installsPatchDownloader: false,
    installsWithNpm: true,
    nodePrefix: "node --experimental-strip-types",
    patchCount: 1,
  },
  {
    file: "agents/hermes/Dockerfile.base",
    installsPatchDownloader: false,
    installsWithNpm: true,
    nodePrefix: "node",
    patchCount: 2,
  },
  {
    file: "agents/hermes/Dockerfile",
    installsPatchDownloader: false,
    installsWithNpm: true,
    nodePrefix: "node --experimental-strip-types",
    patchCount: 1,
  },
  {
    file: "agents/langchain-deepagents-code/Dockerfile.base",
    installsPatchDownloader: true,
    installsWithNpm: false,
    nodePrefix: "node",
    patchCount: 2,
  },
  {
    file: "agents/langchain-deepagents-code/Dockerfile",
    installsPatchDownloader: false,
    installsWithNpm: false,
    nodePrefix: "node --experimental-strip-types",
    patchCount: 1,
  },
] as const;
const npmRootArguments = ["--npm-root", "/usr/local/lib/node_modules/npm"] as const;

function patchCommand(nodePrefix: string): string {
  return `${nodePrefix} /scripts/patch-bundled-npm-tar.mts`;
}

function completedStage(source: string): string {
  const finalStageStart = [...source.matchAll(/^FROM\b/gmu)].at(-1)?.index;
  assert(finalStageStart !== undefined, "Dockerfile must contain a completed image stage");
  return source.slice(finalStageStart);
}

function namedStage(source: string, name: string): string {
  const stageStart = source.indexOf(`FROM scratch AS ${name}`);
  assert(stageStart >= 0, `Dockerfile must contain the ${name} stage`);
  const nextStage = source.indexOf("\nFROM ", stageStart);
  return source.slice(stageStart, nextStage >= 0 ? nextStage : undefined);
}

describe("node-tar image remediation contract", () => {
  it("binds the remediation lifecycle to the affected upstream Node image pins", () => {
    const pinnedBaseSources = [
      "Dockerfile.base",
      "Dockerfile",
      "agents/hermes/Dockerfile.base",
      "agents/langchain-deepagents-code/Dockerfile.base",
    ]
      .map((file) => fs.readFileSync(path.join(repoRoot, file), "utf8"))
      .join("\n");

    for (const base of NODE_BASES_REQUIRING_BUNDLED_NPM_TAR_PATCH) {
      expect(pinnedBaseSources, base).toContain(`FROM ${base}`);
    }
  });

  it.each(
    dockerfiles.filter((entry) => entry.file.endsWith(".base")),
  )("installs curl before patching the bundled npm tar in $file", (entry) => {
    const { file, nodePrefix, patchCount } = entry;
    const source = completedStage(fs.readFileSync(path.join(repoRoot, file), "utf8"));
    const curlInstall = source.indexOf("curl=");
    const patchRuns = requireReviewedDockerfileRunCommands(
      source,
      patchCommand(nodePrefix),
      npmRootArguments,
      patchCount,
    );

    expect(curlInstall, file).toBeGreaterThanOrEqual(0);
    expect(
      patchRuns.every((patchRun) => patchRun.commandStart > curlInstall),
      file,
    ).toBe(true);
  });

  it.each(
    dockerfiles,
  )("places bundled npm tar remediation in the final $file stage before any npm consumers", (entry) => {
    const { file, installsPatchDownloader, installsWithNpm, nodePrefix, patchCount } = entry;
    const dockerfile = fs.readFileSync(path.join(repoRoot, file), "utf8");
    const source = completedStage(dockerfile);
    const patchPayloadStage = ["hermes-npm-patch-payload", "openclaw-dependency-payload"].find(
      (stage) => source.includes(`COPY --from=${stage} / /`),
    );
    const patchPayloadLayer =
      patchPayloadStage === undefined ? -1 : source.indexOf(`COPY --from=${patchPayloadStage} / /`);
    const patchInputStage =
      patchPayloadStage === undefined ? source : namedStage(dockerfile, patchPayloadStage);
    const reviewedCopyInstruction = requireSingleDockerfileCopySource(
      patchInputStage,
      "scripts/lib/reviewed-npm-archive.mts",
      "/scripts/lib/reviewed-npm-archive.mts",
    );
    const reviewedCopy = reviewedCopyInstruction.start;
    const patchCopy = requireSingleDockerfileCopySource(
      patchInputStage,
      "scripts/patch-bundled-npm-tar.mts",
      "/scripts/patch-bundled-npm-tar.mts",
    ).start;
    const patchRuns = requireReviewedDockerfileRunCommands(
      source,
      patchCommand(nodePrefix),
      npmRootArguments,
      patchCount,
    );
    const patchRun = patchRuns[0]!.commandStart;
    const lastPatchRun = patchRuns[patchRuns.length - 1]!.commandStart;
    const patchInputReady = patchPayloadLayer >= 0 ? patchPayloadLayer : patchCopy;

    expect(patchCopy, file).toBeGreaterThan(reviewedCopy);
    expect(patchRun, file).toBeGreaterThan(patchInputReady);
    const aptInstall = source.indexOf(
      "apt-get update && apt-get install -y --no-install-recommends",
      patchInputReady,
    );
    const curlPackage = source.indexOf("curl=8.14.1-2+deb13u7", aptInstall);
    const aptInstallCleanup = source.indexOf("&& rm -rf /var/lib/apt/lists/*", curlPackage);
    expect(
      aptInstall > patchCopy &&
        curlPackage > aptInstall &&
        aptInstallCleanup > curlPackage &&
        aptInstallCleanup < patchRun,
      file,
    ).toBe(installsPatchDownloader);
    const executableSource = source.replace(/^\s*#.*$/gmu, (comment) => " ".repeat(comment.length));
    const npmConsumers = [...executableSource.matchAll(/\bnpm\s+(?:ci|install)\b/gu)].map(
      (match) => match.index,
    );
    expect(npmConsumers.length > 0, file).toBe(installsWithNpm);
    expect(
      npmConsumers.every((index) => index > lastPatchRun),
      file,
    ).toBe(true);
  });
});

describe("reviewed npm image remediation contract", () => {
  it.each([
    { file: "Dockerfile.base", installsWithNpm: true, nodePrefix: "node" },
    { file: "agents/hermes/Dockerfile.base", installsWithNpm: true, nodePrefix: "node" },
    {
      file: "agents/langchain-deepagents-code/Dockerfile.base",
      installsWithNpm: false,
      nodePrefix: "node",
    },
  ])("upgrades npm before use in $file", ({ file, installsWithNpm, nodePrefix }) => {
    const source = completedStage(fs.readFileSync(path.join(repoRoot, file), "utf8"));
    const patchRuns = requireReviewedDockerfileRunCommands(
      source,
      patchCommand(nodePrefix),
      npmRootArguments,
      2,
    );
    const upgradeCopy = source.indexOf(
      "COPY scripts/upgrade-bundled-npm.mts /scripts/upgrade-bundled-npm.mts",
    );
    const upgradeRun = requireSingleReviewedDockerfileRunCommand(
      source,
      `${nodePrefix} /scripts/upgrade-bundled-npm.mts`,
      npmRootArguments,
    ).commandStart;

    expect(upgradeCopy, file).toBeGreaterThanOrEqual(0);
    expect(patchRuns[0]!.commandStart, file).toBeGreaterThan(upgradeCopy);
    expect(upgradeRun, file).toBeGreaterThan(patchRuns[0]!.commandStart);
    expect(patchRuns[1]!.commandStart, file).toBeGreaterThan(upgradeRun);

    const executableSource = source.replace(/^\s*#.*$/gmu, (comment) => " ".repeat(comment.length));
    const npmConsumers = [...executableSource.matchAll(/\bnpm\s+(?:ci|install)\b/gu)].map(
      (match) => match.index,
    );
    expect(npmConsumers.length > 0, file).toBe(installsWithNpm);
    expect(
      npmConsumers.every((index) => index > patchRuns[1]!.commandStart),
      file,
    ).toBe(true);
  });
});
