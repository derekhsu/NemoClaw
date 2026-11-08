// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const START_SCRIPT = path.resolve(import.meta.dirname, "../scripts/nemoclaw-start.sh");
const SOURCE = fs.readFileSync(START_SCRIPT, "utf8");

function slice(startMarker: string, endMarker: string): string {
  const start = SOURCE.indexOf(startMarker);
  const end = SOURCE.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

const PROXY_BLOCK = slice("# ── Proxy environment", "# Corporate proxy CA merge");
const PROXY_NAMES = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
];

/** Run the entrypoint's proxy block and report the proxy variables it leaves. */
function proxyEnvironment(env: Record<string, string>): Record<string, string> {
  const script = [
    "set -euo pipefail",
    PROXY_BLOCK,
    `for name in ${PROXY_NAMES.join(" ")}; do printf '%s=%s\\n' "$name" "\${!name-<unset>}"; done`,
  ].join("\n");
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    timeout: 5_000,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...env },
  });
  expect(result.status, result.stderr).toBe(0);
  return Object.fromEntries(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/s, 2) as [string, string]),
  );
}

const unset = Object.fromEntries(PROXY_NAMES.map((name) => [name, "<unset>"]));

describe("nemoclaw-start proxy environment on OpenShell 0.1.x (NemoClaw#33)", () => {
  it("keeps the 0.0.x explicit proxy by default", () => {
    expect(proxyEnvironment({ NEMOCLAW_PROXY_HOST: "10.200.0.1" })).toMatchObject({
      HTTPS_PROXY: "http://10.200.0.1:3128",
      https_proxy: "http://10.200.0.1:3128",
      NO_PROXY: "localhost,127.0.0.1,::1,10.200.0.1",
    });
  });

  it("clears inherited proxy routing and ignores the baked 0.0.x address on 0.1.x", () => {
    expect(
      proxyEnvironment({
        NEMOCLAW_OPENSHELL_LINE: "0.1",
        NEMOCLAW_PROXY_HOST: "10.200.0.1",
        HTTP_PROXY: "http://10.200.0.1:3128",
        https_proxy: "http://10.200.0.1:3128",
        NO_PROXY: "localhost",
      }),
    ).toEqual(unset);
  });

  it("still honours an operator proxy other than the 0.0.x address on 0.1.x", () => {
    expect(
      proxyEnvironment({
        NEMOCLAW_OPENSHELL_LINE: "0.1",
        NEMOCLAW_PROXY_HOST: "proxy.corp.example",
        NEMOCLAW_PROXY_PORT: "8080",
      }),
    ).toMatchObject({
      HTTPS_PROXY: "http://proxy.corp.example:8080",
      no_proxy: "localhost,127.0.0.1,::1,proxy.corp.example",
    });
  });
});

describe("nemoclaw-start runtime shell env file on OpenShell 0.1.x (NemoClaw#33)", () => {
  const writerBlock = slice("write_runtime_shell_env() {", "# cleanup_on_signal");

  function writeRuntimeEnv(proxyUrl: string): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-01x-proxy-env-"));
    try {
      const proxyEnv = path.join(tmpDir, "proxy-env.sh");
      const writer = [
        "set -euo pipefail",
        'emit_sandbox_sourced_file() { local target="$1"; cat > "$target"; }',
        `_PROXY_URL="${proxyUrl}"`,
        `_NO_PROXY_VAL="${proxyUrl ? "localhost,127.0.0.1,::1,proxy.corp.example" : ""}"`,
        "emit_messaging_connect_runtime_preload_exports() { :; }",
        "_TOOL_REDIRECTS=()",
        "set +u",
        `${writerBlock.replaceAll("/tmp/nemoclaw-proxy-env.sh", proxyEnv)}\nwrite_runtime_shell_env`,
        // Sourcing the file must leave no proxy variable behind on 0.1.x.
        `export HTTP_PROXY=http://10.200.0.1:3128 https_proxy=http://10.200.0.1:3128`,
        `. "${proxyEnv}"`,
        `printf 'after-source HTTP_PROXY=%s https_proxy=%s\\n' "\${HTTP_PROXY-<unset>}" "\${https_proxy-<unset>}"`,
        `cat "${proxyEnv}"`,
      ].join("\n");
      const result = spawnSync("bash", ["-c", writer], { encoding: "utf8", timeout: 5_000 });
      expect(result.status, result.stderr).toBe(0);
      return result.stdout;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  it("unsets proxy variables instead of exporting empty ones without a proxy", () => {
    const output = writeRuntimeEnv("");
    expect(output).toContain("after-source HTTP_PROXY=<unset> https_proxy=<unset>");
    expect(output).toContain("unset HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY");
    expect(output).not.toContain('export HTTP_PROXY=""');
  });

  it("exports the explicit proxy when one is configured", () => {
    const output = writeRuntimeEnv("http://proxy.corp.example:8080");
    expect(output).toContain('export HTTPS_PROXY="http://proxy.corp.example:8080"');
    expect(output).toContain(
      "after-source HTTP_PROXY=http://proxy.corp.example:8080 https_proxy=http://proxy.corp.example:8080",
    );
  });
});

describe("Dockerfile managed proxy entry for OpenShell 0.1.x (NemoClaw#33)", () => {
  const dockerfile = fs.readFileSync(path.resolve(import.meta.dirname, "../Dockerfile"), "utf8");
  const startMarker = 'RUN PATH=/usr/bin:/bin python3 -c "\\\n';
  const start = dockerfile.indexOf(startMarker);
  const end = dockerfile.indexOf('os.chmod(path, 0o600)"', start);
  // Docker joins each backslash-newline continuation into one shell line.
  const program = dockerfile
    .slice(start + startMarker.length, end + "os.chmod(path, 0o600)".length)
    .replaceAll("\\\n", "");

  function managedProxy(env: Record<string, string>): Record<string, unknown> {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-01x-managed-proxy-"));
    try {
      fs.mkdirSync(path.join(home, ".openclaw"));
      const config = path.join(home, ".openclaw", "openclaw.json");
      fs.writeFileSync(config, JSON.stringify({ gateway: { auth: { token: "x" } } }));
      const result = spawnSync("python3", ["-c", program], {
        encoding: "utf8",
        timeout: 5_000,
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home, ...env },
      });
      expect(result.status, result.stderr).toBe(0);
      return JSON.parse(fs.readFileSync(config, "utf8")).proxy;
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }

  it.each([
    ["0.0.x default", { NEMOCLAW_PROXY_HOST: "10.200.0.1" }, true, "http://10.200.0.1:3128"],
    [
      "0.1.x with the baked 0.0.x address",
      { NEMOCLAW_OPENSHELL_LINE: "0.1", NEMOCLAW_PROXY_HOST: "10.200.0.1" },
      false,
      "http://10.200.0.1:3128",
    ],
    [
      "0.1.x without a proxy host",
      { NEMOCLAW_OPENSHELL_LINE: "0.1" },
      false,
      "http://10.200.0.1:3128",
    ],
    [
      "0.1.x operator proxy",
      {
        NEMOCLAW_OPENSHELL_LINE: "0.1",
        NEMOCLAW_PROXY_HOST: "proxy.corp.example",
        NEMOCLAW_PROXY_PORT: "8080",
      },
      true,
      "http://proxy.corp.example:8080",
    ],
  ])("writes the managed proxy for %s", (_case, env, enabled, proxyUrl) => {
    expect(managedProxy(env)).toEqual({ enabled, proxyUrl, loopbackMode: "gateway-only" });
  });
});
