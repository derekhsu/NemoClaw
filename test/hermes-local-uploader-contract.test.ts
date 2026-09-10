// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const TRANSACTION = path.join(
  import.meta.dirname,
  "..",
  "agents",
  "hermes",
  "mcp-config-transaction.py",
);

describe("Hermes managed local uploader contract", () => {
  it("accepts only the fixed uploader payload and produces its canonical stdio config", () => {
    const result = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        String.raw`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("hermes_mcp_transaction", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

payload = {
    "gateway_url": "http://gateway.example.test:8001",
    "sandbox_id": "sbx-12345678",
    "replace_existing": True,
}
module._validate_local_uploader_payload("add-local-uploader", payload)
candidate = module._managed_local_uploader_candidate(payload)
config, changed = module._mutate(
    {"mcp_servers": {"sandbox-file-uploader": candidate}},
    "add-local-uploader",
    payload,
)

rejected = []
for field, value in (
    ("command", "sh"),
    ("args", ["-c", "id"]),
    ("env", {"GATEWAY_API_KEY": "raw-key"}),
    ("gateway_api_key", "raw-key"),
):
    bad = dict(payload)
    bad[field] = value
    try:
        module._validate_local_uploader_payload("add-local-uploader", bad)
    except ValueError:
        rejected.append(field)

print(json.dumps({"candidate": candidate, "changed": changed, "config": config, "rejected": rejected}, sort_keys=True))
`,
        TRANSACTION,
      ],
      { encoding: "utf8", timeout: 5000 },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      candidate: {
        args: [],
        command: "/sandbox/.venvs/sandbox-mcp-server/bin/sandbox-mcp-server",
        connect_timeout: 60,
        enabled: true,
        env: {
          CURL_CA_BUNDLE: "${CURL_CA_BUNDLE}",
          DENO_CERT: "${DENO_CERT}",
          GATEWAY_API_KEY: "${GATEWAY_API_KEY}",
          GATEWAY_URL: "http://gateway.example.test:8001",
          HTTPS_PROXY: "${HTTPS_PROXY}",
          HTTP_PROXY: "${HTTP_PROXY}",
          NODE_EXTRA_CA_CERTS: "${NODE_EXTRA_CA_CERTS}",
          REQUESTS_CA_BUNDLE: "${REQUESTS_CA_BUNDLE}",
          SANDBOX_ID: "sbx-12345678",
          SSL_CERT_DIR: "${SSL_CERT_DIR}",
          SSL_CERT_FILE: "${SSL_CERT_FILE}",
        },
        timeout: 120,
        tools: { prompts: true, resources: true },
      },
      changed: false,
      config: {
        mcp_servers: {
          "sandbox-file-uploader": {
            args: [],
            command: "/sandbox/.venvs/sandbox-mcp-server/bin/sandbox-mcp-server",
            connect_timeout: 60,
            enabled: true,
            env: {
              CURL_CA_BUNDLE: "${CURL_CA_BUNDLE}",
              DENO_CERT: "${DENO_CERT}",
              GATEWAY_API_KEY: "${GATEWAY_API_KEY}",
              GATEWAY_URL: "http://gateway.example.test:8001",
              HTTPS_PROXY: "${HTTPS_PROXY}",
              HTTP_PROXY: "${HTTP_PROXY}",
              NODE_EXTRA_CA_CERTS: "${NODE_EXTRA_CA_CERTS}",
              REQUESTS_CA_BUNDLE: "${REQUESTS_CA_BUNDLE}",
              SANDBOX_ID: "sbx-12345678",
              SSL_CERT_DIR: "${SSL_CERT_DIR}",
              SSL_CERT_FILE: "${SSL_CERT_FILE}",
            },
            timeout: 120,
            tools: { prompts: true, resources: true },
          },
        },
      },
      rejected: ["command", "args", "env", "gateway_api_key"],
    });
  });
});
