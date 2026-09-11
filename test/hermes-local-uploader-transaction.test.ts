// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const TRANSACTION = path.resolve(
  import.meta.dirname,
  "..",
  "agents/hermes/mcp-config-transaction.py",
);

function runPython(source: string, args: string[] = []) {
  return spawnSync("python3", ["-c", source, TRANSACTION, ...args], {
    encoding: "utf8",
  });
}

describe("Hermes managed local uploader transaction", () => {
  it("accepts the fixed payload and produces a stdio MCP candidate", () => {
    const result = runPython(`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("mcp_tx", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
payload = {
    "gateway_url": "http://10.206.110.59:8001",
    "sandbox_id": "sbx-c84c5391",
    "replace_existing": True,
}
module._validate_local_uploader_payload(payload)
candidate = module._local_uploader_candidate(payload)
print(json.dumps(candidate, sort_keys=True))
`);

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      command: "/sandbox/.venvs/sandbox-mcp-server/bin/sandbox-mcp-server",
      args: [],
      enabled: true,
      env: {
        CURL_CA_BUNDLE: "${CURL_CA_BUNDLE}",
        DENO_CERT: "${DENO_CERT}",
        GATEWAY_API_KEY: "${GATEWAY_API_KEY}",
        GATEWAY_URL: "http://10.206.110.59:8001",
        HTTP_PROXY: "${HTTP_PROXY}",
        HTTPS_PROXY: "${HTTPS_PROXY}",
        NODE_EXTRA_CA_CERTS: "${NODE_EXTRA_CA_CERTS}",
        REQUESTS_CA_BUNDLE: "${REQUESTS_CA_BUNDLE}",
        SANDBOX_ID: "sbx-c84c5391",
        SSL_CERT_DIR: "${SSL_CERT_DIR}",
        SSL_CERT_FILE: "${SSL_CERT_FILE}",
      },
    });
  });

  it("rejects unreviewed local uploader input", () => {
    const result = runPython(`
import importlib.util, sys
spec = importlib.util.spec_from_file_location("mcp_tx", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
for payload in [
    {"gateway_url": "http://10.206.110.59:8001", "sandbox_id": "sbx-c84c5391", "replace_existing": True, "command": "/bin/sh"},
    {"gateway_url": "http://10.206.110.59:8001", "sandbox_id": "sbx-c84c5391", "replace_existing": True, "env": {"SECRET": "literal"}},
    {"gateway_url": "http://10.206.110.59:8001", "sandbox_id": "", "replace_existing": True},
]:
    try:
        module._validate_local_uploader_payload(payload)
    except ValueError:
        continue
    raise SystemExit(1)
`);
    expect(result.status, result.stderr).toBe(0);
  });

  it("recognizes only the exact persisted local uploader candidate", () => {
    const result = runPython(`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("mcp_tx", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
candidate = module._local_uploader_candidate({
    "gateway_url": "http://10.206.110.59:8001",
    "sandbox_id": "sbx-c84c5391",
    "replace_existing": True,
})
print(json.dumps({
    "valid": module._is_local_uploader_candidate(candidate),
    "altered": module._is_local_uploader_candidate({**candidate, "enabled": False}),
}))
`);

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ valid: true, altered: false });
  });
});
