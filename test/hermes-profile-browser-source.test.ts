// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const fixture = (name: string) =>
  gunzipSync(
    fs.readFileSync(path.join(root, "test/fixtures/hermes-profile-browser", `${name}.py.gz`)),
  ).toString("utf8");

function patchBrowser(source: string, kind = "browser") {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-browser-source-"));
  const target = path.join(temporary, "browser.py");
  fs.writeFileSync(target, source);
  try {
    const result = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        `
import importlib.util, pathlib, sys
patcher = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(patcher.parent))
spec = importlib.util.spec_from_file_location("policy_patcher", patcher)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.patch_file(pathlib.Path(sys.argv[2]), sys.argv[3], {"browser.restrict_evaluate": True})
`,
        path.join(root, "agents/hermes/patch-profile-policy-defaults.py"),
        target,
        kind,
      ],
      {
        encoding: "utf8",
        timeout: 5000,
      },
    );
    return { ...result, source: fs.readFileSync(target, "utf8") };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

describe("Hermes reviewed browser source identities", () => {
  it("patches the complete browser source while preserving its exact NPX pin", () => {
    const original = fixture("browser_tool");
    expect(createHash("sha256").update(original).digest("hex")).toBe(
      "29598fc950902eff9b503fa1fcfd02a8e4b15673acb6e8131fdc0bde65518f51",
    );
    const result = patchBrowser(original);
    expect(result.status, result.stderr).toBe(0);
    expect(result.source).toContain('AGENT_BROWSER_NPX_SPEC = "agent-browser@0.26.0"');
    expect(result.source).toContain('env["npm_config_offline"] = "true"');
  });

  it("keeps browser evaluation restricted when raw configuration is missing", () => {
    const original = fixture("browser_tool_eval_policy");
    expect(createHash("sha256").update(original).digest("hex")).toBe(
      "80d617bf062ff9e0e87fd592e8bbaadc3c6aaef7b96d2fe3ceb49fcfecaf368a",
    );
    const result = patchBrowser(original, "browser_policy");
    expect(result.status, result.stderr).toBe(0);
    expect(result.source).toContain('return _browser_eval_flag("restrict_evaluate", default=True)');
  });

  it.each([
    ["browser_tool", "browser"],
    ["browser_tool_eval_policy", "browser_policy"],
  ])("rejects changes to the %s source without modifying it", (name, kind) => {
    const altered = `${fixture(name)}\n`;
    const result = patchBrowser(altered, kind);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not the reviewed Hermes");
    expect(result.source).toBe(altered);
  });

  it("rejects the reviewed browser identity for a different source kind", () => {
    const original = fixture("browser_tool");
    const result = patchBrowser(original, "config");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("config source");
    expect(result.source).toBe(original);
  });
});
