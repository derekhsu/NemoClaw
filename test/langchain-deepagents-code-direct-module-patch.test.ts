// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentDir,
  cleanupPackageFixtures,
  createPackageFixture,
  managedAutoApprovalPath,
  managedReasoningEffortPath,
  patchFixture,
  patcher,
  writeManagedAutoApproval,
  writeManagedReasoningEffort,
} from "./helpers/langchain-deepagents-code-patch-fixture";

const HARDENING_MARKER = "NemoClaw-managed Deep Agents Code hardening v2.";
const DISCLOSURE_MARKER = "NemoClaw-managed progressive tool disclosure.";
const OBSERVABILITY_MARKER = "NemoClaw-managed backend-neutral observability.";

const PATCHED_FILES = [
  "__main__.py",
  "main.py",
  "app.py",
  "auth_store.py",
  "config.py",
  "tools.py",
  "model_config.py",
  "agent.py",
  "hooks/manager.py",
  "update_check.py",
  "integrations/openai_codex.py",
  "tui/widgets/auth.py",
  "tui/widgets/codex_auth.py",
  "tui/widgets/model_selector.py",
  "tui/widgets/approval.py",
  "tui/widgets/status.py",
  "tui/widgets/welcome.py",
  "client/launch/server.py",
  "_server_config.py",
  "mcp_tools.py",
  "subagents.py",
  "client/non_interactive.py",
];

function packageFile(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, "deepagents_code", relativePath), "utf8");
}

function runPatcher(root: string) {
  return spawnSync("python3", [patcher], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, PYTHONPATH: root },
  });
}

function runHelper(root: string, script: string, env: Record<string, string> = {}) {
  return spawnSync("python3", ["-c", script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, PYTHONPATH: root, ...env },
  });
}

const HELPER_IMPORT = `
import importlib.util
import os
_helper_path = os.path.join(os.environ["PYTHONPATH"], "deepagents_code", "_nemoclaw_managed.py")
_spec = importlib.util.spec_from_file_location("nemoclaw_managed", _helper_path)
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)
`;

afterEach(() => {
  cleanupPackageFixtures();
});

describe("LangChain Deep Agents Code managed package patch", () => {
  it("applies the managed marker to every target module once", () => {
    const root = createPackageFixture();
    patchFixture(root);
    for (const relativePath of PATCHED_FILES) {
      expect(
        packageFile(root, relativePath).split(HARDENING_MARKER).length - 1,
        relativePath,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("installs the managed helper, disclosure middleware, and observability module", () => {
    const root = createPackageFixture();
    expect(runPatcher(root).status).toBe(0);
    const helper = packageFile(root, "_nemoclaw_managed.py");
    const managedRuntime = fs.readFileSync(path.join(agentDir, "managed-dcode-runtime.py"), "utf8");
    expect(helper).toBe(managedRuntime);
    for (const moduleName of ["progressive_tool_disclosure.py", "nemoclaw_observability.py"]) {
      const installed = packageFile(root, moduleName);
      const reviewed = fs.readFileSync(path.join(agentDir, moduleName), "utf8");
      expect(installed).toBe(reviewed);
    }
    expect(packageFile(root, "agent.py").split(DISCLOSURE_MARKER).length - 1).toBe(1);
    expect(packageFile(root, "agent.py").split(OBSERVABILITY_MARKER).length - 1).toBe(1);
  });

  it("wires the managed runtime into the entrypoint and non-interactive path", () => {
    const root = createPackageFixture();
    patchFixture(root);
    expect(packageFile(root, "__main__.py")).toContain(
      "from deepagents_code._nemoclaw_managed import assert_safe_runtime",
    );
    expect(packageFile(root, "main.py")).toContain("assert_safe_runtime");
    expect(packageFile(root, "client/non_interactive.py")).toContain("_nemoclaw_managed");
  });

  it("is idempotent on a second run", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const result = runPatcher(root);
    expect(result.status, result.stderr).toBe(0);
  });

  it("fails closed when the installed version drifts", () => {
    const root = createPackageFixture("0.1.31");
    const result = runPatcher(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Expected deepagents-code==0.1.71, found 0.1.31");
  });

  it("fails closed on a pre-existing managed helper", () => {
    const root = createPackageFixture();
    fs.writeFileSync(
      path.join(root, "deepagents_code", "_nemoclaw_managed.py"),
      "# forged helper\n",
    );
    const result = runPatcher(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("partial");
  });

  it("fails closed when a required app method is missing", () => {
    const root = createPackageFixture();
    const appPath = path.join(root, "deepagents_code", "app.py");
    const source = fs.readFileSync(appPath, "utf8");
    const stripped = source.replace(
      /    async def _handle_command\(/,
      "    async def _removed_handle_command(",
    );
    expect(stripped).not.toBe(source);
    fs.writeFileSync(appPath, stripped);
    const result = runPatcher(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/_handle_command|required/i);
  });

  it("fails closed when install-subprocess call sites drift", () => {
    const root = createPackageFixture();
    const updatePath = path.join(root, "deepagents_code", "update_check.py");
    const source = fs.readFileSync(updatePath, "utf8");
    const removed = source.replace("_run_install_subprocess(", "_removed_install(");
    expect(removed).not.toBe(source);
    fs.writeFileSync(updatePath, removed);
    const result = runPatcher(root);
    expect(result.status).not.toBe(0);
  });
});

describe("managed helper capability boundaries", () => {
  it("gates auto-approval on the exact managed capability file", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const script = `${HELPER_IMPORT}
import json
results = {}
results["missing"] = (m.managed_auto_approval_mode(), m.managed_auto_approval_enabled())
`;
    const missing = runHelper(root, `${script}print(json.dumps(results))`);
    expect(missing.status, missing.stderr).toBe(0);
    expect(JSON.parse(missing.stdout).missing).toEqual(["disabled", false]);

    writeManagedAutoApproval(root, "thread-opt-in\n");
    const opted = runHelper(root, `${script}print(json.dumps(results))`);
    expect(opted.status, opted.stderr).toBe(0);
    expect(JSON.parse(opted.stdout).missing).toEqual(["thread-opt-in", true]);

    writeManagedAutoApproval(root, "always\n");
    const forged = runHelper(root, `${script}print(json.dumps(results))`);
    expect(forged.status, forged.stderr).toBe(0);
    expect(JSON.parse(forged.stdout).missing).toEqual(["disabled", false]);
  });

  it("parses only exact reasoning-effort capability contents", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const script = `${HELPER_IMPORT}
print(m.managed_reasoning_effort())
`;
    const missing = runHelper(root, script);
    expect(missing.status, missing.stderr).toBe(0);
    expect(missing.stdout.trim()).toBe("None");

    for (const [contents, expected] of [
      ["low\n", "low"],
      ["medium\n", "medium"],
      ["high\n", "high"],
      ["\n", "None"],
    ]) {
      writeManagedReasoningEffort(root, contents);
      const result = runHelper(root, script);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe(expected);
    }

    writeManagedReasoningEffort(root, "turbo\n");
    const invalid = runHelper(root, script);
    expect(invalid.status, invalid.stderr).toBe(0);
    expect(invalid.stdout.trim()).toBe("None");
  });

  it("accepts only canonical descriptor paths for the managed MCP config", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const script = `${HELPER_IMPORT}
import json
print(json.dumps({
    "descriptor": m.is_managed_mcp_config_path("/proc/self/fd/12"),
    "non_numeric": m.is_managed_mcp_config_path("/proc/self/fd/nope"),
    "stray": m.is_managed_mcp_config_path("/etc/mcp.json"),
    "relative": m.is_managed_mcp_config_path("mcp.json"),
    "typed": m.is_managed_mcp_config_path(12),
}))
`;
    const result = runHelper(root, script);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      descriptor: true,
      non_numeric: false,
      stray: false,
      relative: false,
      typed: false,
    });
  });

  it("maps managed providers to their display names", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const script = `${HELPER_IMPORT}
import json
print(json.dumps({key: m.managed_display_provider(key) for key in ["nvidia", "openrouter", "unknown-provider"]}))
`;
    const result = runHelper(root, script);
    expect(result.status, result.stderr).toBe(0);
    const labels = JSON.parse(result.stdout);
    expect(labels.nvidia).toBeTruthy();
    expect(labels["unknown-provider"]).toBeTruthy();
    expect(labels.nvidia).not.toBe(labels["unknown-provider"]);
  });

  it("enforces the managed runtime environment contract", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const script = `${HELPER_IMPORT}
import os
m.assert_safe_runtime()
print(os.environ["LANGGRAPH_CLI_NO_ANALYTICS"])
`;
    const result = runHelper(root, script, { HOME: "/sandbox" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("1");

    const hostile = runHelper(
      root,
      `${HELPER_IMPORT}
m.assert_safe_runtime()
`,
      { HOME: "/sandbox", ATTACKER_API_KEY: "sk-live-secret-value" },
    );
    expect(hostile.status).not.toBe(0);
    expect(hostile.stderr).toContain("credential");
  });
});
