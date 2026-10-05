# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Verify the installed uploader without network access or production credentials."""

import contextlib,hashlib,importlib.util,io,json,logging,os,pathlib,stat,subprocess,sys
import httpx
from sandbox_mcp_server.gateway_client import GatewayClient,GatewayError
from sandbox_mcp_server.server import create_server

assert sys.prefix == "/sandbox/.venvs/sandbox-mcp-server", sys.prefix
assert create_server().name == "sandbox-file-uploader"
tree=pathlib.Path(sys.prefix)
unsafe=[]
for path in [tree,*tree.rglob("*")]:
    info=path.stat()
    if info.st_uid != 0 or info.st_gid != 0 or info.st_mode & 0o022:
        unsafe.append(str(path))
assert not unsafe, unsafe[:5]
entry=tree/"bin/sandbox-mcp-server"
assert entry.is_file() and os.access(entry,os.X_OK)
transaction_path=pathlib.Path("/usr/local/lib/nemoclaw/hermes-mcp-config-transaction.py")
spec=importlib.util.spec_from_file_location("transaction",transaction_path)
transaction=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=transaction
spec.loader.exec_module(transaction)
for name in ["GATEWAY_API_KEY","GATEWAY_CUSTOM_TOKEN","OPENSHELL_TLS_KEY"]:
    assert transaction._credential_name_is_reserved(name), name
candidate=transaction._managed_local_uploader_candidate({"gateway_url":"http://host.openshell.internal:8001","sandbox_id":"sbx-probe."+("a"*32)})
assert candidate["command"] == str(entry)
assert candidate["env"]["GATEWAY_API_KEY"] == "${GATEWAY_API_KEY}"

key="7"*64
os.environ.update(GATEWAY_URL="http://gateway.test",GATEWAY_API_KEY=key,SANDBOX_ID="sbx-probe."+("a"*32))
requests=[]
import sandbox_mcp_server.gateway_client as installed_client
import sandbox_mcp_server.server as installed_server
file_path=installed_client.__file__
def handler(request):
    assert request.headers["X-Gateway-Api-Key"] == key
    assert request.url.path == "/api/sandboxes/sbx-probe."+("a"*32)+"/files/generate-download-url"
    assert json.loads(request.content) == {"path":file_path,"expires_in_seconds":300,"max_uses":5}
    requests.append(request.url.path)
    return httpx.Response(200,json={"data":{"download_url":"/download/signed-probe"}})
output=io.StringIO()
loghandler=logging.StreamHandler(output)
logging.getLogger().addHandler(loghandler)
with contextlib.redirect_stdout(output),contextlib.redirect_stderr(output):
    with GatewayClient.from_env() as client:
        client._client._transport.close()
        client._client._transport=httpx.MockTransport(handler)
        client._client._mounts={}
        assert client.upload_file(file_path)["download_url"] == "/download/signed-probe"
    assert client._client.is_closed
    del os.environ["GATEWAY_API_KEY"]
    try:
        GatewayClient.from_env()
    except GatewayError:
        pass
    else:
        raise AssertionError("Missing credential accepted")
logging.getLogger().removeHandler(loghandler)
assert key not in output.getvalue()
versions=subprocess.check_output(["dpkg-query","-W","-f=${Package}=${Version}\\n","libssl3t64","perl-base"],text=True)
assert "libssl3t64=3.5.7-1~deb13u3" in versions,versions
hashes={}
for relative,module in [("src/sandbox_mcp_server/gateway_client.py",installed_client),("src/sandbox_mcp_server/server.py",installed_server)]:
    hashes[relative]=hashlib.sha256(pathlib.Path(module.__file__).read_bytes()).hexdigest()
assert hashes["src/sandbox_mcp_server/gateway_client.py"] == sys.argv[1]
assert hashes["src/sandbox_mcp_server/server.py"] == sys.argv[2]
print(json.dumps({"runtime":"new-installed-image","server":"sandbox-file-uploader","unsafe_files":len(unsafe),"request_count":len(requests),"credential_leak":False,"package_versions":versions,"source_hashes":hashes},indent=2))
