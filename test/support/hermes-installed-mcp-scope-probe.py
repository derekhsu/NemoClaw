# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Verify the installed default MCP scope contract without network or writes."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

helper = Path("/usr/local/lib/nemoclaw/hermes-mcp-config-transaction.py")
assert hashlib.sha256(helper.read_bytes()).hexdigest() == sys.argv[1]
spec = importlib.util.spec_from_file_location("mcp_tx", helper)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
assert module.CONFIG_PATH == "/sandbox/.hermes/config.yaml"
payload = {
    "server": "clawshell-gateway",
    "url": "https://mcp.example.com/",
    "replace_existing": True,
    "headers": {
        "Authorization": "Bearer openshell:resolve:env:GATEWAY_API_KEY",
        "X-ClawShell-Sandbox-Id": "sbx-fixture." + "a" * 32,
    },
}
module._validate_payload("add", payload)
updated, changed = module._mutate({}, "add", payload)
assert changed
module._validate_inspection_payload({"present": updated["mcp_servers"], "absent": []})
assert updated["mcp_servers"]["clawshell-gateway"]["headers"] == payload["headers"]
for server, credential in [("other", "GATEWAY_API_KEY"), ("clawshell-gateway", "OPENAI_API_KEY")]:
    rejected = {**payload, "server": server, "headers": {**payload["headers"],
        "Authorization": "Bearer openshell:resolve:env:" + credential}}
    try:
        module._validate_payload("add", rejected)
    except ValueError:
        pass
    else:
        raise AssertionError("reserved credential boundary accepted")
print(json.dumps({"installed_mcp_scope_contract": "passed", "default_root": "preserved"}))
