// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

// OpenShell puts the PID 1 supervisor at a driver-specific path (#72): the
// 0.0.x drivers and the 0.1.x Podman driver use /opt/openshell/bin, while the
// 0.1.x Docker and Kubernetes drivers use /.openshell/runtime. The OpenClaw
// image surfaces that authenticate PID 1 accept exactly those two argv0 values;
// every other value, including prefix, basename, and path-traversal lookalikes,
// must keep failing closed.

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const REPO_ROOT = path.join(import.meta.dirname, "..");
const OPENCLAW_GUARD = path.join(REPO_ROOT, "scripts", "openclaw-config-guard.py");
const MANAGED_CONTROL = path.join(REPO_ROOT, "scripts", "managed-gateway-control.py");
const CONTROL_HELPER = path.join(REPO_ROOT, "scripts", "gateway-control.sh");
const VALID_NONCE = "a".repeat(64);

const ALLOWED_ARGV0 = [
  "/opt/openshell/bin/openshell-sandbox",
  "/.openshell/runtime/openshell-sandbox",
] as const;

const UNKNOWN_ARGV0 = [
  "openshell-sandbox",
  "/usr/bin/openshell-sandbox",
  "/opt/openshell/bin/openshell-sandbox.real",
  "/opt/openshell/bin/../bin/openshell-sandbox",
  "/.openshell/runtime/../runtime/openshell-sandbox",
  "/.openshell/runtime/openshell-sandbox/",
  "/tmp/.openshell/runtime/openshell-sandbox",
  "/.openshell/runtime/openshell-sandbox-shim",
  "/.openshell/runtime/supervisor",
] as const;

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function runPython(source: string, args: readonly string[]) {
  const result = spawnSync("python3", ["-c", source, ...args], {
    encoding: "utf-8",
    timeout: 5000,
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as unknown;
}

const OPENCLAW_GUARD_PID1_FIXTURE = String.raw`
import importlib.util
import json
import os
import sys
import tempfile

spec = importlib.util.spec_from_file_location("guard", sys.argv[1])
guard = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = guard
spec.loader.exec_module(guard)

def prove(argv0):
    with tempfile.TemporaryDirectory() as root:
        process_dir = os.path.join(root, "proc", "1")
        os.makedirs(os.path.join(process_dir, "ns"))
        namespace = os.path.join(root, "pid-namespace")
        with open(namespace, "wb") as stream:
            stream.write(b"ns")
        os.link(namespace, os.path.join(process_dir, "ns", "pid"))
        with open(os.path.join(process_dir, "cmdline"), "wb") as stream:
            stream.write(argv0 + b"\0--bootstrap\0/.openshell/channel/sandbox/bootstrap.json\0")
        fields = ["S", "0"] + (["0"] * 17) + ["424242"]
        with open(os.path.join(process_dir, "stat"), "w", encoding="ascii") as stream:
            stream.write(f"1 (openshell-sandbox) {' '.join(fields)}\n")
        with open(os.path.join(process_dir, "status"), "w", encoding="ascii") as stream:
            stream.write("Uid:\t0\t0\t0\t0\nNSpid:\t1\n")
        guard.PROC_ROOT = os.path.join(root, "proc")
        identity = guard._openshell_supervisor_identity(0)
        return identity is not None and identity[0] == "424242"

print(json.dumps([prove(value.encode()) for value in json.loads(sys.argv[2])]))
`;

const MANAGED_CONTROL_FIXTURE = String.raw`
import importlib.util
import json
import sys

spec = importlib.util.spec_from_file_location("managed_gateway_control", sys.argv[1])
control = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = control
spec.loader.exec_module(control)

def is_openshell(argv0):
    return control._is_openshell(control.ProcessIdentity(
        pid=1,
        start_time="111",
        parent_pid=0,
        state="S",
        uids=(0, 0, 0, 0),
        namespace_pid=1,
        namespace_inode=4242,
        cmdline=(argv0, b"--bootstrap", b"/.openshell/channel/sandbox/bootstrap.json"),
        proc_device=1,
        proc_inode=1,
    ))

print(json.dumps([is_openshell(value.encode()) for value in json.loads(sys.argv[2])]))
`;

describe("OpenClaw config guard supervisor PID 1 identity (#72)", () => {
  it("proves the supervisor for the Podman and the Docker/Kubernetes driver paths", () => {
    expect(
      runPython(OPENCLAW_GUARD_PID1_FIXTURE, [OPENCLAW_GUARD, JSON.stringify(ALLOWED_ARGV0)]),
    ).toEqual([true, true]);
  });

  it("fails closed for every argv0 outside the exact allowlist", () => {
    expect(
      runPython(OPENCLAW_GUARD_PID1_FIXTURE, [OPENCLAW_GUARD, JSON.stringify(UNKNOWN_ARGV0)]),
    ).toEqual(UNKNOWN_ARGV0.map(() => false));
  });
});

describe("managed gateway control supervisor PID 1 identity (#72)", () => {
  it("accepts the Podman and the Docker/Kubernetes driver paths", () => {
    expect(
      runPython(MANAGED_CONTROL_FIXTURE, [MANAGED_CONTROL, JSON.stringify(ALLOWED_ARGV0)]),
    ).toEqual([true, true]);
  });

  it("fails closed for every argv0 outside the exact allowlist", () => {
    expect(
      runPython(MANAGED_CONTROL_FIXTURE, [MANAGED_CONTROL, JSON.stringify(UNKNOWN_ARGV0)]),
    ).toEqual(UNKNOWN_ARGV0.map(() => false));
  });
});

describe("root gateway control router supervisor detection (#72)", () => {
  function route(argv0: string) {
    const root = temporaryDirectory("nemoclaw-supervisor-argv0-");
    const procRoot = path.join(root, "proc");
    mkdirSync(path.join(procRoot, "1"), { recursive: true });
    writeFileSync(
      path.join(procRoot, "1", "cmdline"),
      Buffer.from(`${argv0}\0--bootstrap\0/.openshell/channel/sandbox/bootstrap.json\0`),
    );
    const managedHelper = path.join(root, "managed-gateway-control.py");
    writeFileSync(managedHelper, 'print("managed-helper")\n');
    chmodSync(managedHelper, 0o755);
    return spawnSync(CONTROL_HELPER, ["probe", VALID_NONCE], {
      encoding: "utf-8",
      timeout: 5000,
      env: {
        ...process.env,
        NEMOCLAW_TEST_GATEWAY_CONTROL_PROC_ROOT: procRoot,
        NEMOCLAW_TEST_MANAGED_GATEWAY_CONTROL_HELPER: managedHelper,
        NEMOCLAW_TEST_GATEWAY_CONTROL_CALLER_UID: "0",
        NEMOCLAW_GATEWAY_CONTROL_DIR: path.join(root, "absent-control-dir"),
      },
    });
  }

  it.each(ALLOWED_ARGV0)("hands %s to the managed helper", (argv0) => {
    const result = route(argv0);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe("managed-helper");
  });

  it.each(UNKNOWN_ARGV0)("does not treat %s as the OpenShell supervisor", (argv0) => {
    const result = route(argv0);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe("SUPERVISOR_UNAVAILABLE");
  });
});
