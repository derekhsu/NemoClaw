// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";

const helper = path.resolve(import.meta.dirname, "../agents/hermes/mcp-config-transaction.py");
it("checks fixed uploader intent without mutating config or accepting drift", () => {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import importlib.util, sys, json, types, yaml
spec = importlib.util.spec_from_file_location("tx", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
payload = {"gateway_url":"http://host.openshell.internal:8001", "sandbox_id":"sbx-test.0123456789abcdef0123456789abcdef", "replace_existing":True}
# This is the existing image-owned uploader shape, independent of the inspection.
expected = {"command":"/sandbox/.venvs/sandbox-mcp-server/bin/sandbox-mcp-server", "args":[], "env":{"GATEWAY_URL":payload["gateway_url"], "SANDBOX_ID":payload["sandbox_id"], **m.LOCAL_UPLOADER_ENV_REFS}, "enabled":True, "timeout":120, "connect_timeout":60, "tools":{"resources":True,"prompts":True}}
snapshot = types.SimpleNamespace(state="current", config_text=yaml.safe_dump({"mcp_servers":{"sandbox-file-uploader":expected}}))
checked = []
guard = types.SimpleNamespace(inspect_mcp_integrity_snapshot=lambda *args:snapshot, assert_mcp_integrity_snapshot_current=lambda value:checked.append(value))
m._load_guard = lambda:guard
m.apply_transaction_and_reload = lambda *args: (_ for _ in ()).throw(AssertionError("inspection mutated state"))
assert m.inspect_local_uploader(payload) == {"ok":True,"state":"matched"}
assert checked == [snapshot]
for field,value in [("command","/tmp/evil"), ("env",{"SANDBOX_ID":"other"})]:
    bad = dict(expected); bad[field] = value
    snapshot.config_text = yaml.safe_dump({"mcp_servers":{"sandbox-file-uploader":bad}})
    try: m.inspect_local_uploader(payload)
    except RuntimeError: pass
    else: raise AssertionError("accepted changed uploader " + field)
snapshot.state="drift"
try: m.inspect_local_uploader(payload)
except RuntimeError: pass
else: raise AssertionError("accepted hash drift")
for extra in [{"command":"/tmp/evil"}, {"sandbox_id":"wrong scope!"}]:
    try: m.inspect_local_uploader({**payload, **extra})
    except ValueError: pass
    else: raise AssertionError("accepted invalid payload")
print("verified")
`,
      helper,
    ],
    { encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe("verified");
});

it("requires payload for the read-only uploader CLI action", () => {
  const result = spawnSync("python3", [helper, "inspect-local-uploader"], { encoding: "utf8" });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain("inspection requires --payload");
});
