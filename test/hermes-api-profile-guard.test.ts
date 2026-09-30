// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Contract seam under test (three-uid model, see contract-inventory.md): the
// image owns a fixed, root-only `api` profile bootstrap and a profile-scoped
// `write-config` transaction. Neither accepts a caller-selected profile name,
// anchor path, or state path — the guard resolves them from fixed constants
// (patched to fixture paths here) and verifies the anchor is owned by the
// privileged executor, never by a runtime user.
//
//   bootstrap-api-profile                      (no path arguments)
//   write-config --profile api                 (fixed paths; path flags rejected)
//
// Ownership matrix under test (the api home lives outside /sandbox/.hermes so
// the api runtime uid never enters the default profile's tree):
//   .hermes-api/, profiles/  root:root 0711   — traverse-only chain
//   profiles/api/            sandbox:api 3770 — admin owns dir, runtime only
//   config.yaml, .env        sandbox:api 0640 — admin writes, runtime reads
//   .config-hash, policy     root:api 0440    — only the guard writes
//   anchor + record          /sandbox/.nemoclaw (root-owned sticky parent)
//
// Ownership cannot be faked inside an unprivileged fixture: the wrapper binds
// the guard's expected-uid constants to fixture uids and patches the chown
// family away. Root-container and image-contract lanes cover real enforcement.
//
//   FIXTURE_OWNER_UID/GID    privileged executor identity (root in image)
//   FIXTURE_ADMIN_UID/GID    api file owner identity (sandbox user in image)
//   FIXTURE_API_UID/GID      api runtime identity (hermesapi user in image)

const RUNTIME_CONFIG_GUARD = path.join(
  import.meta.dirname,
  "..",
  "agents",
  "hermes",
  "runtime-config-guard.py",
);

const POLICY_VERSION = "clawshell-api-minimal-v1";
const DEFAULT_CONFIG = "model:\n  default: trusted-model\n";
const DEFAULT_ENV = "API_SERVER_PORT=18642\nSAFE_SETTING=trusted\n";
// Mirrors the image's hermes-managed-policy.json shape: managed_paths name
// leaf paths, and the guard must carry their whole top-level sections into
// the api profile config verbatim (the dashboard seeder deep-compares them).
const MANAGED_POLICY = JSON.stringify(
  {
    schema_version: 1,
    managed_paths: ["approvals.mode", "session_reset.mode"],
    config: {
      approvals: { mode: "manual" },
      session_reset: { mode: "both", at_hour: 4 },
    },
    dashboard: { routing_keys: ["model"], env_keys: [] },
  },
  null,
  2,
);

interface ApiFixture {
  root: string;
  hermesDir: string;
  profilesDir: string;
  apiRootDir: string;
  apiProfilesDir: string;
  apiDir: string;
  nemoclawDir: string;
  apiConfigPath: string;
  apiEnvPath: string;
  apiCompatHashPath: string;
  apiPolicyPath: string;
  defaultConfigPath: string;
  defaultEnvPath: string;
  defaultCompatHashPath: string;
  defaultHashPath: string;
  apiHashPath: string;
  apiRecordPath: string;
  defaultStatePath: string;
  apiStatePath: string;
  managedPolicyPath: string;
}

function sha256File(target: string): string {
  return createHash("sha256").update(fs.readFileSync(target)).digest("hex");
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// The canonical MCP digest of a config without an mcp_servers section is the
// digest of the canonicalized empty mapping, matching _canonical_mcp_servers_digest.
const EMPTY_MCP_DIGEST = sha256Text("{}");

function anchorText(configPath: string, envPath: string, mcpDigest = EMPTY_MCP_DIGEST): string {
  return (
    `${sha256File(configPath)}  ${configPath}\n` +
    `${sha256File(envPath)}  ${envPath}\n` +
    `# nemoclaw-hermes-mcp-state-v1 intended=${mcpDigest} applied=${mcpDigest}\n`
  );
}

function createFixture(): ApiFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-api-profile-guard-"));
  const hermesDir = path.join(root, "sandbox", ".hermes");
  const profilesDir = path.join(hermesDir, "profiles");
  const apiRootDir = path.join(root, "sandbox", ".hermes-api");
  const apiProfilesDir = path.join(apiRootDir, "profiles");
  const apiDir = path.join(apiProfilesDir, "api");
  const etcDir = path.join(root, "etc", "nemoclaw");
  const runDir = path.join(root, "run", "nemoclaw");
  const nemoclawDir = path.join(root, "sandbox", ".nemoclaw");
  const fixture: ApiFixture = {
    root,
    hermesDir,
    profilesDir,
    apiRootDir,
    apiProfilesDir,
    apiDir,
    nemoclawDir,
    apiConfigPath: path.join(apiDir, "config.yaml"),
    apiEnvPath: path.join(apiDir, ".env"),
    apiCompatHashPath: path.join(apiDir, ".config-hash"),
    apiPolicyPath: path.join(apiDir, ".clawshell-tool-policy.json"),
    defaultConfigPath: path.join(hermesDir, "config.yaml"),
    defaultEnvPath: path.join(hermesDir, ".env"),
    defaultCompatHashPath: path.join(hermesDir, ".config-hash"),
    defaultHashPath: path.join(etcDir, "hermes.config-hash"),
    apiHashPath: path.join(nemoclawDir, "hermes-api.config-hash"),
    apiRecordPath: path.join(nemoclawDir, "hermes-api-profile.json"),
    defaultStatePath: path.join(runDir, "hermes-restart-seal.json"),
    apiStatePath: path.join(runDir, "hermes-api-restart-seal.json"),
    managedPolicyPath: path.join(root, "usr", "share", "nemoclaw", "hermes-managed-policy.json"),
  };
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.mkdirSync(path.join(profilesDir, "dashboard-home"));
  fs.mkdirSync(etcDir, { recursive: true });
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(nemoclawDir, { recursive: true });
  fs.chmodSync(hermesDir, 0o3770);
  fs.chmodSync(profilesDir, 0o770);
  fs.chmodSync(nemoclawDir, 0o1755);
  fs.writeFileSync(fixture.defaultConfigPath, DEFAULT_CONFIG, { mode: 0o640 });
  fs.writeFileSync(fixture.defaultEnvPath, DEFAULT_ENV, { mode: 0o600 });
  const defaultAnchor = anchorText(fixture.defaultConfigPath, fixture.defaultEnvPath);
  fs.writeFileSync(fixture.defaultHashPath, defaultAnchor, { mode: 0o444 });
  fs.writeFileSync(fixture.defaultCompatHashPath, defaultAnchor, { mode: 0o640 });
  fs.mkdirSync(path.dirname(fixture.managedPolicyPath), { recursive: true });
  fs.writeFileSync(fixture.managedPolicyPath, MANAGED_POLICY, { mode: 0o444 });
  return fixture;
}

interface GuardRunOptions {
  stdin?: string;
  ownerUid?: number;
  ownerGid?: number;
  adminUid?: number;
  apiUid?: number;
}

// Loads the guard module, binds the api constants to fixture paths, simulates
// the privileged executor identity, and runs main() with the given argv.
function runApiGuard(fixture: ApiFixture, args: string[], options: GuardRunOptions = {}) {
  const wrapper = String.raw`
import importlib.util
import os
import sys
import types

source = sys.argv[1]
spec = importlib.util.spec_from_file_location("nemoclaw_api_profile_guard_fixture", source)
if spec is None or spec.loader is None:
    raise SystemExit("could not load runtime guard fixture")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

module.HERMES_API_PROFILE_DIR = os.environ["FIXTURE_API_DIR"]
module.HERMES_API_ANCHOR_FILE = os.environ["FIXTURE_API_HASH"]
module.HERMES_API_RECORD_FILE = os.environ["FIXTURE_API_RECORD"]
module.HERMES_API_STATE_FILE = os.environ["FIXTURE_API_STATE"]
module.HERMES_MANAGED_POLICY_PATH = os.environ["FIXTURE_MANAGED_POLICY"]
module.HERMES_API_OWNER_UID = int(os.environ["FIXTURE_OWNER_UID"])
module.HERMES_API_OWNER_GID = int(os.environ["FIXTURE_OWNER_GID"])
admin_uid = int(os.environ["FIXTURE_ADMIN_UID"])
admin_gid = int(os.environ["FIXTURE_ADMIN_GID"])
api_uid = int(os.environ["FIXTURE_API_UID"])
api_gid = int(os.environ["FIXTURE_API_GID"])
module.pwd.getpwnam = lambda name: types.SimpleNamespace(
    pw_uid={"sandbox": admin_uid, "hermesapi": api_uid}[name],
    pw_gid={"sandbox": admin_gid, "hermesapi": api_gid}[name],
)
module.grp.getgrnam = lambda name: types.SimpleNamespace(
    gr_gid={"sandbox": admin_gid, "api": api_gid}[name],
)
os.chown = lambda *a, **k: None
os.fchown = lambda *a, **k: None
os.lchown = lambda *a, **k: None
sys.argv = [source, *sys.argv[2:]]
raise SystemExit(module.main())
`;
  return spawnSync("python3", ["-c", wrapper, RUNTIME_CONFIG_GUARD, ...args], {
    encoding: "utf-8",
    input: options.stdin,
    timeout: 15000,
    env: {
      ...process.env,
      FIXTURE_API_DIR: fixture.apiDir,
      FIXTURE_API_HASH: fixture.apiHashPath,
      FIXTURE_API_RECORD: fixture.apiRecordPath,
      FIXTURE_API_STATE: fixture.apiStatePath,
      FIXTURE_MANAGED_POLICY: fixture.managedPolicyPath,
      FIXTURE_OWNER_UID: String(options.ownerUid ?? process.getuid!()),
      FIXTURE_OWNER_GID: String(options.ownerGid ?? process.getgid!()),
      FIXTURE_ADMIN_UID: String(options.adminUid ?? process.getuid!()),
      FIXTURE_ADMIN_GID: String(process.getgid!()),
      FIXTURE_API_UID: String(options.apiUid ?? process.getuid!()),
      FIXTURE_API_GID: String(process.getgid!()),
    },
  });
}

function bootstrap(fixture: ApiFixture, extraArgs: string[] = [], options: GuardRunOptions = {}) {
  return runApiGuard(fixture, ["bootstrap-api-profile", ...extraArgs], options);
}

function writeApiConfig(
  fixture: ApiFixture,
  expectedDigest: string,
  content: string,
  extraArgs: string[] = [],
) {
  return runApiGuard(
    fixture,
    ["write-config", "--profile", "api", "--expected-config-sha256", expectedDigest, ...extraArgs],
    { stdin: content },
  );
}

function verifyApiProfile(fixture: ApiFixture, extraArgs: string[] = [], options: GuardRunOptions = {}) {
  return runApiGuard(fixture, ["verify-api-profile", ...extraArgs], options);
}

function apiEnvKey(fixture: ApiFixture): string {
  const match = fs.readFileSync(fixture.apiEnvPath, "utf-8").match(/^API_SERVER_KEY=(.+)$/m);
  expect(match, "api profile .env must carry API_SERVER_KEY").not.toBeNull();
  return match![1].trim();
}

describe.skipIf(process.platform === "win32")("Hermes api profile guard", () => {
  it("still refuses the default-profile anchor for the api profile hermes dir", () => {
    // Regression pin for the 2026-09-24 production refusal (op-16c864769b09):
    // passing the default anchor with a profile hermes dir must stay fail-closed.
    const fixture = createFixture();
    fs.mkdirSync(fixture.apiDir, { recursive: true });
    fs.writeFileSync(fixture.apiConfigPath, "model:\n  default: api-model\n", { mode: 0o600 });
    fs.writeFileSync(fixture.apiEnvPath, "API_SERVER_KEY=placeholder\n", { mode: 0o600 });
    fs.writeFileSync(
      fixture.apiCompatHashPath,
      anchorText(fixture.apiConfigPath, fixture.apiEnvPath),
      { mode: 0o600 },
    );
    const result = runApiGuard(
      fixture,
      [
        "write-config",
        "--hermes-dir",
        fixture.apiDir,
        "--hash-file",
        fixture.defaultHashPath,
        "--state-file",
        fixture.apiStatePath,
        "--expected-config-sha256",
        sha256File(fixture.apiConfigPath),
      ],
      { stdin: "model:\n  default: api-model-2\n" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("malformed Hermes config hash");
  });

  it("bootstrap creates the api profile, root-owned anchor, policy, and ownership matrix", () => {
    const fixture = createFixture();
    const result = bootstrap(fixture);
    expect(result.status, result.stderr).toBe(0);
    for (const target of [
      fixture.apiConfigPath,
      fixture.apiEnvPath,
      fixture.apiCompatHashPath,
      fixture.apiPolicyPath,
      fixture.apiHashPath,
      fixture.apiRecordPath,
    ]) {
      expect(fs.existsSync(target), `${target} must exist after bootstrap`).toBe(true);
    }
    // Operator-modifiable surface: admin-writable, api-runtime group-read.
    expect(fs.statSync(fixture.apiConfigPath).mode & 0o777).toBe(0o640);
    expect(fs.statSync(fixture.apiEnvPath).mode & 0o777).toBe(0o640);
    // Root-sealed set: read-only to every runtime uid.
    expect(fs.statSync(fixture.apiPolicyPath).mode & 0o777).toBe(0o440);
    expect(fs.statSync(fixture.apiCompatHashPath).mode & 0o777).toBe(0o440);
    // Sticky+setgid profile dir: the runtime creates its own files but cannot
    // unlink or rename files it does not own. The traverse chain above it is
    // root-owned and grants execute-only to non-owners.
    expect(fs.statSync(fixture.apiDir).mode & 0o7777).toBe(0o3770);
    expect(fs.statSync(fixture.apiProfilesDir).mode & 0o777).toBe(0o711);
    expect(fs.statSync(fixture.apiRootDir).mode & 0o777).toBe(0o711);
    const envText = fs.readFileSync(fixture.apiEnvPath, "utf-8");
    expect(envText).toMatch(/^API_SERVER_KEY=[0-9a-f]{64}$/m);
    const policy = JSON.parse(fs.readFileSync(fixture.apiPolicyPath, "utf-8"));
    expect(policy.version).toBe(POLICY_VERSION);
    // The config carries the image managed-policy sections verbatim so the
    // dashboard seeder's policy-parity check can pass.
    const configText = fs.readFileSync(fixture.apiConfigPath, "utf-8");
    expect(configText).toContain("mode: manual");
    expect(configText).toContain("at_hour: 4");
    // The anchor pins the fixed policy bytes and the structural contract; it
    // does not pin the operator-mutable config/env content.
    const anchor = fs.readFileSync(fixture.apiHashPath, "utf-8");
    expect(anchor).toContain(sha256File(fixture.apiPolicyPath));
    // The default profile is untouched.
    expect(fs.readFileSync(fixture.defaultConfigPath, "utf-8")).toBe(DEFAULT_CONFIG);
    expect(fs.readFileSync(fixture.defaultHashPath, "utf-8")).toBe(
      anchorText(fixture.defaultConfigPath, fixture.defaultEnvPath),
    );
  });

  it("bootstrap never prints the generated key", () => {
    const fixture = createFixture();
    const result = bootstrap(fixture);
    expect(result.status, result.stderr).toBe(0);
    const key = apiEnvKey(fixture);
    expect(result.stdout ?? "").not.toContain(key);
    expect(result.stderr ?? "").not.toContain(key);
  });

  it("bootstrap rejects caller-supplied profile names and paths", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    for (const extra of [
      ["--hermes-dir", fixture.apiDir],
      ["--hash-file", fixture.apiHashPath],
      ["--profile", "other"],
      ["api"],
    ]) {
      const result = bootstrap(fixture, extra);
      expect(result.status, `bootstrap must reject args: ${extra.join(" ")}`).not.toBe(0);
    }
  });

  it("bootstrap refuses a caller whose identity is not the privileged owner", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    // A caller whose uid does not match the expected owner uid is refused:
    // a runtime user cannot bootstrap itself an anchor.
    const result = bootstrap(fixture, [], { ownerUid: 0 });
    expect(result.status).not.toBe(0);
  });

  it("a verified bootstrap retry preserves the key and anchor", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    const keyBefore = apiEnvKey(fixture);
    const anchorBefore = fs.readFileSync(fixture.apiHashPath, "utf-8");
    const result = bootstrap(fixture);
    expect(result.status, result.stderr).toBe(0);
    expect(apiEnvKey(fixture)).toBe(keyBefore);
    expect(fs.readFileSync(fixture.apiHashPath, "utf-8")).toBe(anchorBefore);
  });

  it("bootstrap retry tolerates operator edits to config and .env content", () => {
    // The default side legitimately modifies api config/env content; the
    // anchor pins the policy and structure, not the operator-mutable bytes.
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    const rotatedKey = "c".repeat(64);
    fs.writeFileSync(fixture.apiConfigPath, "model:\n  default: operator-chosen\n");
    fs.writeFileSync(fixture.apiEnvPath, `API_SERVER_KEY=${rotatedKey}\n`);
    const result = bootstrap(fixture);
    expect(result.status, "operator edits must survive a verify retry").toBe(0);
    expect(apiEnvKey(fixture)).toBe(rotatedKey);
    expect(fs.readFileSync(fixture.apiConfigPath, "utf-8")).toContain("operator-chosen");
  });

  it("re-seals with a fresh key when the profile exists but the anchor is gone", () => {
    // Rebuild/remnant case: /sandbox persists while the root record does not.
    // The existing files cannot be trusted, so bootstrap must re-seal rather
    // than adopt them.
    const fixture = createFixture();
    fs.mkdirSync(fixture.apiDir, { recursive: true });
    const forgedKey = "f".repeat(64);
    fs.writeFileSync(fixture.apiConfigPath, "model:\n  default: forged\n", { mode: 0o600 });
    fs.writeFileSync(fixture.apiEnvPath, `API_SERVER_KEY=${forgedKey}\n`, { mode: 0o600 });
    const result = bootstrap(fixture);
    expect(result.status, result.stderr).toBe(0);
    expect(apiEnvKey(fixture)).not.toBe(forgedKey);
    expect(fs.existsSync(fixture.apiHashPath)).toBe(true);
  });

  it("fails closed when the sealed policy drifts from a live anchor", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    // Simulate a forged policy while keeping the sealed mode intact, so the
    // digest check — not the mode check — is what must catch the drift.
    fs.chmodSync(fixture.apiPolicyPath, 0o600);
    fs.writeFileSync(fixture.apiPolicyPath, JSON.stringify({ version: "forged" }));
    fs.chmodSync(fixture.apiPolicyPath, 0o440);
    const result = bootstrap(fixture);
    expect(result.status, "policy drift under a live anchor must fail").not.toBe(0);
    expect(fs.readFileSync(fixture.apiPolicyPath, "utf-8")).toContain("forged");
  });

  it("fails closed when the api ownership matrix is broken", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    // A world-writable profile dir lets the runtime replace sealed files.
    fs.chmodSync(fixture.apiDir, 0o777);
    const result = bootstrap(fixture);
    expect(result.status, "weakened dir mode must fail").not.toBe(0);
  });

  it("write-config --profile api advances api state without touching the default profile", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    const defaultAnchorBefore = fs.readFileSync(fixture.defaultHashPath, "utf-8");
    const envBefore = fs.readFileSync(fixture.apiEnvPath, "utf-8");
    const updated = `${fs.readFileSync(fixture.apiConfigPath, "utf-8")}\n# managed update\n`;
    const result = writeApiConfig(fixture, sha256File(fixture.apiConfigPath), updated);
    expect(result.status, result.stderr).toBe(0);
    // The write re-renders the document (managed policy sections are pinned
    // by the image), so assert semantics rather than byte equality.
    const written = fs.readFileSync(fixture.apiConfigPath, "utf-8");
    expect(written).toContain("default: hermes-agent");
    expect(written).toContain("mode: manual");
    expect(fs.readFileSync(fixture.apiEnvPath, "utf-8")).toBe(envBefore);
    // The compat hash snapshot advances to the last written state; the strict
    // anchor keeps pinning the policy and structure.
    expect(fs.readFileSync(fixture.apiCompatHashPath, "utf-8")).toContain(
      sha256File(fixture.apiConfigPath),
    );
    expect(fs.readFileSync(fixture.apiHashPath, "utf-8")).toContain(
      sha256File(fixture.apiPolicyPath),
    );
    expect(fs.readFileSync(fixture.defaultHashPath, "utf-8")).toBe(defaultAnchorBefore);
    expect(fs.readFileSync(fixture.defaultConfigPath, "utf-8")).toBe(DEFAULT_CONFIG);
    expect(fs.existsSync(fixture.defaultStatePath)).toBe(false);
  });

  it("write-config --profile api pins managed sections regardless of caller bytes", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    // Caller omits managed sections and tries to weaken one the template
    // carried — the overlay must restore the image policy values verbatim.
    const callerConfig = [
      "platforms:",
      "  api_server:",
      "    enabled: true",
      "    extra:",
      "      port: 18699",
      "      host: 127.0.0.1",
      "platform_toolsets:",
      "  api_server:",
      "    - file",
      "model:",
      "  default: caller-model",
      "approvals:",
      "  mode: auto",
      "custom_field: preserved",
      "",
    ].join("\n");
    const result = writeApiConfig(
      fixture,
      sha256File(fixture.apiConfigPath),
      callerConfig,
    );
    expect(result.status, result.stderr).toBe(0);
    const written = fs.readFileSync(fixture.apiConfigPath, "utf-8");
    expect(written).toContain("default: caller-model");
    expect(written).toContain("custom_field: preserved");
    // Caller-supplied weaker value was overwritten by the policy.
    expect(written).toContain("mode: manual");
    expect(written).not.toContain("mode: auto");
    expect(written).toContain("at_hour: 4");
  });

  it("bootstrap fails closed when the managed policy is missing", () => {
    const fixture = createFixture();
    fs.rmSync(fixture.managedPolicyPath);
    const result = bootstrap(fixture);
    expect(result.status, "missing managed policy must fail bootstrap").not.toBe(0);
    expect(fs.existsSync(fixture.apiConfigPath)).toBe(false);
  });

  it("write-config --profile api rejects caller-supplied anchor and state paths", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    const digest = sha256File(fixture.apiConfigPath);
    for (const extra of [
      ["--hermes-dir", fixture.apiDir],
      ["--hash-file", fixture.apiHashPath],
      ["--state-file", fixture.apiStatePath],
    ]) {
      const result = writeApiConfig(fixture, digest, "model: {}\n", extra);
      expect(result.status, `must reject ${extra[0]}`).not.toBe(0);
    }
  });

  it("write-config --profile api refuses a stale expected digest", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    const original = fs.readFileSync(fixture.apiConfigPath, "utf-8");
    const result = writeApiConfig(fixture, sha256Text("stale\n"), `${original}\n# x\n`);
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(fixture.apiConfigPath, "utf-8")).toBe(original);
  });

  it("refuses the api transaction when the anchor is not owned by the privileged executor", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    // Every fixture file is test-uid owned; requiring a different owner models
    // a runtime-user-forged anchor.
    const result = runApiGuard(
      fixture,
      [
        "write-config",
        "--profile",
        "api",
        "--expected-config-sha256",
        sha256File(fixture.apiConfigPath),
      ],
      { stdin: "model: {}\n", ownerUid: 0 },
    );
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(fixture.apiConfigPath, "utf-8")).not.toBe("model: {}\n");
  });

  it("fails closed when the api profile directory was replaced", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    const forgedDir = path.join(fixture.apiProfilesDir, "api-forged");
    fs.mkdirSync(forgedDir);
    fs.writeFileSync(path.join(forgedDir, "config.yaml"), "model:\n  default: forged\n", {
      mode: 0o600,
    });
    fs.writeFileSync(path.join(forgedDir, ".env"), `API_SERVER_KEY=${"e".repeat(64)}\n`, {
      mode: 0o600,
    });
    fs.renameSync(fixture.apiDir, path.join(fixture.apiProfilesDir, "api.orig"));
    fs.renameSync(forgedDir, fixture.apiDir);
    const result = writeApiConfig(
      fixture,
      sha256File(fixture.apiConfigPath),
      "model:\n  default: adopted\n",
    );
    expect(result.status, "a replaced profile directory must fail closed").not.toBe(0);
    expect(fs.readFileSync(fixture.apiConfigPath, "utf-8")).toContain("forged");
  });

  it("fails closed on an interrupted api transaction journal", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    fs.writeFileSync(
      fixture.apiStatePath,
      JSON.stringify({ version: 1, phase: "config-write-prepared", hermes_dir: fixture.apiDir }),
      { mode: 0o600 },
    );
    const result = writeApiConfig(fixture, sha256File(fixture.apiConfigPath), "model: {}\n");
    expect(result.status).not.toBe(0);
    expect(fs.readFileSync(fixture.apiConfigPath, "utf-8")).not.toBe("model: {}\n");
  });

  it("fails closed when the api anchor is missing", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    fs.unlinkSync(fixture.apiHashPath);
    const result = writeApiConfig(fixture, sha256File(fixture.apiConfigPath), "model: {}\n");
    expect(result.status).not.toBe(0);
  });

  it("refuses a symlinked api profile directory", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    const realDir = path.join(fixture.apiProfilesDir, "api-real");
    fs.renameSync(fixture.apiDir, realDir);
    fs.symlinkSync(realDir, fixture.apiDir);
    const result = writeApiConfig(
      fixture,
      sha256File(path.join(realDir, "config.yaml")),
      "model: {}\n",
    );
    expect(result.status).not.toBe(0);
  });

  it("verify-api-profile passes on a sealed profile and tolerates operator edits", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    expect(verifyApiProfile(fixture).status).toBe(0);
    // Operator-mutable content must not trip the structural verify.
    fs.writeFileSync(fixture.apiConfigPath, "model:\n  default: operator-chosen\n");
    fs.writeFileSync(fixture.apiEnvPath, `API_SERVER_KEY=${"c".repeat(64)}\n`);
    const result = verifyApiProfile(fixture);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("verified=1");
  });

  it("verify-api-profile survives a container restart remount (st_dev drift)", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    // A sandbox stop/start remounts the overlay filesystem under a new device
    // id while preserving inodes. A record carrying a stale dir_dev must not
    // fail closed — inode identity plus the sealed contract still holds.
    const record = JSON.parse(fs.readFileSync(fixture.apiRecordPath, "utf-8"));
    record.dir_dev = 999999;
    fs.chmodSync(fixture.apiRecordPath, 0o600);
    fs.writeFileSync(fixture.apiRecordPath, `${JSON.stringify(record)}\n`);
    fs.chmodSync(fixture.apiRecordPath, 0o440);
    const result = verifyApiProfile(fixture);
    expect(result.status, result.stderr).toBe(0);
  });

  it("verify-api-profile rejects caller-supplied selectors", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    for (const extra of [
      ["--hermes-dir", fixture.apiDir],
      ["--hash-file", fixture.apiHashPath],
      ["--state-file", fixture.apiStatePath],
      ["--profile", "api"],
      ["api"],
    ]) {
      const result = verifyApiProfile(fixture, extra);
      expect(result.status, `verify must reject args: ${extra.join(" ")}`).not.toBe(0);
    }
  });

  it("verify-api-profile fails closed without a profile or anchor", () => {
    const fixture = createFixture();
    expect(verifyApiProfile(fixture).status).not.toBe(0);
    expect(bootstrap(fixture).status).toBe(0);
    fs.unlinkSync(fixture.apiHashPath);
    expect(verifyApiProfile(fixture).status).not.toBe(0);
  });

  it("verify-api-profile refuses an interrupted api transaction journal", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    fs.writeFileSync(
      fixture.apiStatePath,
      JSON.stringify({ version: 1, phase: "config-write-prepared", hermes_dir: fixture.apiDir }),
      { mode: 0o600 },
    );
    expect(verifyApiProfile(fixture).status).not.toBe(0);
  });

  it("verify-api-profile refuses a profile without a readable generated key", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    fs.writeFileSync(fixture.apiEnvPath, "API_SERVER_KEY=not-generated\n");
    expect(verifyApiProfile(fixture).status).not.toBe(0);
  });

  it("bootstrap seals SOUL.md and skills/ on the admin side", () => {
    // The design surface is part of the sealed contract: admin-owned so the
    // default side can edit it, group-readable for the api runtime, and never
    // runtime-writable.
    const fixture = createFixture();
    const result = bootstrap(fixture);
    expect(result.status, result.stderr).toBe(0);
    const soulPath = path.join(fixture.apiDir, "SOUL.md");
    const skillsDir = path.join(fixture.apiDir, "skills");
    expect(fs.existsSync(soulPath)).toBe(true);
    expect(fs.statSync(soulPath).mode & 0o777).toBe(0o640);
    expect(fs.readFileSync(soulPath, "utf-8")).toContain("Hermes Agent");
    expect(fs.statSync(skillsDir).isDirectory()).toBe(true);
    expect(fs.statSync(skillsDir).mode & 0o7777).toBe(0o2750);
  });

  it("verify-api-profile fails closed when a design file drifts from the contract", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    fs.chmodSync(path.join(fixture.apiDir, "SOUL.md"), 0o666);
    expect(verifyApiProfile(fixture).status).not.toBe(0);
    fs.chmodSync(path.join(fixture.apiDir, "skills"), 0o777);
    expect(verifyApiProfile(fixture).status).not.toBe(0);
  });

  it("bootstrap retry restores the contract on runtime-owned design files", () => {
    // Profiles sealed before SOUL.md/skills joined the contract have them
    // runtime-owned (the gateway creates them at first boot). A retry must
    // re-own them — preserving content — rather than fail closed on drift.
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    const soulPath = path.join(fixture.apiDir, "SOUL.md");
    const skillsDir = path.join(fixture.apiDir, "skills");
    fs.chmodSync(soulPath, 0o660);
    fs.writeFileSync(soulPath, "operator-tuned soul\n");
    fs.chmodSync(skillsDir, 0o700);
    fs.mkdirSync(path.join(skillsDir, "demo"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "demo", "SKILL.md"), "x\n", { mode: 0o600 });
    const result = bootstrap(fixture);
    expect(result.status, result.stderr).toBe(0);
    expect(fs.statSync(soulPath).mode & 0o777).toBe(0o640);
    expect(fs.readFileSync(soulPath, "utf-8")).toBe("operator-tuned soul\n");
    expect(fs.statSync(skillsDir).mode & 0o7777).toBe(0o2750);
    expect(fs.statSync(path.join(skillsDir, "demo")).mode & 0o777).toBe(0o750);
    expect(fs.statSync(path.join(skillsDir, "demo", "SKILL.md")).mode & 0o777).toBe(0o640);
  });

  it("normalize-api-profile repairs design drift and re-verifies the contract", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    fs.chmodSync(path.join(fixture.apiDir, "SOUL.md"), 0o666);
    const result = runApiGuard(fixture, ["normalize-api-profile"]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("normalized=1");
    expect(fs.statSync(path.join(fixture.apiDir, "SOUL.md")).mode & 0o777).toBe(0o640);
  });

  it("normalize-api-profile rejects selectors and non-owner callers", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    for (const extra of [
      ["--profile", "api"],
      ["--hermes-dir", fixture.apiDir],
      ["api"],
    ]) {
      const result = runApiGuard(fixture, ["normalize-api-profile", ...extra]);
      expect(result.status, `normalize must reject args: ${extra.join(" ")}`).not.toBe(0);
    }
    expect(
      runApiGuard(fixture, ["normalize-api-profile"], { ownerUid: 0 }).status,
    ).not.toBe(0);
  });

  it("normalize-api-profile refuses sealed-anchor drift it cannot repair", () => {
    const fixture = createFixture();
    expect(bootstrap(fixture).status).toBe(0);
    // Forging the policy must stay fatal: normalization repairs only the
    // operator-owned design surface, never the sealed bytes.
    fs.chmodSync(fixture.apiPolicyPath, 0o600);
    fs.writeFileSync(fixture.apiPolicyPath, JSON.stringify({ version: "forged" }));
    fs.chmodSync(fixture.apiPolicyPath, 0o440);
    const result = runApiGuard(fixture, ["normalize-api-profile"]);
    expect(result.status).not.toBe(0);
  });
});
