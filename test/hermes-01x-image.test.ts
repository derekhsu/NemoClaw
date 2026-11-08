// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// OpenShell 0.1.x Hermes image (agents/hermes-01x, #52): the api profile layout
// and config tool, the Landlock/seccomp launcher, and the entrypoint's proxy
// handling. Real Landlock behaviour needs Landlock ABI 5 and is verified on an
// OpenShell 0.1.7 host (see #52); these tests cover the logic portably.
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import YAML from "yaml";
import type { HermesBuildSettings } from "../agents/hermes-01x/config/build-env.ts";
import { buildHermesManagedPolicy } from "../agents/hermes-01x/config/managed-policy.ts";

const AGENT = path.resolve(import.meta.dirname, "../agents/hermes-01x");
const PROFILE_TOOL = path.join(AGENT, "api-profile.py");
const LAUNCHER = path.join(AGENT, "api-landlock-exec.py");
const START = path.join(AGENT, "start.sh");

function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

describe("agents/hermes-01x Dockerfile pins", () => {
  const dockerfile = fs.readFileSync(path.join(AGENT, "Dockerfile"), "utf8");
  // source-shape-contract: security -- Exact source-to-image digests keep the reviewed 0.1.x api-profile boundary bound to the files copied into the sandbox image
  it("keeps the 0.1.x security file hashes synchronized with the copied files", () => {
    for (const [arg, file] of [
      ["NEMOCLAW_HERMES_PROFILE_LAYOUT_TOOL_SHA256", "api-profile.py"],
      ["NEMOCLAW_HERMES_API_LANDLOCK_EXEC_SHA256", "api-landlock-exec.py"],
      ["NEMOCLAW_HERMES_ATOMIC_WRITE_PATCHER_SHA256", "patch-atomic-write-symlink-target.py"],
      ["NEMOCLAW_HERMES_VALIDATOR_SHA256", "validate-env-secret-boundary.py"],
    ]) {
      const match = dockerfile.match(new RegExp(`^ARG ${arg}=([0-9a-f]{64})$`, "m"));
      expect(match, `${arg} must be pinned`).not.toBeNull();
      expect(match![1], file).toBe(sha256(path.join(AGENT, file)));
    }
  });
});

// ── hermes-api-profile.py ────────────────────────────────────────────────

const PROFILE_HARNESS = `
import importlib.util, os, sys
source = sys.argv[1]
here = os.path.dirname(source)
root = os.environ["FX_ROOT"]
spec = importlib.util.spec_from_file_location("fx_api_profile", source)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
module.API_ROOT = root
module.PROFILES_DIR = os.path.join(root, "profiles")
module.API_HOME = os.path.join(root, "profiles", "api")
module.SHARED_STATE_LINK = os.path.join(root, "shared-state.db")
module.WRITE_LOCK = os.path.join(root, ".write-config.lock")
module.GUARD_PATH = os.path.join(here, "runtime-config-guard.py")
module.LAUNCHER_PATH = os.path.join(here, "api-landlock-exec.py")
module.MCP_TRANSACTION_PATH = os.path.join(here, "mcp-config-transaction.py")
original_load = module._load
def load(name, path):
    loaded = original_load(name, path)
    if name == "hermes_runtime_config_guard":
        loaded.HERMES_MANAGED_POLICY_PATH = os.environ["FX_POLICY"]
    return loaded
module._load = load
raise SystemExit(module.main(sys.argv[2:]))
`;

const MANAGED_POLICY = {
  managed_paths: ["approvals.mode", "security.redact_secrets"],
  config: { approvals: { mode: "manual" }, security: { redact_secrets: true } },
};

const SIGNED_SCOPE = "sbx-hermes-1.0123456789abcdef0123456789abcdef";
const PLACEHOLDER = "openshell:resolve:env:sb8f2f7d4106bf3921";

describe.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "hermes-api-profile.py (0.1.x api profile layout)",
  () => {
    let root: string;
    let policy: string;
    let caFile: string;

    beforeEach(() => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-01x-profile-"));
      root = path.join(base, "hermes-api");
      fs.mkdirSync(path.join(root, "profiles"), { recursive: true, mode: 0o700 });
      fs.chmodSync(root, 0o700);
      policy = path.join(base, "managed-policy.json");
      fs.writeFileSync(policy, JSON.stringify(MANAGED_POLICY));
      caFile = path.join(base, "ca-bundle.crt");
      fs.writeFileSync(caFile, "-----BEGIN CERTIFICATE-----\n");
    });

    afterEach(() => {
      fs.rmSync(path.dirname(root), { recursive: true, force: true });
    });

    function tool(args: string[], options: { stdin?: string; env?: Record<string, string> } = {}) {
      const result = spawnSync("python3", ["-c", PROFILE_HARNESS, PROFILE_TOOL, ...args], {
        encoding: "utf8",
        input: options.stdin,
        timeout: 20000,
        env: { ...process.env, FX_ROOT: root, FX_POLICY: policy, ...options.env },
      });
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(result.stdout);
      } catch {
        // Leave json empty; the caller asserts on status/stdout.
      }
      return { status: result.status, json, stdout: result.stdout, stderr: result.stderr };
    }

    const home = () => path.join(root, "profiles", "api");
    const config = () => fs.readFileSync(path.join(home(), "config.yaml"), "utf8");
    const configSha = () => sha256(path.join(home(), "config.yaml"));

    it("bootstraps the layout the launcher expects and verifies it", () => {
      const result = tool(["bootstrap"]);
      expect(result.status, result.stdout + result.stderr).toBe(0);
      expect(result.json.ok).toBe(true);

      const writable = ["state", "runtime", "workspace", "tmp", "deliveries"];
      for (const sub of writable) {
        expect(fs.lstatSync(path.join(home(), sub)).isDirectory()).toBe(true);
      }
      expect(fs.readlinkSync(path.join(home(), "state.db"))).toBe("state/state.db");
      expect(fs.readlinkSync(path.join(root, "shared-state.db"))).toBe(
        "profiles/api/state/shared-state.db",
      );
      expect(fs.readFileSync(path.join(home(), ".env"), "utf8")).toMatch(
        /^API_SERVER_KEY=\S{32,}\n$/,
      );
      expect(fs.statSync(path.join(home(), ".env")).mode & 0o077).toBe(0);
      // The runtime contract is pinned from the first boot.
      expect(config()).toMatch(/host: 127\.0\.0\.1/);
      expect(config()).toMatch(/dispatch_in_gateway: false/);
      expect(tool(["verify"]).status).toBe(0);
    });

    it("never overwrites an existing config or API key on a second bootstrap", () => {
      expect(tool(["bootstrap"]).status).toBe(0);
      const env = fs.readFileSync(path.join(home(), ".env"), "utf8");
      fs.appendFileSync(path.join(home(), "config.yaml"), "# admin edit\n");
      const before = config();

      const again = tool(["bootstrap"]);
      expect(again.status).toBe(0);
      expect(again.json.created).toEqual([]);
      expect(config()).toBe(before);
      expect(fs.readFileSync(path.join(home(), ".env"), "utf8")).toBe(env);
    });

    it("rejects unexpected entries, replaced state links and group access", () => {
      expect(tool(["bootstrap"]).status).toBe(0);

      fs.writeFileSync(path.join(home(), "planted.yaml"), "x");
      expect(tool(["verify"]).json.problems).toContain("unexpected top-level entry: planted.yaml");
      fs.rmSync(path.join(home(), "planted.yaml"));

      fs.rmSync(path.join(home(), "install_id"));
      fs.symlinkSync("../../../escape", path.join(home(), "install_id"));
      expect(tool(["verify"]).status).not.toBe(0);
      fs.rmSync(path.join(home(), "install_id"));
      fs.symlinkSync("state/install_id", path.join(home(), "install_id"));

      fs.chmodSync(home(), 0o750);
      expect(tool(["verify"]).status).not.toBe(0);
    });

    it("compare-and-swaps the config and pins the runtime contract", () => {
      expect(tool(["bootstrap"]).status).toBe(0);
      const digest = configSha();
      const submitted = [
        "model: {default: gpt-test, api_key: 'openshell:resolve:env:X'}",
        "platforms: {api_server: {enabled: false, extra: {host: 0.0.0.0, port: 1}}}",
        "kanban: {dispatch_in_gateway: true}",
        "approvals: {mode: off}",
        "",
      ].join("\n");

      const write = tool(["write-config", "--expected-config-sha256", digest], {
        stdin: submitted,
      });
      expect(write.status, write.stdout + write.stderr).toBe(0);
      expect(write.json.config_sha256).toBe(configSha());
      expect(config()).toMatch(/default: gpt-test/);
      expect(config()).toMatch(/host: 127\.0\.0\.1/);
      expect(config()).toMatch(/port: 18699/);
      expect(config()).toMatch(/dispatch_in_gateway: false/);
      // Image-owned policy sections win over the submitted document.
      expect(config()).toMatch(/mode: manual/);

      const stale = tool(["write-config", "--expected-config-sha256", digest], {
        stdin: submitted,
      });
      expect(stale.status).toBe(3);
      expect(stale.json.conflict).toBe(true);

      const currentDigest = configSha();
      const nonMapping = tool(["write-config", "--expected-config-sha256", currentDigest], {
        stdin: "[1, 2]\n",
      });
      expect(nonMapping.status).toBe(1);
      expect(
        tool(["write-config", "--expected-config-sha256", "XYZ"], { stdin: "{}\n" }).status,
      ).toBe(1);
      // The temp file never lands in the api HERMES_HOME.
      expect(fs.readdirSync(home()).some((name) => name.endsWith(".tmp"))).toBe(false);
      expect(tool(["verify"]).status).toBe(0);
    });

    it("registers the uploader with the gateway placeholder and keeps admin tools", () => {
      expect(tool(["bootstrap"]).status).toBe(0);
      const digest = configSha();
      const withTerminal = config().replace("- file", "- file\n  - terminal");
      expect(
        tool(["write-config", "--expected-config-sha256", digest], { stdin: withTerminal }).status,
      ).toBe(0);
      const payload = JSON.stringify({
        gateway_url: "https://gateway.example.com",
        sandbox_id: SIGNED_SCOPE,
        replace_existing: true,
      });
      const env = {
        GATEWAY_API_KEY: PLACEHOLDER,
        SSL_CERT_FILE: caFile,
        REQUESTS_CA_BUNDLE: path.join(path.dirname(caFile), "missing.crt"),
        HTTPS_PROXY: "http://10.200.0.1:3128",
      };

      expect(tool(["inspect-uploader"], { stdin: payload, env }).json.state).toBe("missing");
      const registered = tool(["register-uploader"], { stdin: payload, env });
      expect(registered.status, registered.stdout + registered.stderr).toBe(0);
      expect(registered.json).toMatchObject({ ok: true, state: "matched", changed: true });
      expect(tool(["register-uploader"], { stdin: payload, env }).json.changed).toBe(false);
      expect(tool(["inspect-uploader"], { stdin: payload, env }).json.state).toBe("matched");

      const text = config();
      expect(text).toContain(`GATEWAY_API_KEY: ${PLACEHOLDER}`);
      expect(text).toContain(`SSL_CERT_FILE: ${caFile}`);
      expect(text).not.toContain("REQUESTS_CA_BUNDLE");
      expect(text).not.toMatch(/PROXY/);
      expect(text).not.toContain("${");
      expect(text).toMatch(/- terminal/);
      expect(text).toMatch(/- mcp-sandbox-file-uploader/);
      expect(tool(["verify"]).status).toBe(0);
    });

    it("refuses an uploader without a placeholder or a signed scope", () => {
      expect(tool(["bootstrap"]).status).toBe(0);
      const payload = (sandboxId: string) =>
        JSON.stringify({
          gateway_url: "https://gateway.example.com",
          sandbox_id: sandboxId,
          replace_existing: true,
        });

      const noPlaceholder = tool(["register-uploader"], {
        stdin: payload(SIGNED_SCOPE),
        env: { GATEWAY_API_KEY: "sk-real-looking-key" },
      });
      expect(noPlaceholder.status).toBe(1);
      expect(String(noPlaceholder.json.problems)).toMatch(/placeholder/);

      const unsigned = tool(["register-uploader"], {
        stdin: payload("sbx-hermes-1"),
        env: { GATEWAY_API_KEY: PLACEHOLDER },
      });
      expect(unsigned.status).toBe(1);
      expect(config()).not.toContain("sandbox-file-uploader");
    });
  },
);

// ── api-landlock-exec.py ─────────────────────────────────────────────────

function launcher(script: string, env: Record<string, string> = {}) {
  const harness = `
import importlib.util, json, os, sys
spec = importlib.util.spec_from_file_location("fx_launcher", sys.argv[1])
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)
${script}
`;
  return spawnSync("python3", ["-c", harness, LAUNCHER], {
    encoding: "utf8",
    timeout: 20000,
    env: { ...process.env, ...env },
  });
}

describe.skipIf(process.platform === "win32")("api-landlock-exec.py (0.1.x launcher)", () => {
  it("builds a seccomp filter that fakes path metadata writes and denies xattrs", () => {
    // A minimal classic-BPF interpreter for the instructions the launcher emits.
    const result = launcher(`
import struct
def run(prog, arch, nr, path_arg=1):
    data = struct.pack("<IIQ", nr, arch, 0) + struct.pack("<QQQQQQ", 0, path_arg, 0, 0, 0, 0)
    pc, acc = 0, 0
    while True:
        code, jt, jf, k = struct.unpack_from("HBBI", prog, pc * 8)
        pc += 1
        if code == 0x20: acc = struct.unpack_from("<I", data, k)[0]
        elif code == 0x15: pc += jt if acc == k else jf
        elif code == 0x35: pc += jt if acc >= k else jf
        elif code == 0x06: return k
        else: raise SystemExit(f"unexpected opcode {code:#x}")
ALLOW, KILL = launcher.SECCOMP_RET_ALLOW, launcher.SECCOMP_RET_KILL_PROCESS
FAKE, EPERM = launcher.SECCOMP_RET_ERRNO, launcher.SECCOMP_RET_ERRNO | 1
out = {}
for machine, (chmod, xattr, utimensat, openat, fchmod) in {
    "x86_64": (90, 188, 280, 257, 91), "aarch64": (53, 5, 88, 56, 52)}.items():
    prog = launcher._seccomp_program(machine)
    arch = launcher.AUDIT_ARCH[machine]
    other = launcher.AUDIT_ARCH["aarch64" if machine == "x86_64" else "x86_64"]
    out[machine] = {
        "wrong_arch": run(prog, other, openat) == KILL,
        "path_chmod_faked": run(prog, arch, chmod) == FAKE,
        "xattr_denied": run(prog, arch, xattr) == EPERM,
        "utimensat_path_faked": run(prog, arch, utimensat, path_arg=1) == FAKE,
        "futimens_allowed": run(prog, arch, utimensat, path_arg=0) == ALLOW,
        "openat_allowed": run(prog, arch, openat) == ALLOW,
        "fchmod_allowed": run(prog, arch, fchmod) == ALLOW,
    }
out["x32_killed"] = run(launcher._seccomp_program("x86_64"), launcher.AUDIT_ARCH["x86_64"], 0x40000000 + 90) == KILL
print(json.dumps(out))
`);
    expect(result.status, result.stderr).toBe(0);
    const out = JSON.parse(result.stdout);
    for (const machine of ["x86_64", "aarch64"]) {
      expect(Object.values(out[machine]).every(Boolean), JSON.stringify(out[machine])).toBe(true);
    }
    expect(out.x32_killed).toBe(true);
  });

  it("grants the api side only its own home, system paths and public CA material", () => {
    const result = launcher(`
rules = []
launcher._add_path_rule = lambda sys_add, ruleset, path, access, required: rules.append((path, access, required))
devnull = os.open(os.devnull, os.O_RDONLY)
def fake_syscall(nr, *args):
    if args and args[0] is None:
        return launcher.REQUIRED_ABI
    return devnull if nr == launcher.SYS_LANDLOCK["x86_64"][0] else 0
launcher._libc.syscall = fake_syscall
launcher._libc.prctl = lambda *args: 0
launcher._apply_landlock("x86_64", "/sandbox/.hermes-api/profiles/api")
print(json.dumps({"rules": rules, "state": launcher.STATE_TREE, "ro": launcher.READ_ONLY,
                  "rx": launcher.READ_EXEC, "list": launcher.READ_DIR, "write": launcher.WRITE_FILE}))
`);
    expect(result.status, result.stderr).toBe(0);
    const { rules, state, ro, rx, list, write } = JSON.parse(result.stdout) as {
      rules: [string, number, boolean][];
      state: number;
      ro: number;
      rx: number;
      list: number;
      write: number;
    };
    const access = new Map(rules.map(([p, a]) => [p, a]));
    const home = "/sandbox/.hermes-api/profiles/api";
    expect(access.get(home)).toBe(ro);
    for (const sub of ["state", "workspace", "tmp", "deliveries"]) {
      expect(access.get(`${home}/${sub}`)).toBe(state);
    }
    expect(access.get("/sandbox/.nemoclaw")).toBe(list);
    expect(access.get("/run/openshell-supervisor-ca/material")).toBe(ro);
    expect(access.get("/sandbox/.venvs/sandbox-mcp-server")).toBe(rx);
    // Admin material is never granted, in any form.
    const paths = rules.map(([p]) => p);
    for (const forbidden of [
      "/etc/nemoclaw",
      "/sandbox",
      "/sandbox/.hermes",
      "/sandbox/.clawshell-dashboard",
      "/tmp",
      "/etc",
    ]) {
      expect(paths, forbidden).not.toContain(forbidden);
    }
    expect(
      paths.some(
        (p) => p.startsWith("/sandbox/.hermes/") || p.startsWith("/sandbox/.clawshell-dashboard"),
      ),
    ).toBe(false);
    // Write access exists only inside the home's writable subdirectories and /dev/null.
    const writable = rules.filter(([, a]) => (a & write) !== 0).map(([p]) => p);
    expect(writable.filter((p) => p !== "/dev/null" && !p.startsWith(`${home}/`))).toEqual([]);
  });

  it("passes only allowlisted environment variables plus fixed values", () => {
    const result = launcher(`print(json.dumps(launcher._sanitized_env("/h", ["EXTRA_OK"])))`, {
      LD_PRELOAD: "/tmp/evil.so",
      PYTHONPATH: "/tmp/evil",
      OPENAI_API_KEY: "sk-secret",
      SSL_CERT_FILE: "/run/ca.pem",
      LANG: "C.UTF-8",
      EXTRA_OK: "1",
      PATH: "/tmp/evil-bin:/usr/bin",
    });
    expect(result.status, result.stderr).toBe(0);
    const env = JSON.parse(result.stdout);
    expect(env).toMatchObject({
      SSL_CERT_FILE: "/run/ca.pem",
      LANG: "C.UTF-8",
      EXTRA_OK: "1",
      HOME: "/h",
      HERMES_HOME: "/h",
      TMPDIR: "/h/tmp",
      PYTHONNOUSERSITE: "1",
    });
    expect(env.PATH).not.toContain("/tmp/evil-bin");
    for (const name of ["LD_PRELOAD", "PYTHONPATH", "OPENAI_API_KEY"]) {
      expect(env, name).not.toHaveProperty(name);
    }
  });

  it.each([
    [["/h", "--", "/bin/true"], 0],
    [["/h", "--keep-env", "SAFE_NAME", "--", "/bin/true"], 0],
    [["/h", "/bin/true"], 70],
    [["/h", "--keep-env", "BAD-NAME", "--", "/bin/true"], 70],
  ])("parses %j (exit %i)", (argv, status) => {
    const run = spawnSync(
      "python3",
      [
        "-c",
        `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("fx_launcher", sys.argv[1])
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)
launcher._parse(json.loads(sys.argv[2]))
`,
        LAUNCHER,
        JSON.stringify(argv),
      ],
      { encoding: "utf8", timeout: 20000 },
    );
    expect(run.status).toBe(status);
  });
});

// ── start.sh proxy handling ──────────────────────────────────────────────

describe.skipIf(process.platform === "win32")("0.1.x entrypoint proxy environment", () => {
  const source = fs.readFileSync(START, "utf8");
  const block = source.slice(
    source.indexOf("# ── Proxy environment"),
    source.indexOf("# Corporate proxy CA merge"),
  );
  const writer = source.slice(
    source.indexOf("write_runtime_shell_env() {"),
    source.indexOf("\nwrite_runtime_shell_env\n"),
  );

  function run(env: Record<string, string>, tail: string) {
    return spawnSync("bash", ["-c", `${block}\n${tail}`], {
      encoding: "utf8",
      timeout: 5000,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", ...env },
    });
  }

  it("drops the 0.0.x explicit proxy that OpenShell 0.1.x denies", () => {
    const result = run(
      {
        HTTPS_PROXY: "http://10.200.0.1:3128",
        http_proxy: "http://10.200.0.1:3128",
        NO_PROXY: "x",
      },
      "env | grep -i -E '^(https?|all|no)_proxy=' || true",
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("");
  });

  it("still honours an explicitly configured proxy", () => {
    const result = run(
      { NEMOCLAW_PROXY_HOST: "proxy.corp" },
      'printf "%s|%s" "$HTTPS_PROXY" "$NO_PROXY"',
    );
    expect(result.stdout).toBe("http://proxy.corp:3128|localhost,127.0.0.1,::1,proxy.corp");
  });

  it("writes an unset line, not the 0.0.x proxy, into the sourced shell file", () => {
    const result = run(
      {},
      `HERMES_DIR=/sandbox/.hermes
emit_sandbox_sourced_file() { cat; }
${writer}
write_runtime_shell_env`,
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(
      /^unset HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY http_proxy https_proxy/m,
    );
    expect(result.stdout).not.toContain("10.200.0.1");
  });
});

// ── hermes-mcp-config-transaction.py write-model-config ─────────────────

const MCP_TRANSACTION = path.join(AGENT, "mcp-config-transaction.py");

const MODEL_HARNESS = `
import importlib.util, json, os, sys
source, hermes_dir, record = sys.argv[1], sys.argv[2], sys.argv[3]
spec = importlib.util.spec_from_file_location("fx_mcp_tx", source)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
module.GUARD_PATH = os.path.join(os.path.dirname(source), "runtime-config-guard.py")
module.HERMES_DIR = hermes_dir
module.CONFIG_PATH = os.path.join(hermes_dir, "config.yaml")
module.STRICT_HASH_PATH = os.path.join(os.path.dirname(hermes_dir), "strict.config-hash")
module._assert_non_root_lifecycle_identity = lambda: None
def reload_gateway():
    with open(record, "a") as handle:
        handle.write("reload\\n")
    return True
module.reload_gateway = reload_gateway
if os.environ.get("FX_SEED_HASH"):
    guard = module._load_guard()
    text, _c, _e = guard._hash_text(module.CONFIG_PATH, os.path.join(hermes_dir, ".env"))
    guard._write_hash(os.path.join(hermes_dir, ".config-hash"), text)
    raise SystemExit(0)
if os.environ.get("FX_INSPECT"):
    guard = module._load_guard()
    print(guard.inspect_mcp_integrity(hermes_dir, os.path.join(hermes_dir, ".config-hash")))
    raise SystemExit(0)
sys.argv = ["hermes-mcp-config-transaction.py", *sys.argv[4:]]
raise SystemExit(module.main())
`;

const DEFAULT_CONFIG = `_nemoclaw_upstream:
  provider: custom
  provider_key: custom
  model: nvidia/nemotron-3-super-120b-a12b
model:
  default: nvidia/nemotron-3-super-120b-a12b
  provider: custom
  base_url: https://inference.local/v1
  api_key: sk-OPENSHELL-PROXY-REWRITE
providers:
  custom:
    name: custom
    api: https://inference.local/v1
    api_key: sk-OPENSHELL-PROXY-REWRITE
mcp_servers:
  fake:
    url: https://mcp.example.test/mcp
    enabled: true
platform_toolsets:
  api_server: [file]
`;

describe.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "hermes-mcp-config-transaction.py write-model-config (0.1.x default profile)",
  () => {
    let base: string;
    let hermes: string;
    let record: string;

    beforeEach(() => {
      base = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-01x-model-"));
      hermes = path.join(base, ".hermes");
      fs.mkdirSync(hermes, { mode: 0o700 });
      fs.writeFileSync(path.join(hermes, "config.yaml"), DEFAULT_CONFIG, { mode: 0o640 });
      fs.writeFileSync(path.join(hermes, ".env"), "API_SERVER_KEY=x\n", { mode: 0o640 });
      record = path.join(base, "reloads");
      expect(run([], { FX_SEED_HASH: "1" }).status).toBe(0);
    });

    afterEach(() => {
      fs.rmSync(base, { recursive: true, force: true });
    });

    function run(args: string[], env: Record<string, string> = {}, stdin?: string) {
      return spawnSync("python3", ["-c", MODEL_HARNESS, MCP_TRANSACTION, hermes, record, ...args], {
        encoding: "utf8",
        input: stdin,
        timeout: 30000,
        env: { ...process.env, ...env },
      });
    }

    const configText = () => fs.readFileSync(path.join(hermes, "config.yaml"), "utf8");
    const configSha = () => sha256(path.join(hermes, "config.yaml"));
    const reloads = () =>
      fs.existsSync(record)
        ? fs.readFileSync(record, "utf8").split("\n").filter(Boolean).length
        : 0;
    const write = (config: string, expected = configSha()) =>
      run(["write-model-config"], {}, JSON.stringify({ expected_config_sha256: expected, config }));

    const ROUTED = `model:
  default: gpt-5.5
  provider: custom:clawshell-openai
providers:
  clawshell-openai:
    name: clawshell-openai
    base_url: https://api.openai.com/v1
    api_key: ${PLACEHOLDER}
    api_mode: chat_completions
mcp_servers:
  fake:
    url: https://mcp.example.test/mcp
    enabled: true
platform_toolsets:
  api_server: [file]
`;

    it("re-routes the model, keeps the hash current and reloads the gateway once", () => {
      const result = write(ROUTED);
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ changed: true, ok: true, reloaded: true });
      expect(configText()).toContain("provider: custom:clawshell-openai");
      expect(configText()).not.toContain("inference.local");
      expect(reloads()).toBe(1);
      const inspected = run([], { FX_INSPECT: "1" });
      expect(inspected.status, inspected.stderr).toBe(0);
      expect(inspected.stdout.trim()).toBe("current");
    });

    it("refuses a config read before a concurrent change with exit 3", () => {
      const stale = configSha();
      fs.appendFileSync(path.join(hermes, "config.yaml"), "# edited\n");
      const before = configText();
      const result = write(ROUTED, stale);
      expect(result.status).toBe(3);
      expect(configText()).toBe(before);
      expect(reloads()).toBe(0);
    });

    it("refuses to change any section other than model routing", () => {
      for (const config of [
        ROUTED.replace("https://mcp.example.test/mcp", "https://evil.example.test/mcp"),
        ROUTED.replace("api_server: [file]", "api_server: [file, terminal]"),
        `${ROUTED}approvals:\n  mode: off\n`,
      ]) {
        const result = write(config);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain("may change only model, providers and custom_providers");
      }
      expect(configText()).toBe(DEFAULT_CONFIG);
      expect(reloads()).toBe(0);
    });

    it("accepts only placeholders as new credentials but keeps existing ones", () => {
      const raw = write(ROUTED.replace(PLACEHOLDER, "sk-live-not-a-placeholder"));
      expect(raw.status).toBe(2);
      expect(raw.stderr).toContain("only OpenShell credential placeholders");
      expect(raw.stderr).not.toContain("sk-live-not-a-placeholder");
      expect(configText()).toBe(DEFAULT_CONFIG);
      // Only the model choice changes; the existing legacy value stays.
      const kept = write(
        DEFAULT_CONFIG.replace("default: nvidia/nemotron-3-super-120b-a12b", "default: other"),
      );
      expect(kept.status, kept.stderr).toBe(0);
    });

    it("lets the 0.0.x upstream marker be dropped but never rewritten", () => {
      // ROUTED has no _nemoclaw_upstream: the first test already proves removal works.
      const rewritten = write(
        `_nemoclaw_upstream:\n  provider: other\n  provider_key: other\n  model: x\n${ROUTED}`,
      );
      expect(rewritten.status).toBe(2);
      expect(rewritten.stderr).toContain("refused sections: _nemoclaw_upstream");
      expect(configText()).toBe(DEFAULT_CONFIG);
      const removed = write(ROUTED);
      expect(removed.status, removed.stderr).toBe(0);
      expect(configText()).not.toContain("_nemoclaw_upstream");
    });

    it("adopts only the model sections of a file Hermes renormalized", () => {
      // `hermes model` rewrites the whole file; its other sections are ignored.
      const rewritten = ROUTED.replace(
        "https://mcp.example.test/mcp",
        "https://evil.example.test/mcp",
      ).concat("approvals:\n  mode: off\n");
      const result = run(
        ["write-model-config"],
        {},
        JSON.stringify({
          expected_config_sha256: configSha(),
          config: rewritten,
          model_sections_only: true,
        }),
      );
      expect(result.status, result.stderr).toBe(0);
      const written = YAML.parse(configText());
      expect(written.model).toEqual({ default: "gpt-5.5", provider: "custom:clawshell-openai" });
      expect(written.mcp_servers.fake.url).toBe("https://mcp.example.test/mcp");
      expect(written.approvals).toBeUndefined();
      // The upstream marker is not a model section: it stays as it was.
      expect(written._nemoclaw_upstream.provider).toBe("custom");
      expect(Object.keys(written)).toEqual(Object.keys(YAML.parse(DEFAULT_CONFIG)));
      expect(reloads()).toBe(1);
    });

    it("still refuses raw keys and rejects a non-true sections flag", () => {
      const raw = run(
        ["write-model-config"],
        {},
        JSON.stringify({
          expected_config_sha256: configSha(),
          config: ROUTED.replace(PLACEHOLDER, "sk-typed-into-the-picker"),
          model_sections_only: true,
        }),
      );
      expect(raw.status).toBe(2);
      expect(raw.stderr).toContain("only OpenShell credential placeholders");
      const flag = run(
        ["write-model-config"],
        {},
        JSON.stringify({
          expected_config_sha256: configSha(),
          config: ROUTED,
          model_sections_only: 1,
        }),
      );
      expect(flag.status).toBe(2);
      expect(flag.stderr).toContain("model_sections_only must be true");
      expect(configText()).toBe(DEFAULT_CONFIG);
      expect(reloads()).toBe(0);
    });

    it("reads its payload only from stdin", () => {
      const result = run(["write-model-config", "--payload", "{}"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("reads its payload from stdin");
    });
  },
);

describe.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "hermes-mcp-config-transaction.py set-clawshell-management-plugin (clawshell-gateway#254)",
  () => {
    let base: string;
    let hermes: string;
    let record: string;
    const CONFIG = `${DEFAULT_CONFIG}plugins:
  enabled:
  - nemoclaw
`;

    beforeEach(() => {
      base = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-01x-plugin-"));
      hermes = path.join(base, ".hermes");
      fs.mkdirSync(hermes, { mode: 0o700 });
      fs.writeFileSync(path.join(hermes, "config.yaml"), CONFIG, { mode: 0o640 });
      fs.writeFileSync(path.join(hermes, ".env"), "API_SERVER_KEY=x\n", { mode: 0o640 });
      record = path.join(base, "reloads");
      expect(run([], { FX_SEED_HASH: "1" }).status).toBe(0);
    });

    afterEach(() => {
      fs.rmSync(base, { recursive: true, force: true });
    });

    function run(args: string[], env: Record<string, string> = {}, stdin?: string) {
      return spawnSync("python3", ["-c", MODEL_HARNESS, MCP_TRANSACTION, hermes, record, ...args], {
        encoding: "utf8",
        input: stdin,
        timeout: 30000,
        env: { ...process.env, ...env },
      });
    }
    const toggle = (payload: unknown) =>
      run(["set-clawshell-management-plugin"], {}, JSON.stringify(payload));
    const config = () =>
      YAML.parse(fs.readFileSync(path.join(hermes, "config.yaml"), "utf8")) as Record<
        string,
        unknown
      >;
    const reloads = () =>
      fs.existsSync(record)
        ? fs.readFileSync(record, "utf8").split("\n").filter(Boolean).length
        : 0;

    it("adds only the plugin entry, keeps the hash current and reloads once", () => {
      const { plugins: _before, ...restBefore } = config();
      const result = toggle({ enabled: true });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ changed: true, ok: true });
      const { plugins, ...restAfter } = config();
      expect(plugins).toEqual({ enabled: ["nemoclaw", "clawshell-profile-management"] });
      expect(restAfter).toEqual(restBefore);
      expect(reloads()).toBe(1);
      expect(run([], { FX_INSPECT: "1" }).stdout.trim()).toBe("current");
    });

    it("is idempotent and removes only its own entry", () => {
      expect(toggle({ enabled: true }).status).toBe(0);
      const again = toggle({ enabled: true });
      expect(again.status, again.stderr).toBe(0);
      expect(JSON.parse(again.stdout).changed).toBe(false);
      const off = toggle({ enabled: false });
      expect(off.status, off.stderr).toBe(0);
      expect(config().plugins).toEqual({ enabled: ["nemoclaw"] });
      expect(run([], { FX_INSPECT: "1" }).stdout.trim()).toBe("current");
    });

    it("creates the plugins section when the config has none", () => {
      fs.writeFileSync(path.join(hermes, "config.yaml"), DEFAULT_CONFIG, { mode: 0o640 });
      expect(run([], { FX_SEED_HASH: "1" }).status).toBe(0);
      const result = toggle({ enabled: true });
      expect(result.status, result.stderr).toBe(0);
      expect(config().plugins).toEqual({ enabled: ["clawshell-profile-management"] });
    });

    it.each([
      [{ enabled: "yes" }],
      [{ enabled: true, name: "other-plugin" }],
      [{}],
    ])("refuses payload %j without touching the config", (payload) => {
      const before = fs.readFileSync(path.join(hermes, "config.yaml"), "utf8");
      const result = toggle(payload);
      expect(result.status).toBe(2);
      expect(fs.readFileSync(path.join(hermes, "config.yaml"), "utf8")).toBe(before);
      expect(reloads()).toBe(0);
    });

    it("reads its payload only from stdin and refuses a malformed plugins section", () => {
      const argv = run(["set-clawshell-management-plugin", "--payload", '{"enabled":true}']);
      expect(argv.status).toBe(2);
      expect(argv.stderr).toContain("reads its payload from stdin");
      fs.writeFileSync(
        path.join(hermes, "config.yaml"),
        `${DEFAULT_CONFIG}plugins:\n  enabled: nemoclaw\n`,
      );
      expect(run([], { FX_SEED_HASH: "1" }).status).toBe(0);
      const malformed = toggle({ enabled: true });
      expect(malformed.status).toBe(2);
      expect(malformed.stderr).toContain("plugins.enabled must be a list");
    });
  },
);

// ── seed-dashboard-config.py: OpenShell 0.1.x named-provider routing ─────

const SEEDER = path.join(AGENT, "seed-dashboard-config.py");
const SEED_POLICY = buildHermesManagedPolicy(
  {
    model: "nvidia-routed",
    baseUrl: "https://inference.local/v1",
    providerKey: "nvidia-router",
    upstreamProvider: "nvidia-router",
    inferenceApi: "openai-completions",
    contextWindow: null,
    toolDisclosure: "progressive",
    webSearchProvider: null,
    messagingCredentialPlaceholders: [],
    managedToolGateways: { brokerEnabled: false, presets: [] },
    managedImageCapabilityUnion: false,
  } as HermesBuildSettings,
  {},
);
const SEED_GATEWAY_POLICY = Object.fromEntries(
  Array.from(
    new Set(SEED_POLICY.managed_paths.map((dotted) => dotted.split(".", 1)[0])),
    (section) => [section, SEED_POLICY.config[section]],
  ),
);
const PRIMARY = "clawshell-openai-official-1bc0bf8d8096";
const SECOND = "clawshell-openai-alt-test-9aedb1aa61c7";
const NAMED_ROUTING = {
  model: { default: "gpt-6-luna", provider: `custom:${PRIMARY}` },
  providers: {
    [PRIMARY]: {
      name: PRIMARY,
      base_url: "https://api.openai.com/v1",
      api_key: PLACEHOLDER,
      api_mode: "codex_responses",
    },
    [SECOND]: {
      name: SECOND,
      base_url: "https://api.openai.com/v1",
      api_key: "openshell:resolve:env:sb2",
      api_mode: "chat_completions",
    },
  },
  custom_providers: [],
};

describe.skipIf(process.platform === "win32")(
  "seed-dashboard-config.py (0.1.x named providers)",
  () => {
    let dir: string;
    let policy: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-01x-seed-"));
      policy = path.join(dir, "managed-policy.json");
      fs.writeFileSync(policy, JSON.stringify(SEED_POLICY));
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    function seed(gateway: object, dashboard: object) {
      const src = path.join(dir, "gateway.yaml");
      const dst = path.join(dir, "dashboard-home", "config.yaml");
      fs.mkdirSync(path.dirname(dst), { recursive: true, mode: 0o700 });
      fs.writeFileSync(src, YAML.stringify({ ...SEED_GATEWAY_POLICY, ...gateway }));
      fs.writeFileSync(dst, YAML.stringify(dashboard), { mode: 0o600 });
      const result = spawnSync("python3", [SEEDER, policy, src, dst], {
        encoding: "utf8",
        timeout: 20000,
      });
      return {
        ...result,
        dashboard: YAML.parse(fs.readFileSync(dst, "utf8")) as Record<string, unknown>,
      };
    }

    // The image's dashboard-home starts from the 0.0.x inference.local route.
    const STALE_DASHBOARD = {
      model: {
        default: "nemotron",
        provider: "custom",
        base_url: "https://inference.local/v1",
        api_key: "sk-OPENSHELL-PROXY-REWRITE",
      },
      custom_providers: [
        {
          name: "custom",
          base_url: "https://inference.local/v1",
          api_key: "sk-OPENSHELL-PROXY-REWRITE",
        },
      ],
      _nemoclaw_upstream: { provider_key: "custom" },
      dashboard_local: { keep: true },
    };

    it("mirrors every named provider and drops the 0.0.x upstream", () => {
      const result = seed(NAMED_ROUTING, STALE_DASHBOARD);
      expect(result.status, result.stderr).toBe(0);
      expect(result.dashboard.model).toEqual(NAMED_ROUTING.model);
      expect(result.dashboard.providers).toEqual(NAMED_ROUTING.providers);
      expect(result.dashboard.custom_providers).toEqual([]);
      expect(result.dashboard).not.toHaveProperty("_nemoclaw_upstream");
      expect(result.dashboard.dashboard_local).toEqual({ keep: true });
    });

    it("refuses a raw credential and keeps the dashboard as it was", () => {
      const raw = structuredClone(NAMED_ROUTING);
      raw.providers[SECOND].api_key = "sk-live-raw-key";
      const result = seed(raw, STALE_DASHBOARD);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("invalid model routing");
      expect(result.stderr).not.toContain("sk-live-raw-key");
      expect(result.dashboard).toEqual(STALE_DASHBOARD);
    });

    it("refuses a selection that names no provider entry", () => {
      const result = seed(
        { ...NAMED_ROUTING, model: { provider: "custom:clawshell-gone" } },
        STALE_DASHBOARD,
      );
      expect(result.status).toBe(1);
      expect(result.dashboard).toEqual(STALE_DASHBOARD);
    });
  },
);
