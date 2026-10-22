// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOCKERFILE = path.join(ROOT, "Dockerfile");

function openclawStateRepairCommand(): string {
  const dockerfile = fs.readFileSync(DOCKERFILE, "utf-8");
  const [, instruction] = dockerfile.match(
    /# Flatten stale published base images[\s\S]*?\nRUN ([\s\S]*?)\n\n# Stale-base fallback for the gateway\/root-in-sandbox-group setup/,
  )!;
  return instruction.trim().replace(/\\\n/g, " ");
}

function runStateRepairCase(
  relativeTarget: string,
  setup: (target: string, temporaryRoot: string) => void,
) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-openclaw-unsafe-state-"));
  const sandboxRoot = path.join(temporaryRoot, "sandbox");
  const openclawDir = path.join(sandboxRoot, ".openclaw");
  const target = path.join(openclawDir, relativeTarget);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  setup(target, temporaryRoot);
  const originalStat = fs.lstatSync(target, { throwIfNoEntry: false });
  const logPath = path.join(temporaryRoot, "calls.log");
  const command = openclawStateRepairCommand()
    .replaceAll("/sandbox/.openclaw-data", path.join(sandboxRoot, ".openclaw-data"))
    .replaceAll("/sandbox/.openclaw", openclawDir)
    .replaceAll("/sandbox/.npm", path.join(sandboxRoot, ".npm"))
    .replaceAll("/tmp/nemoclaw-legacy-openclaw-layout", path.join(temporaryRoot, "legacy-marker"))
    .replaceAll("/root/.npm", path.join(temporaryRoot, "root-npm"));
  const script = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `call_log=${JSON.stringify(logPath)}`,
    'install() { local target="${*: -1}"; mkdir -p "$target"; }',
    'chown() { printf "chown %s\\n" "$*" >> "$call_log"; }',
    'chmod() { printf "chmod %s\\n" "$*" >> "$call_log"; command chmod "$@"; }',
    ...(process.platform === "darwin" ? ['stat() { command stat -f "%l" "${@: -1}"; }'] : []),
    command,
  ].join("\n");
  const scriptPath = path.join(temporaryRoot, "run-state-repair.sh");
  fs.writeFileSync(scriptPath, script, { mode: 0o700 });
  const run = () => spawnSync("bash", [scriptPath], { encoding: "utf-8", timeout: 5000 });
  const result = run();
  return { result, target, temporaryRoot, openclawDir, originalStat, logPath, run };
}

it.each([
  { label: "missing", contents: undefined },
  { label: "zero-byte", contents: "" },
])("leaves $label legacy exec approvals absent after image repair (#3)", ({ contents }) => {
  const fixture = runStateRepairCase("exec-approvals.json", (target) => {
    if (contents !== undefined) fs.writeFileSync(target, contents);
  });
  try {
    expect(fixture.result.status, fixture.result.stderr).toBe(0);
    expect(fs.existsSync(fixture.target)).toBe(false);
    const retry = fixture.run();
    expect(retry.status, retry.stderr).toBe(0);
    expect(fs.existsSync(fixture.target)).toBe(false);
    expect(fs.existsSync(fixture.logPath)).toBe(false);
    expect(fs.readdirSync(path.join(fixture.openclawDir, "state"))).toEqual([]);
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

it.each([
  { label: "populated policy", contents: '{"version":1,"defaults":{"security":"deny"}}\n' },
  { label: "JSON stub", contents: '{"version":1,"defaults":{},"agents":{}}\n' },
  { label: "malformed policy", contents: "not-json\n" },
  { label: "whitespace", contents: " \n" },
])("preserves $label and SQLite state for OpenClaw migration (#3)", ({ contents }) => {
  const sqliteFiles = [
    "openclaw.sqlite",
    "openclaw.sqlite-wal",
    "openclaw.sqlite-shm",
    "openclaw.sqlite-journal",
  ];
  const fixture = runStateRepairCase("exec-approvals.json", (target) => {
    fs.writeFileSync(target, contents, { mode: 0o600 });
    const stateDir = path.join(path.dirname(target), "state");
    fs.mkdirSync(stateDir);
    for (const file of sqliteFiles) {
      fs.writeFileSync(path.join(stateDir, file), Buffer.from(`sqlite-fixture:${file}\0`));
    }
  });
  try {
    expect(fixture.result.status, fixture.result.stderr).toBe(0);
    expect(fs.readFileSync(fixture.target, "utf8")).toBe(contents);
    expect(fs.statSync(fixture.target).mode & 0o777).toBe(0o660);
    const calls = fs.readFileSync(fixture.logPath, "utf8");
    expect(calls).toContain(`chown sandbox:sandbox ${fixture.target}\n`);
    for (const file of sqliteFiles) {
      const statePath = path.join(fixture.openclawDir, "state", file);
      expect(fs.readFileSync(statePath)).toEqual(Buffer.from(`sqlite-fixture:${file}\0`));
      expect(fs.statSync(statePath).mode & 0o777).toBe(0o660);
      expect(calls).toContain(`chown sandbox:sandbox ${statePath}\n`);
    }
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }
});

it.each([
  {
    label: "dangling exec approvals symlink",
    relativeTarget: "exec-approvals.json",
    setup: (target: string, temporaryRoot: string) => {
      fs.symlinkSync(path.join(temporaryRoot, "missing-policy.json"), target);
    },
  },
  {
    label: "zero-byte hard-linked exec approvals",
    relativeTarget: "exec-approvals.json",
    setup: (target: string, temporaryRoot: string) => {
      const outside = path.join(temporaryRoot, "outside-empty-exec-approvals.json");
      fs.writeFileSync(outside, "");
      fs.linkSync(outside, target);
    },
  },
  {
    label: "exec approvals directory",
    relativeTarget: "exec-approvals.json",
    setup: (target: string) => {
      fs.mkdirSync(target);
    },
  },
  {
    label: "symlinked exec approvals",
    relativeTarget: "exec-approvals.json",
    setup: (target: string, temporaryRoot: string) => {
      const outside = path.join(temporaryRoot, "outside-exec-approvals.json");
      fs.writeFileSync(outside, "{}\n");
      fs.symlinkSync(outside, target);
    },
  },
  {
    label: "hard-linked exec approvals",
    relativeTarget: "exec-approvals.json",
    setup: (target: string, temporaryRoot: string) => {
      const outside = path.join(temporaryRoot, "outside-exec-approvals.json");
      fs.writeFileSync(outside, "{}\n");
      fs.linkSync(outside, target);
    },
  },
  {
    label: "hard-linked SQLite state",
    relativeTarget: "state/openclaw.sqlite",
    setup: (target: string, temporaryRoot: string) => {
      const outside = path.join(temporaryRoot, "outside-openclaw.sqlite");
      fs.writeFileSync(outside, "sqlite-fixture");
      fs.linkSync(outside, target);
    },
  },
])("rejects $label before changing its inode", ({ relativeTarget, setup }) => {
  const fixture = runStateRepairCase(relativeTarget, setup);
  try {
    expect(fixture.result.status).not.toBe(0);
    expect(fixture.result.stderr).toContain(
      `ERROR: refusing unsafe OpenClaw state file: ${fixture.target}`,
    );
    const after = fs.lstatSync(fixture.target);
    expect(after.ino).toBe(fixture.originalStat?.ino);
    expect(after.mode).toBe(fixture.originalStat?.mode);
    expect(after.size).toBe(fixture.originalStat?.size);
    expect(after.nlink).toBe(fixture.originalStat?.nlink);
    const calls = fs.existsSync(fixture.logPath) ? fs.readFileSync(fixture.logPath, "utf8") : "";
    expect(calls).not.toContain(` ${fixture.target}\n`);
  } finally {
    fs.rmSync(fixture.temporaryRoot, { recursive: true, force: true });
  }
});
