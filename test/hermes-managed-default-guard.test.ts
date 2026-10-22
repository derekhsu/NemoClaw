// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";

it("authenticates only fresh normalized config plus the authorized uploader", () => {
  const result = spawnSync(
    "python3",
    [
      "-c",
      String.raw`
import importlib.util, sys, hashlib, yaml, base64
spec=importlib.util.spec_from_file_location("guard",sys.argv[1])
g=importlib.util.module_from_spec(spec);sys.modules[spec.name]=g;spec.loader.exec_module(g)
original_doc={"model":{"default":"old","provider":"custom","base_url":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses"},"_nemoclaw_upstream":{"provider":"test","provider_key":"test","model":"old"},"providers":{"custom":{"api":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses"},"test":{"name":"test","api":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses","discover_models":True,"default_model":"old"}},"custom_providers":[{"name":"test","base_url":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses","discover_models":True}],"safe":True,"label":"新 sandbox"}
original=yaml.safe_dump(original_doc,sort_keys=False,allow_unicode=True).encode()
env=b"SAFE=yes\nAPI_SERVER_KEY="+b"a"*64+b"\n"
uploader={"gateway_url":"https://gateway.example","sandbox_id":"sbx."+"a"*32,"replace_existing":True}
doc=yaml.safe_load(original);doc["mcp_servers"]={"sandbox-file-uploader":g._managed_default_uploader(uploader)}
current=yaml.safe_dump(doc,sort_keys=False).encode()
anchor=hashlib.sha256(original).hexdigest()+"  /fixture/config.yaml\n"+hashlib.sha256(env).hexdigest()+"  /fixture/.env\n"+"# nemoclaw-hermes-mcp-state-v1 intended="+hashlib.sha256(b"{}").hexdigest()+" applied="+hashlib.sha256(b"{}").hexdigest()+"\n"
payload={"local_uploader":uploader}
g._prove_fresh_managed_uploader("/fixture",anchor,current,env,payload)
for bad_config,bad_env,bad_payload,bad_anchor in [
 (current+b"extra: true\n",env,payload,anchor),
 (current,env+b"EXTRA=bad\n",payload,anchor),
 (current,env,{"local_uploader":{**uploader,"sandbox_id":"sbx."+"b"*32}},anchor),
 (current,env,payload,anchor+"bad\n"),
 (current.replace(b"enabled: true",b"enabled: false"),env,payload,anchor),
 (current.replace(b"provider: custom",b"provider: legacy"),env,payload,anchor),
]:
 try:g._prove_fresh_managed_uploader("/fixture",bad_anchor,bad_config,bad_env,bad_payload)
 except g.UnsafePathError:pass
 else:raise AssertionError("unauthorized fresh inputs accepted")
`,
      path.join(import.meta.dirname, "../agents/hermes/runtime-config-guard.py"),
    ],
    { encoding: "utf-8" },
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

const transactionFixture = String.raw`
import importlib.util,sys,os,tempfile,pathlib,hashlib,yaml,json,base64
spec=importlib.util.spec_from_file_location("guard",sys.argv[1]);g=importlib.util.module_from_spec(spec);sys.modules[spec.name]=g;spec.loader.exec_module(g)
root=pathlib.Path(tempfile.mkdtemp());home=root/"sandbox"/".hermes";home.mkdir(parents=True);home.chmod(0o3770)
run=root/"run";run.mkdir();etc=root/"etc";etc.mkdir()
g.HERMES_MANAGED_DEFAULT_DIR=str(home);g.HERMES_MANAGED_DEFAULT_HASH=str(etc/"strict");g.HERMES_RESTART_STATE_FILE=str(run/"state")
g._sandbox_identity=lambda:(os.getuid(),os.getgid())
original_doc={"model":{"default":"old","provider":"custom","base_url":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses"},"_nemoclaw_upstream":{"provider":"test","provider_key":"test","model":"old"},"providers":{"custom":{"api":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses"},"test":{"name":"test","api":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses","discover_models":True,"default_model":"old"}},"custom_providers":[{"name":"test","base_url":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses","discover_models":True}],"safe":True}
original=yaml.safe_dump(original_doc,sort_keys=False,allow_unicode=True).encode()
env=b"SAFE=yes\nAPI_SERVER_KEY="+b"a"*64+b"\n";scope={"gateway_url":"https://gateway.example","sandbox_id":"sbx."+"a"*32,"replace_existing":True}
doc=yaml.safe_load(original);doc["mcp_servers"]={"sandbox-file-uploader":g._managed_default_uploader(scope)}
current=yaml.safe_dump(doc,sort_keys=False).encode();live_env=env
cp=home/"config.yaml";ep=home/".env";hp=home/".config-hash"
cp.write_bytes(current);ep.write_bytes(live_env)
for p in (cp,ep,hp):
 if p.exists():p.chmod(0o640)
empty=hashlib.sha256(b"{}").hexdigest()
anchor=hashlib.sha256(original).hexdigest()+"  "+str(cp)+"\n"+hashlib.sha256(env).hexdigest()+"  "+str(ep)+"\n# nemoclaw-hermes-mcp-state-v1 intended="+empty+" applied="+empty+"\n"
pathlib.Path(g.HERMES_MANAGED_DEFAULT_HASH).write_text(anchor);pathlib.Path(g.HERMES_MANAGED_DEFAULT_HASH).chmod(0o444)
hp.write_text(anchor);hp.chmod(0o640)
new=yaml.safe_load(current);new["model"].update({"default":"new","provider":"custom","base_url":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses"})
new["_nemoclaw_upstream"]={"provider":"test","provider_key":"test","model":"new"}
new["providers"]={"custom":{"api":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses"},"test":{"name":"test","api":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses","discover_models":True,"default_model":"new"}}
new["custom_providers"]=[{"name":"test","base_url":"https://inference.local/v1","api_key":"sk-OPENSHELL-PROXY-REWRITE","api_mode":"codex_responses","discover_models":True}]
replacement=yaml.safe_dump(new,sort_keys=False).encode()
payload={"local_uploader":scope,"config_base64":base64.b64encode(replacement).decode()}
expected=hashlib.sha256(current).hexdigest()
case=sys.argv[2]
if case=="unsupported-topology":
 g.INSTALLED_RUNTIME_CONFIG_GUARD=g.__file__
 g.os.geteuid=lambda:0
 g._startup_ready_marker_absent=lambda:True
 g._openshell_supervised_nonroot_start_is_live=lambda *a:False
 sys.argv=[g.__file__,"write-managed-default","--expected-config-sha256",expected]
 import io,contextlib
 sys.stdin=io.TextIOWrapper(io.BytesIO(json.dumps(payload).encode()))
 with contextlib.redirect_stderr(io.StringIO()):
  try:g.main()
  except SystemExit as error:assert error.code==1
  else:raise AssertionError("unsupported topology accepted")
 assert cp.read_bytes()==current and ep.read_bytes()==live_env
 assert pathlib.Path(g.HERMES_MANAGED_DEFAULT_HASH).read_text()==anchor and not pathlib.Path(g.HERMES_RESTART_STATE_FILE).exists()
elif case.startswith("tamper-"):
 target=case.removeprefix("tamper-")
 if target=="nonroute":new["safe"]=False
 elif target=="model":new["model"]["temperature"]=0.1
 elif target=="pool":new["providers"]["unrelated"]={"api_key":"bad"}
 elif target=="protocol":new["model"]["api_mode"]="unsupported"
 elif target=="url":new["model"]["base_url"]="https://attacker.example"
 elif target=="mcp":new["mcp_servers"]["extra"]={"command":"bad"}
 elif target=="scope":payload["local_uploader"]["sandbox_id"]="wrong."+"b"*32
 elif target=="env":ep.write_bytes(live_env+b"OTHER=bad\n")
 elif target=="anchor":
  pathlib.Path(g.HERMES_MANAGED_DEFAULT_HASH).chmod(0o644)
  pathlib.Path(g.HERMES_MANAGED_DEFAULT_HASH).write_text(anchor+"bad\n")
 payload["config_base64"]=base64.b64encode(yaml.safe_dump(new,sort_keys=False).encode()).decode()
 try:g.write_managed_default(expected,json.dumps(payload).encode())
 except g.UnsafePathError:pass
 else:raise AssertionError("tampered request accepted")
 assert cp.read_bytes()==current
elif case=="crash":
 child=os.fork()
 if child==0:
  write=g._write_hash;counter=[0]
  def crash(path,text):
   counter[0]+=1
   if counter[0]==3:os._exit(42)
   return write(path,text)
  g._write_hash=crash
  g.write_managed_default(expected,json.dumps(payload).encode())
  os._exit(0)
 _,status=os.waitpid(child,0)
 assert os.waitstatus_to_exitcode(status)==42
 state=g._load_restart_state(g.HERMES_RESTART_STATE_FILE)
 assert "managed_default" in state and state["phase"]=="managed-default-writing"
 try:g.unseal_restart(str(home),g.HERMES_RESTART_STATE_FILE)
 except g.UnsafePathError:pass
 else:raise AssertionError("interrupted transaction was silently recovered")
 assert (home/g.RESTART_ORPHAN_MARKER_NAME).exists()
elif case=="cas":
 try:g.write_managed_default("0"*64,json.dumps(payload).encode())
 except g.UnsafePathError:pass
 else:raise AssertionError("stale CAS accepted")
 assert cp.read_bytes()==current and pathlib.Path(g.HERMES_MANAGED_DEFAULT_HASH).read_text()==anchor
elif case=="failure":
 write=g._write_hash;count=[0]
 def fail(path,text):
  count[0]+=1
  if count[0]==3:raise OSError("injected multi-file failure")
  return write(path,text)
 g._write_hash=fail
 try:g.write_managed_default(expected,json.dumps(payload).encode())
 except OSError:pass
 else:raise AssertionError("failure accepted")
 assert cp.read_bytes()==current and ep.read_bytes()==live_env
 assert pathlib.Path(g.HERMES_MANAGED_DEFAULT_HASH).read_text()==anchor and hp.read_text()==anchor
 assert not pathlib.Path(g.HERMES_RESTART_STATE_FILE).exists()
else:
 import io,contextlib
 sys.argv=[sys.argv[1],"write-managed-default","--expected-config-sha256",expected]
 sys.stdin=io.TextIOWrapper(io.BytesIO(json.dumps(payload).encode()))
 stdout=io.StringIO()
 with contextlib.redirect_stdout(stdout):assert g.main()==0
 lines=stdout.getvalue().splitlines()
 assert len(lines)==2 and lines[0]=="prepared=1" and lines[1].startswith("lock_token=")
 token=lines[1].removeprefix("lock_token=")
 assert cp.read_bytes()==replacement and ep.read_bytes()==live_env
 state=g.inspect_managed_default_transaction(token)
 assert state["phase"]=="managed-default-prepared"
 try:g.unseal_restart(str(home),g.HERMES_RESTART_STATE_FILE)
 except g.UnsafePathError:pass
 else:raise AssertionError("ordinary unseal adopted managed transaction")
 try:g.write_managed_default(expected,json.dumps(payload).encode())
 except g.UnsafePathError:pass
 else:raise AssertionError("concurrent transaction accepted")
 try:g.finish_managed_default(token)
 except g.UnsafePathError:pass
 else:raise AssertionError("missing runtime receipt accepted")
 # Use readable Linux procfs data even when the host has no /proc (macOS).
 proc=root/"proc";process=proc/"42";process.mkdir(parents=True)
 (process/"stat").write_text("42 (hermes gateway) " + " ".join(["S", "10"] + ["0"] * 17 + ["1200"]) + "\n")
 g.PROC_ROOT=str(proc)
 state["managed_default"]["healthy"]={"gateway_pid":42,"gateway_start_time":"1200"}
 g._write_restart_state(g.HERMES_RESTART_STATE_FILE,state,create=False)
 g.finish_managed_default(token)
 assert not pathlib.Path(g.HERMES_RESTART_STATE_FILE).exists()
 # Later strict-current updates use the current authenticated anchors.
 token=g.write_managed_default(hashlib.sha256(replacement).hexdigest(),json.dumps(payload).encode())
 assert g.inspect_managed_default_transaction(token)
`;

it.each([
  "prepared",
  "unsupported-topology",
  "cas",
  "failure",
  "crash",
  "tamper-nonroute",
  "tamper-model",
  "tamper-pool",
  "tamper-protocol",
  "tamper-url",
  "tamper-mcp",
  "tamper-scope",
  "tamper-env",
  "tamper-anchor",
])("protects managed default transaction %s", (scenario) => {
  const result = spawnSync(
    "python3",
    [
      "-c",
      transactionFixture,
      path.join(import.meta.dirname, "../agents/hermes/runtime-config-guard.py"),
      scenario,
    ],
    { encoding: "utf-8" },
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});
