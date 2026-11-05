// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const root = path.join(import.meta.dirname, "..");
const patcher = path.join(root, "agents", "hermes", "patch-mcp-http-proxy.py");
const fixtures: string[] = [];

// The Hermes v0.21.3 shapes the patch anchors on: the _present helper and the
// inner transport of the SSE and Streamable HTTP client factories.
const present = [
  "def _present(**kwargs) -> dict:",
  '    """*kwargs* minus the ``None`` values (optional httpx client arguments)."""',
  "    return {k: v for k, v in kwargs.items() if v is not None}",
  "",
].join("\n");
const sseTransport =
  "_httpx_mod.AsyncHTTPTransport(verify=ssl_verify, **_present(cert=client_cert))";
const httpTransport = "httpx.AsyncHTTPTransport(verify=ssl_verify, **_present(cert=client_cert))";
const unpatchedSource = [
  present,
  "",
  "def sse(url, ssl_verify, client_cert, _httpx_mod):",
  `    return ${sseTransport}`,
  "",
  "",
  "def streamable(url, ssl_verify, client_cert, httpx):",
  `    return ${httpTransport}`,
  "",
].join("\n");

// Imports the patched fixture with a recording transport and prints the
// keyword arguments each factory passed for the given URL.
const runner = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("fixture", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
class Recorder:
    def AsyncHTTPTransport(self, **kwargs):
        return kwargs
url = sys.argv[2]
print(json.dumps({
    "sse": mod.sse(url, True, None, Recorder()),
    "streamable": mod.streamable(url, True, "/c.pem", Recorder()),
}, sort_keys=True))
`;

function fixtureFile(source: string): string {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-hermes-mcp-proxy-"));
  fixtures.push(fixture);
  const module = path.join(fixture, "mcp_tool_transport.py");
  fs.writeFileSync(module, source);
  return module;
}

function runPatcher(module: string) {
  return spawnSync("python3", ["-I", patcher, module], {
    encoding: "utf8",
    timeout: 5000,
  });
}

function transportKwargs(module: string, url: string, proxyEnv: Record<string, string>) {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
  };
  Object.assign(env, proxyEnv);
  return spawnSync("python3", ["-I", "-c", runner, module, url], {
    encoding: "utf8",
    timeout: 5000,
    env,
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

describe("Hermes MCP HTTP proxy patch", () => {
  const proxyEnv = {
    https_proxy: "http://10.200.0.1:3128",
    no_proxy: "localhost,127.0.0.1",
  };

  it("passes the environment proxy to both MCP HTTP transports (#53)", () => {
    const module = fixtureFile(unpatchedSource);

    const patched = runPatcher(module);
    const proxied = transportKwargs(module, "https://gateway.example/mcp/", proxyEnv);

    expect(patched.status, patched.stderr).toBe(0);
    expect(proxied.status, proxied.stderr).toBe(0);
    expect(JSON.parse(proxied.stdout)).toEqual({
      sse: { verify: true, proxy: "http://10.200.0.1:3128" },
      streamable: {
        verify: true,
        cert: "/c.pem",
        proxy: "http://10.200.0.1:3128",
      },
    });
  });

  it("keeps direct transports for no_proxy hosts and without a proxy (#53)", () => {
    const module = fixtureFile(unpatchedSource);

    const patched = runPatcher(module);
    const bypassed = transportKwargs(module, "http://127.0.0.1:8642/mcp", proxyEnv);
    const unset = transportKwargs(module, "https://gateway.example/mcp/", {});

    expect(patched.status, patched.stderr).toBe(0);
    for (const run of [bypassed, unset]) {
      expect(run.status, run.stderr).toBe(0);
      expect(JSON.parse(run.stdout)).toEqual({
        sse: { verify: true },
        streamable: { verify: true, cert: "/c.pem" },
      });
    }
  });

  it("accepts its own patched output unchanged (#53)", () => {
    const module = fixtureFile(unpatchedSource);
    const first = runPatcher(module);
    const once = fs.readFileSync(module, "utf8");

    const second = runPatcher(module);

    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(fs.readFileSync(module, "utf8")).toBe(once);
  });

  it.each([
    ["missing SSE transport", unpatchedSource.replace(sseTransport, "None")],
    ["duplicate Streamable HTTP transport", `${unpatchedSource}\nx = ${httpTransport}\n`],
    ["moved helper anchor", unpatchedSource.replace(present, "")],
  ])("rejects a %s without writing (#53)", (_case, source) => {
    const module = fixtureFile(source);

    const result = runPatcher(module);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Hermes MCP HTTP transport shape changed");
    expect(fs.readFileSync(module, "utf8")).toBe(source);
  });
});
