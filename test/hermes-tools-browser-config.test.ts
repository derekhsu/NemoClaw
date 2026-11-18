// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve(import.meta.dirname, "../agents/hermes-01x/configure-tools-browser.py");

// The managed config layout the Hermes 0.1.x base image writes.
const BASE_CONFIG = [
  "# Managed by NemoClaw — Hermes configuration",
  "_config_version: 44",
  "approvals:",
  "  mode: manual",
  "browser:",
  "  allow_unsafe_evaluate: false",
  "  restrict_evaluate: true",
  "database:",
  "  temp_store: 2",
  "terminal:",
  "  backend: local",
  "  timeout: 180",
  "",
].join("\n");

function configure(text: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-hermes-tools-browser-"));
  try {
    const file = path.join(dir, "config.yaml");
    fs.writeFileSync(file, text);
    const result = spawnSync("python3", [SCRIPT, file], { encoding: "utf8", timeout: 10_000 });
    return { result, written: fs.readFileSync(file, "utf8") };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("Hermes tools image browser backend (#74)", () => {
  it("sets browser.backend to off and changes no other line", () => {
    const { result, written } = configure(BASE_CONFIG);

    expect(result.status, result.stderr).toBe(0);
    expect(written).toBe(BASE_CONFIG.replace("browser:\n", 'browser:\n  backend: "off"\n'));
  });

  it("does not take the terminal backend for a browser backend", () => {
    const { result, written } = configure(BASE_CONFIG);

    expect(result.status, result.stderr).toBe(0);
    expect(written).toContain("terminal:\n  backend: local\n");
    expect(written.match(/backend:/g)).toHaveLength(2);
  });

  it.each([
    [
      "an existing browser backend",
      BASE_CONFIG.replace("browser:\n", "browser:\n  backend: browser-use\n"),
      "already set",
    ],
    ["no browser block", BASE_CONFIG.replace(/browser:\n(  .*\n)+/, ""), "found 0"],
    ["two browser blocks", `${BASE_CONFIG}browser:\n  restrict_evaluate: true\n`, "found 2"],
    ["an empty browser block", BASE_CONFIG.replace(/browser:\n(  .*\n)+/, "browser:\n"), "empty"],
  ])("refuses a config with %s and leaves it unchanged", (_name, text, message) => {
    const { result, written } = configure(text);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(written).toBe(text);
  });
});
