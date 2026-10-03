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
  it.each([
    [
      "local",
      "66008422f53a218dd7be5b1f5f3573a92254b75abba6f99f84e111e03a3e1b36",
      "agent-browser@^0.26.0",
    ],
    [
      "public",
      "b43608826bb10f9bf919ca97757bf36fc95247bd8b14fa8626a113c639cfd73e",
      "agent-browser@0.26.0",
    ],
  ])("patches the complete %s source while preserving its browser version pin", (name, digest, version) => {
    const original = fixture(name);
    expect(createHash("sha256").update(original).digest("hex")).toBe(digest);
    const result = patchBrowser(original);
    expect(result.status, result.stderr).toBe(0);
    expect(result.source).toContain(`AGENT_BROWSER_NPX_SPEC = "${version}"`);
    expect(result.source).toContain('cfg_get(cfg, "browser", "restrict_evaluate"), default=True');
    expect(result.source).toContain("config errors fail restricted.");
  });

  it.each(["local", "public"])("rejects changes to the %s source without modifying it", (name) => {
    const altered = `${fixture(name)}\n`;
    const result = patchBrowser(altered);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not the reviewed Hermes");
    expect(result.source).toBe(altered);
  });

  it("rejects the reviewed browser identity for a different source kind", () => {
    const original = fixture("public");
    const result = patchBrowser(original, "config");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("config source");
    expect(result.source).toBe(original);
  });
});
