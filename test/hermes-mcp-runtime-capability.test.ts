// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dockerRunCommandBetween } from "./helpers/dockerfile-run-shell";

const ROOT = path.resolve(import.meta.dirname, "..");
const HERMES_DOCKERFILE = path.join(ROOT, "agents", "hermes", "Dockerfile");

function runHermesMcpClientImportValidation({
  mcpAvailable,
  httpAvailable,
  sdkAvailable = true,
  target,
}: {
  mcpAvailable: boolean;
  httpAvailable: boolean;
  sdkAvailable?: boolean;
  target: "image" | "resolver";
}) {
  const dockerfile = fs.readFileSync(HERMES_DOCKERFILE, "utf-8");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-hermes-mcp-runtime-"));
  const toolsDir = path.join(tmp, "tools");
  const imageCommand = dockerRunCommandBetween(
    dockerfile,
    "# Managed MCP requires the packaged Hermes client surface",
    "# Published base images can lag Dockerfile.base",
  ).replaceAll("/opt/hermes/.venv/bin/python", "python3");
  const resolverSource = fs.readFileSync(
    path.join(ROOT, ".github/actions/resolve-hermes-base-image/action.yaml"),
    "utf8",
  );
  const resolverProbe = resolverSource.match(/'([^'\n]*from tools import mcp_tool[^'\n]*)'/u)?.[1];
  if (!resolverProbe) throw new Error("Hermes base resolver MCP probe is missing");
  const command = target === "image" ? imageCommand : `python3 -c '${resolverProbe}'`;
  try {
    fs.mkdirSync(toolsDir, { recursive: true });
    fs.writeFileSync(path.join(tmp, "mcp.py"), "# MCP SDK fixture\n");
    fs.writeFileSync(path.join(toolsDir, "__init__.py"), "");
    fs.writeFileSync(
      path.join(toolsDir, "mcp_tool.py"),
      `_MCP_AVAILABLE = ${mcpAvailable ? "True" : "False"}\n` +
        `_MCP_HTTP_AVAILABLE = False\n` +
        `def _ensure_mcp_sdk():\n    global _MCP_HTTP_AVAILABLE\n    _MCP_HTTP_AVAILABLE = ${httpAvailable ? "True" : "False"}\n    return ${sdkAvailable ? "True" : "False"}\n`,
    );
    return spawnSync("bash", ["-c", command], {
      encoding: "utf-8",
      env: { ...process.env, PYTHONPATH: tmp },
      timeout: 5000,
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe.each([
  "image",
  "resolver",
] as const)("Hermes %s MCP client import capability", (target) => {
  const run = (input: Omit<Parameters<typeof runHermesMcpClientImportValidation>[0], "target">) =>
    runHermesMcpClientImportValidation({ ...input, target });
  it("loads Streamable HTTP support before checking its availability", () => {
    const result = run({ mcpAvailable: true, httpAvailable: true });
    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects a failed Hermes SDK load", () => {
    const result = run({
      mcpAvailable: true,
      httpAvailable: true,
      sdkAvailable: false,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Hermes MCP SDK failed to load");
  });

  it("rejects unavailable Hermes MCP support", () => {
    const result = run({ mcpAvailable: false, httpAvailable: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Hermes MCP client runtime is unavailable");
  });

  it("fails the final image build without packaged Streamable HTTP client support", () => {
    const complete = run({
      mcpAvailable: true,
      httpAvailable: true,
    });
    expect(complete.status, complete.stderr).toBe(0);

    const missingHttp = run({
      mcpAvailable: true,
      httpAvailable: false,
    });
    expect(missingHttp.status).toBe(1);
    expect(missingHttp.stderr).toContain("Hermes MCP Streamable HTTP runtime is unavailable");
  });
});
