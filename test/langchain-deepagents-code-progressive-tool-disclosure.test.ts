// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPackageFixtures,
  createPackageFixture,
  patchFixture,
} from "./helpers/langchain-deepagents-code-patch-fixture";

const repoRoot = path.resolve(import.meta.dirname, "..");
const agentDir = path.join(repoRoot, "agents", "langchain-deepagents-code");
const middlewarePath = path.join(agentDir, "progressive_tool_disclosure.py");
const observabilityPath = path.join(agentDir, "nemoclaw_observability.py");
const patcherPath = path.join(agentDir, "patch-managed-deepagents-code.py");
const harnessPath = path.join(
  repoRoot,
  "test",
  "fixtures",
  "deepagents-progressive-disclosure-harness.py",
);

const HARDENING_MARKER = "NemoClaw-managed Deep Agents Code hardening v2.";
const DISCLOSURE_MARKER = "NemoClaw-managed progressive tool disclosure.";
const OBSERVABILITY_MARKER = "NemoClaw-managed backend-neutral observability.";

function packageFile(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, "deepagents_code", relativePath), "utf8");
}

function runPatcher(root: string) {
  return spawnSync("python3", [patcherPath], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, PYTHONPATH: root },
  });
}

function runHarness(
  scenario: "behavior" | "overflow" | "persistence" | "isolation" | "namespace",
  target = middlewarePath,
) {
  const result = spawnSync("python3", [harnessPath, scenario, target], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

afterEach(() => {
  cleanupPackageFixtures();
});

describe("Deep Agents progressive tool disclosure", () => {
  it("keeps only core tools visible and discovers name/description matches cumulatively", () => {
    const result = runHarness("behavior");
    expect(result.initial).toEqual(["ls", "search_tools", "read_file"]);
    expect(result.discovered).toEqual(["Weather_Forecast", "query_database"]);
    expect(result.async).toEqual([
      "Weather_Forecast",
      "ls",
      "query_database",
      "search_tools",
      "read_file",
    ]);
    expect(result.max_query_length).toBe(256);
    expect(result.provider_native_preserved).toBe(true);
  });

  it("bounds broad catalog output, persisted discovery, and visible schemas deterministically", () => {
    const result = runHarness("overflow");
    expect(result.result_limit).toBe(20);
    expect(result.description_chars).toBe(256);
    expect(result.output_bytes_limit).toBe(8192);
    expect(result.output_bytes).toBeLessThanOrEqual(8192);
    expect(result.discovered_count).toBe(20);
    expect(result.discovery_limit).toBe(64);
    expect(result.discovery_name_bytes).toBe(120);
    expect(result.discovery_state_bytes_limit).toBe(8192);
    expect(result.discovery_state_bytes).toBeLessThanOrEqual(8192);
    expect(result.long_state_count).toBe(64);
    expect(result.state_count).toBe(64);
    expect(result.single_schema_bytes_limit).toBe(16384);
    expect(result.visible_schema_bytes_limit).toBe(131072);
    expect(result.visible_schema_count).toBeGreaterThan(0);
    expect(result.visible_schema_count).toBeLessThan(64);
    expect(result.oversized_schema_omitted).toBe(true);
    expect(result.state_blocked).toBe(true);
    expect(result.schema_blocked).toBe(true);
    expect(result.search_to_request_consistent).toBe(true);
    expect(result.core_schema_limits_exempt).toBe(true);
    expect(result.reducer_associative).toBe(true);
    expect(result.concurrent_response_bounded).toBe(true);
    expect(result.sequential_visibility_monotonic).toBe(true);
    expect(result.duplicate_first_wins).toBe(true);
    expect(result.empty_names_preserved).toBe(true);
    expect(result.provider_native_preserved).toBe(true);
  });

  it("restores discovered tools after compaction and session reconstruction", () => {
    const result = runHarness("persistence");
    expect(result.resumed).toContain("Weather_Forecast");
    expect(result.unknown).not.toContain("Weather_Forecast");
  });

  it("isolates graph threads and local-subagent middleware instances", () => {
    const result = runHarness("isolation");
    expect(result.thread_a).toContain("Weather_Forecast");
    expect(result.thread_b).not.toContain("Weather_Forecast");
  });

  it("rejects duplicate callable names and non-managed reserved-name owners", () => {
    const result = runHarness("namespace");
    expect(result.safe_mcp).toBe(true);
    expect(result.regular_regular).toContain("multiple registered implementations");
    expect(result.regular_mcp).toContain("MCP metadata owners");
    expect(result.cross_mcp).toContain("multiple MCP owners");
    expect(result.reserved_regular).toContain("non-managed owner of reserved name 'read_file'");
    expect(result.reserved_mcp).toContain("non-managed owner of reserved name 'search_tools'");
  });
});

describe("Deep Agents 0.1.71 progressive-disclosure build patch", () => {
  it("installs the disclosure and observability modules byte-identically", () => {
    const root = createPackageFixture();
    patchFixture(root);
    expect(packageFile(root, "progressive_tool_disclosure.py")).toBe(
      fs.readFileSync(middlewarePath, "utf8"),
    );
    expect(packageFile(root, "nemoclaw_observability.py")).toBe(
      fs.readFileSync(observabilityPath, "utf8"),
    );
  });

  it("marks the agent module exactly once for each managed boundary", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const agent = packageFile(root, "agent.py");
    expect(agent.split(DISCLOSURE_MARKER).length - 1).toBe(1);
    expect(agent.split(OBSERVABILITY_MARKER).length - 1).toBe(1);
    expect(agent.split(HARDENING_MARKER).length - 1).toBeGreaterThanOrEqual(1);
    expect(agent).toContain("ProgressiveToolDisclosureMiddleware");
    expect(agent).toContain("assert_unique_callable_tool_names");
  });

  it("is idempotent and leaves patched sources byte-identical", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const agentPath = path.join(root, "deepagents_code", "agent.py");
    const modulePath = path.join(root, "deepagents_code", "progressive_tool_disclosure.py");
    const firstBytes = {
      agent: fs.readFileSync(agentPath, "utf8"),
      module: fs.readFileSync(modulePath, "utf8"),
    };
    const second = runPatcher(root);
    expect(second.status, second.stderr).toBe(0);
    expect(fs.readFileSync(agentPath, "utf8")).toBe(firstBytes.agent);
    expect(fs.readFileSync(modulePath, "utf8")).toBe(firstBytes.module);
  });

  it("fails closed on the pinned package version before changing source", () => {
    const root = createPackageFixture("0.1.31");
    const result = runPatcher(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Expected deepagents-code==0.1.71, found 0.1.31");
  });

  it("rejects a partial progressive sentinel without changing package source", () => {
    const root = createPackageFixture();
    const agentPath = path.join(root, "deepagents_code", "agent.py");
    fs.appendFileSync(agentPath, `\n# ${DISCLOSURE_MARKER}\n`);
    const before = fs.readFileSync(agentPath, "utf8");
    const result = runPatcher(root);
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(agentPath, "utf8")).toBe(before);
  });

  it("refuses to overwrite a conflicting installed middleware module", () => {
    const root = createPackageFixture();
    fs.writeFileSync(
      path.join(root, "deepagents_code", "progressive_tool_disclosure.py"),
      "# conflicting module\n",
    );
    const result = runPatcher(root);
    expect(result.status).not.toBe(0);
  });

  it("refuses to overwrite a conflicting installed observability module", () => {
    const root = createPackageFixture();
    fs.writeFileSync(
      path.join(root, "deepagents_code", "nemoclaw_observability.py"),
      "# conflicting module\n",
    );
    const result = runPatcher(root);
    expect(result.status).not.toBe(0);
  });
});
