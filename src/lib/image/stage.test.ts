// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { stageImageBuildContext } from "./stage";

describe("stageImageBuildContext", () => {
  let repoRoot: string;
  let outputBase: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-stage-repo-"));
    outputBase = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-stage-out-"));
    fs.writeFileSync(path.join(repoRoot, "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(repoRoot, "Dockerfile.base"), "FROM scratch\n");
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    fs.rmSync(outputBase, { recursive: true, force: true });
  });

  it("returns stable JSON metadata for openclaw", async () => {
    const outputDir = path.join(outputBase, "openclaw-94dc7e6");
    const result = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir,
      sourceCommit: "94dc7e6",
    });

    expect(result).toMatchObject({
      agent: "openclaw",
      dockerfile: path.join(repoRoot, "Dockerfile"),
      baseDockerfile: path.join(repoRoot, "Dockerfile.base"),
      contextPath: path.join(outputDir, "context"),
      sourceCommit: "94dc7e6",
    });
    expect(result.contentHash).toMatch(/^sha256:/);
  });

  it("creates the context directory on disk", async () => {
    const outputDir = path.join(outputBase, "openclaw-94dc7e6");
    const result = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir,
      sourceCommit: "94dc7e6",
    });

    expect(fs.existsSync(result.contextPath)).toBe(true);
    expect(fs.statSync(result.contextPath).isDirectory()).toBe(true);
  });

  it("produces a deterministic content hash for identical inputs", async () => {
    const outputDirA = path.join(outputBase, "openclaw-a");
    const outputDirB = path.join(outputBase, "openclaw-b");
    const a = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir: outputDirA,
      sourceCommit: "94dc7e6",
    });
    const b = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir: outputDirB,
      sourceCommit: "94dc7e6",
    });

    expect(a.contentHash).toBe(b.contentHash);
  });

  it("serializes fields expected by the published JSON contract", async () => {
    const outputDir = path.join(outputBase, "openclaw-94dc7e6");
    const result = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir,
      sourceCommit: "94dc7e6",
    });

    expect(JSON.parse(JSON.stringify(result))).toEqual({
      agent: "openclaw",
      dockerfile: path.join(repoRoot, "Dockerfile"),
      baseDockerfile: path.join(repoRoot, "Dockerfile.base"),
      contextPath: path.join(outputDir, "context"),
      sourceCommit: "94dc7e6",
      contentHash: result.contentHash,
    });
  });

  it("copies the agent Dockerfile and base Dockerfile into the staged context", async () => {
    const outputDir = path.join(outputBase, "openclaw-ctx");
    const result = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir,
      sourceCommit: "94dc7e6",
    });

    expect(fs.existsSync(path.join(result.contextPath, "Dockerfile"))).toBe(true);
    expect(fs.existsSync(path.join(result.contextPath, "Dockerfile.base"))).toBe(true);
    expect(fs.readFileSync(path.join(result.contextPath, "Dockerfile"), "utf-8")).toBe(
      "FROM scratch\n",
    );
  });

  it("writes metadata.json into the staged context", async () => {
    const outputDir = path.join(outputBase, "openclaw-meta");
    const result = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir,
      sourceCommit: "94dc7e6",
    });

    const metadataPath = path.join(result.contextPath, "metadata.json");
    expect(fs.existsSync(metadataPath)).toBe(true);
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    expect(metadata).toMatchObject({
      agent: "openclaw",
      sourceCommit: "94dc7e6",
      contextPath: result.contextPath,
    });
  });

  it("excludes node_modules and .git from the staged context", async () => {
    fs.mkdirSync(path.join(repoRoot, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "node_modules", "junk.js"), "x");
    fs.mkdirSync(path.join(repoRoot, ".git"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, ".git", "config"), "x");

    const outputDir = path.join(outputBase, "openclaw-exclude");
    const result = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir,
      sourceCommit: "94dc7e6",
    });

    expect(fs.existsSync(path.join(result.contextPath, "node_modules"))).toBe(false);
    expect(fs.existsSync(path.join(result.contextPath, ".git"))).toBe(false);
    expect(fs.existsSync(path.join(result.contextPath, "Dockerfile"))).toBe(true);
  });

  it("stages hermes agent sources from agents/hermes/", async () => {
    const hermesRoot = path.join(repoRoot, "agents", "hermes");
    fs.mkdirSync(hermesRoot, { recursive: true });
    fs.writeFileSync(path.join(hermesRoot, "Dockerfile"), "FROM hermes\n");
    fs.writeFileSync(path.join(hermesRoot, "Dockerfile.base"), "FROM hermes-base\n");
    fs.writeFileSync(path.join(hermesRoot, "hermes-config.json"), "{}");

    const outputDir = path.join(outputBase, "hermes-ctx");
    const result = await stageImageBuildContext({
      agent: "hermes",
      repoRoot,
      outputDir,
      sourceCommit: "94dc7e6",
    });

    expect(fs.existsSync(path.join(result.contextPath, "agents", "hermes", "Dockerfile"))).toBe(
      true,
    );
    expect(fs.readFileSync(path.join(result.contextPath, "Dockerfile"), "utf8")).toBe(
      "FROM hermes\n",
    );
    expect(fs.readFileSync(path.join(result.contextPath, "Dockerfile.base"), "utf8")).toBe(
      "FROM hermes-base\n",
    );
    expect(
      fs.existsSync(path.join(result.contextPath, "agents", "hermes", "hermes-config.json")),
    ).toBe(true);
  });

  it("contentHash changes when Dockerfile content changes", async () => {
    fs.writeFileSync(path.join(repoRoot, "Dockerfile"), "FROM scratch\n");
    const a = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir: path.join(outputBase, "a"),
      sourceCommit: "94dc7e6",
    });
    fs.writeFileSync(path.join(repoRoot, "Dockerfile"), "FROM ubuntu:22.04\n");
    const b = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir: path.join(outputBase, "b"),
      sourceCommit: "94dc7e6",
    });
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it("contentHash is stable across identical staged contexts", async () => {
    fs.writeFileSync(path.join(repoRoot, "Dockerfile"), "FROM scratch\n");
    fs.mkdirSync(path.join(repoRoot, "nemoclaw-blueprint"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "nemoclaw-blueprint", "blueprint.yaml"), "name: test\n");

    const a = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir: path.join(outputBase, "stable-a"),
      sourceCommit: "94dc7e6",
    });
    const b = await stageImageBuildContext({
      agent: "openclaw",
      repoRoot,
      outputDir: path.join(outputBase, "stable-b"),
      sourceCommit: "94dc7e6",
    });
    expect(a.contentHash).toBe(b.contentHash);
  });
});
