// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// derekhsu/NemoClaw#67: commands from `npm install -g` must be on the sandbox
// user's login-shell PATH. The image build probe exercises the real hook as the
// sandbox user in each base Dockerfile; these tests cover the hook's branches
// without a container.

const ROOT = path.resolve(import.meta.dirname, "..");
const HOOK = path.join(ROOT, "scripts", "lib", "nemoclaw-npm-global.sh");
const NPM_BIN = "/sandbox/.npm-global/bin";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-npm-global-hook-"));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

// The hook resolves the user through /usr/bin/id; swap in a fixed answer.
function hookAs(user: string): string {
  const source = fs.readFileSync(HOOK, "utf-8");
  expect(source).toContain('"$(/usr/bin/id -un 2>/dev/null || true)"');
  const copy = path.join(tmp, `hook-${user}.sh`);
  fs.writeFileSync(copy, source.replace("/usr/bin/id -un", `echo ${user}`));
  return copy;
}

function sourceHook(
  user: string,
  env: Record<string, string> = {},
  times = 1,
): { path: string; prefix: string; upperPrefix: string } {
  const hook = hookAs(user);
  const script = [
    `for _ in $(seq ${times}); do . "${hook}"; done`,
    'printf "path=%s\\n" "$PATH"',
    'printf "prefix=%s\\n" "${npm_config_prefix:-}"',
    'printf "upper=%s\\n" "${NPM_CONFIG_PREFIX:-}"',
  ].join("\n");
  const result = spawnSync("sh", ["-c", script], {
    encoding: "utf-8",
    env: { PATH: "/usr/bin:/bin", ...env },
  });
  expect(result.status, result.stderr).toBe(0);
  const values = Object.fromEntries(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/s, 2) as [string, string]),
  );
  return { path: values.path, prefix: values.prefix, upperPrefix: values.upper };
}

describe("nemoclaw-npm-global profile hook", () => {
  it("sets the sandbox prefix and appends its bin directory once", () => {
    const result = sourceHook("sandbox", {}, 2);
    expect(result.prefix).toBe("/sandbox/.npm-global");
    expect(result.path).toBe(`/usr/bin:/bin:${NPM_BIN}`);
  });

  it("leaves other users alone", () => {
    for (const user of ["root", "gateway", "hermesapi"]) {
      const result = sourceHook(user);
      expect(result.prefix).toBe("");
      expect(result.path).toBe("/usr/bin:/bin");
    }
  });

  it("keeps a prefix that is already set", () => {
    expect(sourceHook("sandbox", { npm_config_prefix: "/tmp/npm-global" }).prefix).toBe(
      "/tmp/npm-global",
    );
    const upper = sourceHook("sandbox", { NPM_CONFIG_PREFIX: "/opt/custom" });
    expect(upper.prefix).toBe("");
    expect(upper.upperPrefix).toBe("/opt/custom");
    expect(upper.path).toBe(`/usr/bin:/bin:${NPM_BIN}`);
  });
});
