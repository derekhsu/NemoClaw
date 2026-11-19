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

// The managed policy layout the generator writes: JSON.stringify(policy, null, 2).
const BASE_POLICY_OBJECT = {
  schema_version: 1,
  config: {
    approvals: { mode: "manual" },
    browser: { allow_unsafe_evaluate: false, restrict_evaluate: true },
    database: { temp_store: 2 },
    model: { default: "nvidia/model", api_key: "sk-OPENSHELL-PROXY-REWRITE" },
  },
  env_lines: ["API_SERVER_HOST=127.0.0.1"],
  dashboard: { routing_keys: ["model"], env_keys: ["API_SERVER_HOST"] },
  managed_paths: [
    "approvals.mode",
    "browser.allow_unsafe_evaluate",
    "browser.restrict_evaluate",
    "database.temp_store",
  ],
};
const BASE_POLICY = `${JSON.stringify(BASE_POLICY_OBJECT, null, 2)}\n`;

function configure(text: string, policyText = BASE_POLICY) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-hermes-tools-browser-"));
  try {
    const file = path.join(dir, "config.yaml");
    const policyFile = path.join(dir, "managed-policy.json");
    fs.writeFileSync(file, text);
    fs.writeFileSync(policyFile, policyText);
    const result = spawnSync("python3", [SCRIPT, file, policyFile], {
      encoding: "utf8",
      timeout: 10_000,
    });
    return {
      result,
      written: fs.readFileSync(file, "utf8"),
      policy: fs.readFileSync(policyFile, "utf8"),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("Hermes tools image browser backend (#74, #79)", () => {
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
  ])("refuses a config with %s and leaves both files unchanged", (_name, text, message) => {
    const { result, written, policy } = configure(text);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(written).toBe(text);
    expect(policy).toBe(BASE_POLICY);
  });

  it("manages browser.backend off in the policy and changes nothing else (#79)", () => {
    const { result, policy } = configure(BASE_CONFIG);

    expect(result.status, result.stderr).toBe(0);
    const expected = structuredClone(BASE_POLICY_OBJECT);
    Object.assign(expected.config.browser, { backend: "off" });
    expected.managed_paths.splice(3, 0, "browser.backend");
    expect(policy).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  });

  const withBackend = structuredClone(BASE_POLICY_OBJECT);
  Object.assign(withBackend.config.browser, { backend: "browser-use" });
  const withPath = structuredClone(BASE_POLICY_OBJECT);
  withPath.managed_paths.push("browser.backend");
  const withoutBrowserPath = structuredClone(BASE_POLICY_OBJECT);
  withoutBrowserPath.managed_paths = ["approvals.mode"];

  it.each([
    ["a browser backend", JSON.stringify(withBackend), "already sets"],
    ["a managed browser.backend path", JSON.stringify(withPath), "already sets"],
    ["no browser.restrict_evaluate path", JSON.stringify(withoutBrowserPath), "does not manage"],
    ["malformed JSON", "{", "Expecting"],
  ])("refuses a policy with %s and leaves both files unchanged", (_name, policyText, message) => {
    const { result, written, policy } = configure(BASE_CONFIG, policyText);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(written).toBe(BASE_CONFIG);
    expect(policy).toBe(policyText);
  });

  it("requires both the config and the policy path", () => {
    const result = spawnSync("python3", [SCRIPT, "config.yaml"], {
      encoding: "utf8",
      timeout: 10_000,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("<managed-policy.json>");
  });
});
