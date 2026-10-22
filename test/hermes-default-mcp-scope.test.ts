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
const GUARD = path.resolve(import.meta.dirname, "..", "agents/hermes/runtime-config-guard.py");

function runPython(source: string, args: string[] = []) {
  return spawnSync("python3", ["-c", source, TRANSACTION, GUARD, ...args], {
    encoding: "utf8",
  });
}

describe("Hermes scoped default MCP registration", () => {
  it("persists the ClawShell sandbox scope header in the default MCP entry", () => {
    const result = runPython(`
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("mcp_tx", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
payload = {
    "server": "clawshell-gateway", "url": "https://mcp.example.com:8443/",
    "headers": {
        "Authorization": "Bearer openshell:resolve:env:GATEWAY_API_KEY",
        "X-ClawShell-Sandbox-Id": "sbx-hermes-1." + "a" * 32,
    },
    "replace_existing": True,
}
module._validate_payload("add", payload)
updated, changed = module._mutate({}, "add", payload)
module._validate_inspection_payload({"present": updated["mcp_servers"], "absent": []})
print(json.dumps({"changed": changed, "entry": updated["mcp_servers"]["clawshell-gateway"]}))
`);
    expect(result.status, result.stderr).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.changed).toBe(true);
    expect(data.entry.headers).toEqual({
      Authorization: "Bearer openshell:resolve:env:GATEWAY_API_KEY",
      "X-ClawShell-Sandbox-Id": `sbx-hermes-1.${"a".repeat(32)}`,
    });
  });

  it.each([
    { server: "other-server", scope: `sbx-1.${"a".repeat(32)}`, extra: {} },
    { server: "clawshell-gateway", scope: "sbx-1", extra: {} },
    { server: "clawshell-gateway", scope: `sbx-1.${"A".repeat(32)}`, extra: {} },
    { server: "clawshell-gateway", scope: `sbx-1.${"a".repeat(32)}\r\nX-Evil: 1`, extra: {} },
    { server: "clawshell-gateway", scope: `sbx-1.${"a".repeat(32)}`, extra: { "X-Evil": "1" } },
  ])("rejects invalid ClawShell scope or extra headers: $server $scope", ({
    server,
    scope,
    extra,
  }) => {
    const result = runPython(
      `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("mcp_tx", sys.argv[1])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
payload = json.loads(sys.argv[3])
try:
    module._validate_payload("add", payload)
except ValueError:
    print("rejected")
else:
    raise SystemExit(9)
`,
      [
        JSON.stringify({
          server,
          url: "https://mcp.example.com/",
          replace_existing: true,
          headers: {
            Authorization: "Bearer openshell:resolve:env:GATEWAY_API_KEY",
            "X-ClawShell-Sandbox-Id": scope,
            ...extra,
          },
        }),
      ],
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("rejected");
  });
});
