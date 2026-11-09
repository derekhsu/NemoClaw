// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve(
  import.meta.dirname,
  "../tools/openclaw-tools-image/configure-browser.py",
);

const BASE_CONFIG = {
  gateway: { auth: { token: "x" } },
  tools: { toolSearch: false, alsoAllow: ["bundle-mcp"] },
};

function configure(line: string, config: Record<string, unknown> = BASE_CONFIG) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-tools-browser-"));
  try {
    const file = path.join(dir, "openclaw.json");
    const original = `${JSON.stringify(config, null, 2)}\n`;
    fs.writeFileSync(file, original);
    const result = spawnSync("python3", [SCRIPT, line, file], {
      encoding: "utf8",
      timeout: 10_000,
    });
    const written = fs.readFileSync(file, "utf8");
    return { result, written, original, config: JSON.parse(written) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("tools image browser tool config (NemoClaw#27)", () => {
  it("leaves OpenShell 0.0.x configs unchanged", () => {
    const { result, written, original } = configure("0.0");

    expect(result.status, result.stderr).toBe(0);
    expect(written).toBe(original);
  });

  it("turns on the browser tool for OpenShell 0.1.x", () => {
    const { result, config } = configure("0.1");

    expect(result.status, result.stderr).toBe(0);
    expect(config.browser).toEqual({
      enabled: true,
      executablePath: "/usr/lib/chromium/chromium",
      headless: true,
      noSandbox: true,
      extraArgs: ["--no-zygote", "--disable-gpu"],
      ssrfPolicy: { allowRfc2544BenchmarkRange: true },
    });
    expect(config.tools).toEqual({ toolSearch: false, alsoAllow: ["bundle-mcp", "browser"] });
    expect(config.gateway).toEqual(BASE_CONFIG.gateway);
  });

  it("creates the tool allow list when the base config has none", () => {
    const { result, config } = configure("0.1", { gateway: {} });

    expect(result.status, result.stderr).toBe(0);
    expect(config.tools).toEqual({ alsoAllow: ["browser"] });
  });

  it.each([
    ["an unknown OpenShell line", "0.2", BASE_CONFIG, "unknown OpenShell line"],
    [
      "a base config that already sets browser",
      "0.1",
      { ...BASE_CONFIG, browser: {} },
      "already sets browser",
    ],
  ])("refuses %s and leaves the file unchanged", (_case, line, config, message) => {
    const { result, written, original } = configure(line, config);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(written).toBe(original);
  });
});
