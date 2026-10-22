// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runUploaderImageAssembly } from "./support/hermes-uploader-image-harness";

const root = path.resolve(import.meta.dirname, "..");

describe("Hermes managed local uploader image contract", () => {
  it("runs frozen uploader assembly and starts the protected stdio entrypoint", () => {
    const run = runUploaderImageAssembly();
    expect(run.result.status, run.result.stderr).toBe(0);
    expect(run.install).toEqual({
      args: ["sync", "--frozen", "--no-dev", "--no-editable", "--no-cache"],
      target: run.environment,
    });
    expect(run.ownership).toEqual(["-R", "root:root", run.environment]);
    expect(run.executableMode).toBe(0o755);
    expect(run.entrypoint.status, run.entrypoint.stderr).toBe(0);
    expect(JSON.parse(run.entrypoint.stdout)).toEqual({
      name: "sandbox-file-uploader",
      transport: "stdio",
    });
  });

  it("stops image assembly when frozen package installation fails", () => {
    const run = runUploaderImageAssembly(12);
    expect(run.result.status).toBe(12);
    expect(run.ownership).toBeNull();
    expect(run.executableMode).toBeNull();
  });

  it("authenticates delivery requests without logging credentials or probing sockets", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-uploader-client-"));
    try {
      const file = path.join(directory, "report.txt");
      fs.writeFileSync(file, "delivery proof");
      const key = "synthetic-provider-key-do-not-log";
      const result = spawnSync(
        "python3",
        [
          "-I",
          "-B",
          path.join(root, "test/support/hermes-uploader-client-probe.py"),
          path.join(root, "vendor/clawshell/sandbox-mcp-server/src"),
          file,
        ],
        {
          encoding: "utf8",
          timeout: 5000,
          env: {
            ...process.env,
            PYTHONDONTWRITEBYTECODE: "1",
            GATEWAY_URL: "http://gateway.example.test:8001",
            GATEWAY_API_KEY: key,
            SANDBOX_ID: "sbx-fixture",
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout + result.stderr).not.toContain(key);
      expect(JSON.parse(result.stdout)).toEqual({
        requests: [
          {
            url: "/api/sandboxes/sbx-fixture/files/generate-download-url",
            body: { path: file, expires_in_seconds: 300, max_uses: 5 },
            authenticated: true,
          },
        ],
        closed: [true],
        link: { download_url: "/download/signed-report" },
        missing: "Missing required environment variable: GATEWAY_API_KEY",
        output: "",
      });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reserves Gateway controls while rendering the fixed uploader credential placeholder", () => {
    const result = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('tx', sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
payload = {'gateway_url': 'http://gateway.example.test:8001', 'sandbox_id': 'sbx-fixture', 'replace_existing': True}
module._validate_local_uploader_payload('add-local-uploader', payload)
candidate = module._managed_local_uploader_candidate(payload)
rejected = []
for key in ('GATEWAY_API_KEY', 'GATEWAY_CUSTOM_TOKEN', 'OPENSHELL_TLS_KEY'):
    try:
        module._validate_payload('add', {'server': 'remote', 'url': 'https://mcp.example.test/', 'headers': {'Authorization': 'Bearer openshell:resolve:env:' + key}, 'replace_existing': True})
    except ValueError:
        rejected.append(key)
module._validate_payload('add', {'server': 'remote', 'url': 'https://mcp.example.test/', 'headers': {'Authorization': 'Bearer openshell:resolve:env:EXTERNAL_SERVICE_TOKEN'}, 'replace_existing': True})
print(json.dumps({'command': candidate['command'], 'key': candidate['env']['GATEWAY_API_KEY'], 'url': candidate['env']['GATEWAY_URL'], 'rejected': rejected}))
`,
        path.join(root, "agents/hermes/mcp-config-transaction.py"),
      ],
      { encoding: "utf8", timeout: 5000 },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      command: "/sandbox/.venvs/sandbox-mcp-server/bin/sandbox-mcp-server",
      key: "${GATEWAY_API_KEY}",
      url: "http://gateway.example.test:8001",
      rejected: ["GATEWAY_API_KEY", "GATEWAY_CUSTOM_TOKEN", "OPENSHELL_TLS_KEY"],
    });
  });
});
