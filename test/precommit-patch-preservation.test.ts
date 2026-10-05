// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "..");

it("preserves patch context and signature bytes while trimming ordinary source", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "prek-patch-preservation-"));
  try {
    const configuration = YAML.parse(
      fs.readFileSync(path.join(root, ".pre-commit-config.yaml"), "utf8"),
    );
    const hook = configuration.repos
      .flatMap((repo: { hooks: { id: string; exclude?: string }[] }) => repo.hooks)
      .find((candidate: { id: string }) => candidate.id === "trailing-whitespace");
    fs.writeFileSync(
      path.join(directory, ".pre-commit-config.yaml"),
      YAML.stringify({
        repos: [{ repo: "builtin", hooks: [{ id: hook.id, exclude: hook.exclude }] }],
      }),
    );
    fs.mkdirSync(path.join(directory, "skills/example"), { recursive: true });
    const patch = "--- a/example\n+++ b/example\n@@ -1,2 +1,2 @@\n-before\n+after\n \n";
    fs.writeFileSync(path.join(directory, "example.patch"), patch);
    fs.writeFileSync(path.join(directory, "example.ts"), "const value = 1;  \n");
    fs.writeFileSync(path.join(directory, "skills/example/skill.oms.sig"), "signature  \n");
    const init = spawnSync("git", ["init", "-q"], { cwd: directory, encoding: "utf8" });
    expect(init.status, init.stderr).toBe(0);
    const run = spawnSync(
      path.join(root, "node_modules/.bin/prek"),
      ["run", "--files", "example.patch", "example.ts", "skills/example/skill.oms.sig"],
      { cwd: directory, encoding: "utf8" },
    );
    expect(run.status, run.stderr + run.stdout).toBe(1);
    expect(fs.readFileSync(path.join(directory, "example.patch"), "utf8")).toBe(patch);
    expect(fs.readFileSync(path.join(directory, "skills/example/skill.oms.sig"), "utf8")).toBe(
      "signature  \n",
    );
    expect(fs.readFileSync(path.join(directory, "example.ts"), "utf8")).toBe("const value = 1;\n");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
