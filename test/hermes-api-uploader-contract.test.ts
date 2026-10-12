// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";
const guard = path.resolve(import.meta.dirname, "../agents/hermes/runtime-config-guard.py");
it("registers only the canonical uploader in the API profile", () => {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import importlib.util,sys,yaml
from unittest.mock import patch
s=importlib.util.spec_from_file_location("guard",sys.argv[1]); g=importlib.util.module_from_spec(s);sys.modules[s.name]=g;s.loader.exec_module(g)
payload={"gateway_url":"http://gateway.test:8001","sandbox_id":"sbx-test."+"a"*32,"replace_existing":True}
canonical={"command":"/sandbox/.venvs/sandbox-mcp-server/bin/sandbox-mcp-server","env":{}}
with patch.object(g,"_managed_default_uploader",return_value=canonical):
    updated=g._api_uploader_config({"model":{"default":"test"}},payload)
assert updated["mcp_servers"]["sandbox-file-uploader"]["command"] == canonical["command"]
assert canonical["env"] == {}
assert updated["mcp_servers"]["sandbox-file-uploader"]["env"]["CLAWSHELL_UPLOADER_PROFILE"]=="api"
assert updated["platform_toolsets"]["api_server"]==["file","mcp-sandbox-file-uploader"]
assert updated["model"]=={"default":"test"}
try:
    g._api_uploader_config({"mcp_servers":{"other":{"command":"evil"}}},payload)
except g.UnsafePathError: pass
else: raise AssertionError("arbitrary MCP accepted")
`,
      guard,
    ],
    { encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
});
