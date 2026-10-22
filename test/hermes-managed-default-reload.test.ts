// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { buildHermesManagedPolicy } from "../agents/hermes/config/managed-policy";
import { extractShellFunction, runHermesBashHarness } from "./support/hermes-shell-harness";
import { describe, expect, it } from "vitest";

const helper = path.join(import.meta.dirname, "..", "scripts", "managed-gateway-control.py");
const program = `
import importlib.util, sys, json
spec = importlib.util.spec_from_file_location("control", sys.argv[1])
c = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = c
spec.loader.exec_module(c)
nonce, token = "a"*64, "b"*64
assert c._validate_request(["reload-managed-default",nonce,token]) == ("reload-managed-default",nonce,token)
for args in (["reload-managed-default",nonce], ["restart",nonce,token], ["reload-managed-default",nonce,"B"*64]):
    try: c._validate_request(args)
    except c.ControlError: pass
    else: raise AssertionError(args)
class Identity:
    def __init__(self,pid): self.pid=pid; self.start_time=pid*100; self.uids=(1000,)*4
    def stable_key(self): return (self.pid,self.start_time)
class Reader:
    def __enter__(self): return self
    def __exit__(self,*args): pass
old,new,supervisor = Identity(20),Identity(21),Identity(10)
results=[]
for fail in ("none","inspect","stop","health","seed","receipt","race"):
    trace=[]
    c.ProcReader=Reader
    c._detect_agent=lambda: "hermes"
    c._discover_supervisor=lambda reader: supervisor
    c._agent_spec=lambda *args: c.AgentSpec("hermes",18642,readiness_checks=((18643,"/p/api/health"),))
    c._gateway_candidates=lambda *args: [old]
    c._acquire_expected_exit_lock=lambda *args: "lock"
    c._controller_process_identity=lambda *args: Identity(30)
    def inspect(*args):
        trace.append("inspect")
        if fail=="inspect" or (fail=="race" and trace.count("inspect")==2): raise c.ControlError("GATEWAY_CONFIG_HASH_MISMATCH")
    c._inspect_managed_default_transaction=inspect
    def publish(*args,**kwargs): trace.append("publish"); return "lease"
    c._publish_expected_exit_lease=publish
    def stop(*args):
        trace.append("stop")
        if fail=="stop": raise c.ControlError("GATEWAY_FAILED")
    c._terminate_gateway=stop
    def healthy(*args,**kwargs):
        trace.append("health")
        assert not args[2].readiness_checks
        if fail=="health": raise c.ControlError("GATEWAY_HEALTH_TIMEOUT")
        return new
    c._wait_for_healthy_gateway=healthy
    c._recapture_exact_identity=lambda reader,identity: identity
    c._gateway_healthy=lambda *args: True
    def seed(*args):
        trace.append("seed")
        if fail=="seed": raise c.ControlError("GATEWAY_FAILED")
    c._seed_managed_default_dashboard=seed
    def receipt(*args):
        trace.append("receipt")
        if fail=="receipt": raise c.ControlError("GATEWAY_FAILED")
    c._mark_managed_default_healthy=receipt
    c._clear_expected_exit_lease=lambda *args: trace.append("cleanup")
    c._close_expected_exit_lock=lambda *args: trace.append("unlock")
    try:
        result=c._reload_managed_default(nonce,token)
        assert fail=="none" and result==("ok",20,21)
    except c.ControlError:
        assert fail!="none"
    results.append({"failure":fail,"trace":trace})
print(json.dumps(results))
`;

describe("managed Hermes default reload", () => {
  it("requires a token and preserves the pending seal on stop, health, seed, and receipt failures", () => {
    const result = spawnSync("python3", ["-c", program, helper], { encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    const cases = JSON.parse(result.stdout) as { failure: string; trace: string[] }[];
    expect(cases[0].trace).toEqual([
      "inspect",
      "publish",
      "stop",
      "health",
      "seed",
      "inspect",
      "receipt",
      "cleanup",
    ]);
    expect(cases[1].trace).toEqual(["inspect", "unlock"]);
    expect(cases[2].trace).not.toContain("health");
    for (const entry of cases.slice(3)) expect(entry.trace.at(-1)).toBe("cleanup");
    expect(cases[3].trace).not.toContain("seed");
    expect(cases[4].trace).not.toContain("receipt");
    expect(cases[6].trace).not.toContain("receipt");
  });
});

describe("managed default supervisor launch", () => {
  it("launches only the default child without normal preparation or API repair", () => {
    const source = fs.readFileSync(
      path.join(import.meta.dirname, "../agents/hermes/start.sh"),
      "utf8",
    );
    const result = runHermesBashHarness([
      'HERMES_MANAGED_DEFAULT_TOKEN="' + "b".repeat(64) + '"',
      "INTERNAL_PORT=18642",
      "apply_shields_up_runtime_env() { echo env; }",
      "launch_hermes_gateway_current_user() { echo launch; GATEWAY_PID=20; }",
      "wait_for_hermes_gateway_internal() { echo health; }",
      "refresh_hermes_supervised_child_pids() { echo refresh; }",
      "prepare_hermes_nonroot_runtime() { echo forbidden; return 1; }",
      "ensure_hermes_supervised_auxiliaries() { echo forbidden; return 1; }",
      "commit_hermes_mcp_applied_if_pending() { echo forbidden; return 1; }",
      extractShellFunction(source, "recover_hermes_managed_default_current_user"),
      "recover_hermes_managed_default_current_user",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("env\nlaunch\nhealth\nrefresh\n");
  });
});

describe("managed default dashboard routing", () => {
  it("preserves dashboard tools and environment while verifying the routing readback", () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "managed-default-seed-")));
    const policy = buildHermesManagedPolicy(
      {
        model: "gpt-5.6-luna",
        baseUrl: "https://inference.local/v1",
        providerKey: "nvidia-router",
        upstreamProvider: "OpenAI",
        inferenceApi: "openai-completions",
        contextWindow: 128000,
        toolDisclosure: "progressive",
        webSearchProvider: "tavily",
        messagingCredentialPlaceholders: [],
        managedToolGateways: { brokerEnabled: false, presets: [] },
        managedImageCapabilityUnion: false,
      },
      {},
    );
    fs.writeFileSync(path.join(dir, "policy.json"), JSON.stringify(policy));
    const script = String.raw`
import importlib.util, sys, json, pathlib, yaml
source=pathlib.Path(sys.argv[1]); directory=pathlib.Path(sys.argv[2])
spec=importlib.util.spec_from_file_location("seed",source)
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
policy=json.loads((directory/"policy.json").read_text())
gateway=policy["config"]
(directory/"gateway.yaml").write_text(yaml.safe_dump(gateway))
original={"tools":{"custom":"preserve"},"mcp_servers":{"local":{"command":"keep"}},"web":{"custom":True}}
(directory/"config.yaml").write_text(yaml.safe_dump(original))
(directory/".env").write_text("API_SERVER_KEY=unchanged\n")
(directory/"SOUL.md").write_text("unchanged")
args=[str(source),"--managed-default-routing",str(directory/"policy.json"),str(directory/"gateway.yaml"),str(directory/"config.yaml")]
assert m.main(args)==0
result=yaml.safe_load((directory/"config.yaml").read_text())
assert all(result[key]==value for key,value in original.items())
assert result["model"]["default"]=="gpt-5.6-luna"
assert (directory/".env").read_text()=="API_SERVER_KEY=unchanged\n"
assert (directory/"SOUL.md").read_text()=="unchanged"
# Destination symlinks cannot redirect the routing write.
(directory/"config.yaml").unlink(); (directory/"config.yaml").symlink_to(directory/"gateway.yaml")
assert m.main(args)==1
`;
    try {
      const result = spawnSync(
        "python3",
        [
          "-I",
          "-c",
          script,
          path.join(import.meta.dirname, "../agents/hermes/seed-dashboard-config.py"),
          dir,
        ],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
