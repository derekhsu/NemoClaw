// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

// OpenShell 0.0.92 with podman drops CAP_KILL and CAP_DAC_OVERRIDE from every
// sandbox. The root api runtime then cannot signal the sandbox-owned
// nemoclaw-start anchor or its hermesapi children, and cannot open
// hermesapi-owned files (#47). Each case runs the production shell function
// with the root-only OS boundary modelled at the edge.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractShellFunction } from "./support/hermes-shell-harness";

const repoRoot = path.resolve(import.meta.dirname, "..");
const apiRuntime = fs.readFileSync(path.join(repoRoot, "agents/hermes/api-runtime.sh"), "utf8");
const supervisor = fs.readFileSync(
  path.join(repoRoot, "scripts/lib/gateway-supervisor.sh"),
  "utf8",
);
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

type FakeProcess = {
  uid: number;
  gid: number;
  cmdline?: string[];
  environ?: string[];
};

function fakeProc(entries: Record<string, FakeProcess>): string {
  const root = tempDir("nemoclaw-47-proc-");
  for (const [pid, entry] of Object.entries(entries)) {
    const dir = path.join(root, pid);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "stat"), `${pid} (python3) S 1 1 1 0 -1\n`);
    fs.writeFileSync(
      path.join(dir, "status"),
      `Name:\tpython3\nUid:\t${entry.uid}\t${entry.uid}\t${entry.uid}\t${entry.uid}\n` +
        `Gid:\t${entry.gid}\t${entry.gid}\t${entry.gid}\t${entry.gid}\n`,
    );
    fs.writeFileSync(path.join(dir, "cmdline"), `${(entry.cmdline ?? ["python3"]).join("\0")}\0`);
    fs.writeFileSync(path.join(dir, "environ"), `${(entry.environ ?? []).join("\0")}\0`);
  }
  return root;
}

function runBash(lines: string[], procRoot: string, trace: string) {
  return spawnSync("bash", ["-c", lines.join("\n")], {
    encoding: "utf8",
    env: { ...process.env, _NEMOCLAW_PROC_ROOT: procRoot, TRACE: trace },
  });
}

function traceLines(trace: string): string[] {
  return fs.existsSync(trace) ? fs.readFileSync(trace, "utf8").split("\n").filter(Boolean) : [];
}

// Root without CAP_KILL: every signal to another UID fails with EPERM.
const killDenied = 'kill() { printf "kill %s\\n" "$*" >>"$TRACE"; return 1; }';
const procRootFn = extractShellFunction(supervisor, "gateway_control_proc_root");

describe("Hermes api runtime without CAP_KILL (#47)", () => {
  it("treats an EPERM kill -0 as live when the pid exists in /proc", () => {
    const procRoot = fakeProc({ "4242": { uid: 998, gid: 999 } });
    const runLiveness = (pid: string, state: string) =>
      runBash(
        [
          killDenied,
          `ps() { printf '${state}\\n'; }`,
          procRootFn,
          extractShellFunction(supervisor, "gateway_control_pid_is_live"),
          `if gateway_control_pid_is_live ${pid}; then echo live; else echo dead; fi`,
        ],
        procRoot,
        "/dev/null",
      );

    const liveAnchor = runLiveness("4242", "S");
    const vanished = runLiveness("4243", "S");
    const zombie = runLiveness("4242", "Z");
    expect(liveAnchor.stdout.trim()).toBe("live");
    expect(vanished.stdout.trim()).toBe("dead");
    // The zombie guard still applies after the /proc fallback.
    expect(zombie.stdout.trim()).toBe("dead");
  });

  it("retries a denied signal as the target's own UID, never for root or vanished targets", () => {
    const procRoot = fakeProc({
      "5001": { uid: 994, gid: 993 },
      "5002": { uid: 0, gid: 0 },
    });
    const runSignal = (pid: string, trace: string) =>
      runBash(
        [
          killDenied,
          'setpriv() { printf "setpriv %s\\n" "$*" >>"$TRACE"; return 0; }',
          procRootFn,
          extractShellFunction(apiRuntime, "_api_signal"),
          `if _api_signal TERM ${pid}; then echo rc=0; else echo rc=1; fi`,
        ],
        procRoot,
        trace,
      );

    const hermesapiTrace = path.join(procRoot, "hermesapi.trace");
    const hermesapi = runSignal("5001", hermesapiTrace);
    expect(hermesapi.stdout.trim()).toBe("rc=0");
    expect(traceLines(hermesapiTrace)).toEqual([
      "kill -s TERM 5001",
      "setpriv --reuid=994 --regid=993 --clear-groups -- kill -s TERM 5001",
    ]);

    const rootTrace = path.join(procRoot, "root.trace");
    const rootOwned = runSignal("5002", rootTrace);
    const vanished = runSignal("5999", rootTrace);
    expect(rootOwned.stdout.trim()).toBe("rc=1");
    expect(vanished.stdout.trim()).toBe("rc=1");
    expect(traceLines(rootTrace)).toEqual(["kill -s TERM 5002", "kill -s TERM 5999"]);
  });

  it("does not switch UID when the direct signal succeeds", () => {
    const procRoot = fakeProc({ "5001": { uid: 994, gid: 993 } });
    const direct = runBash(
      [
        "kill() { return 0; }",
        "setpriv() { echo unexpected-setpriv; return 1; }",
        procRootFn,
        extractShellFunction(apiRuntime, "_api_signal"),
        "_api_signal TERM 5001 && echo rc=0",
      ],
      procRoot,
      "/dev/null",
    );
    expect(direct.stdout.trim()).toBe("rc=0");
  });

  it("stops a hermesapi child with TERM, then KILL, through the UID-retrying signal", () => {
    const procRoot = fakeProc({ "6001": { uid: 994, gid: 993 } });
    const trace = path.join(procRoot, "stop.trace");
    const stopped = runBash(
      [
        killDenied,
        'setpriv() { printf "setpriv %s\\n" "$*" >>"$TRACE"; return 0; }',
        "gateway_control_pid_matches_start_identity() { return 0; }",
        "gateway_control_pid_is_live() { return 0; }",
        "sleep() { :; }",
        "log() { :; }",
        procRootFn,
        extractShellFunction(apiRuntime, "_api_signal"),
        extractShellFunction(apiRuntime, "_api_stop_child"),
        '_api_stop_child 6001 "start-6001" "api profile gateway"',
      ],
      procRoot,
      trace,
    );
    expect(stopped.status, stopped.stderr).toBe(0);
    expect(traceLines(trace)).toEqual([
      "kill -s TERM 6001",
      "setpriv --reuid=994 --regid=993 --clear-groups -- kill -s TERM 6001",
      "kill -s KILL 6001",
      "setpriv --reuid=994 --regid=993 --clear-groups -- kill -s KILL 6001",
    ]);
  });

  it("removes stale hermesapi children of a previous supervisor and leaves others alone", () => {
    const apiHome = "/sandbox/.hermes-api/profiles/api";
    const procRoot = fakeProc({
      "7001": {
        uid: 994,
        gid: 993,
        cmdline: [
          "/opt/hermes/.venv/bin/python3",
          "-I",
          "/usr/local/lib/nemoclaw/hermes-api-prefix-proxy.py",
        ],
      },
      "7002": {
        uid: 994,
        gid: 993,
        cmdline: ["/opt/hermes/.venv/bin/python", "/usr/local/bin/hermes.real", "gateway", "run"],
        environ: [`HERMES_HOME=${apiHome}`],
      },
      "7003": {
        uid: 998,
        gid: 999,
        cmdline: ["/opt/hermes/.venv/bin/python", "/usr/local/bin/hermes.real", "gateway", "run"],
        environ: ["HERMES_HOME=/sandbox/.hermes"],
      },
    });
    const trace = path.join(procRoot, "stale.trace");
    const cleaned = runBash(
      [
        killDenied,
        'setpriv() { printf "setpriv %s\\n" "$*" >>"$TRACE"; return 0; }',
        "log() { :; }",
        `API_PROFILE_HOME=${apiHome}`,
        procRootFn,
        extractShellFunction(apiRuntime, "_api_signal"),
        extractShellFunction(apiRuntime, "_api_kill_stale_children"),
        "_api_kill_stale_children",
      ],
      procRoot,
      trace,
    );
    expect(cleaned.status, cleaned.stderr).toBe(0);
    const retried = traceLines(trace).filter((line) => line.startsWith("setpriv"));
    expect(retried.sort()).toEqual([
      "setpriv --reuid=994 --regid=993 --clear-groups -- kill -s TERM 7001",
      "setpriv --reuid=994 --regid=993 --clear-groups -- kill -s TERM 7002",
    ]);
  });

  it("opens the hermesapi log and removes runtime files only after the step-down", () => {
    const dir = tempDir("nemoclaw-47-spawn-");
    const trace = path.join(dir, "spawn.trace");
    // The log directory appears only once the step-down runs, so the log can be
    // opened by the stepped-down process but not by root before it.
    const stepDown = path.join(dir, "step-down");
    fs.writeFileSync(
      stepDown,
      `#!/usr/bin/env bash\nprintf 'step-down %s\\n' "$*" >>"$TRACE"\nmkdir -p "${dir}/logs"\nexec "$@"\n`,
      { mode: 0o755 },
    );
    const hermes = path.join(dir, "hermes");
    fs.writeFileSync(hermes, '#!/usr/bin/env bash\necho "gateway $*"\n', {
      mode: 0o755,
    });
    const proxy = path.join(dir, "proxy.py");
    const python = path.join(dir, "python");
    fs.writeFileSync(python, '#!/usr/bin/env bash\necho "proxy $*"\n', {
      mode: 0o755,
    });

    const spawned = runBash(
      [
        `STEP_DOWN_PREFIX_API=(${stepDown})`,
        `API_PROFILE_HOME=${dir}/profile`,
        `GATEWAY_LOG=${dir}/logs/api-gateway.log`,
        `PROXY_LOG=${dir}/logs/api-proxy.log`,
        `RUNTIME_LOG=${dir}/api-runtime.log`,
        `_HERMES=${hermes}`,
        `_HERMES_PYTHON=${python}`,
        `_PROXY=${proxy}`,
        "PUBLIC_PORT=8642 MAIN_INTERNAL_PORT=18642 API_INTERNAL_PORT=18699",
        "_api_prepare_log() { :; }",
        "_api_apply_proxy_env() { :; }",
        'gateway_control_pid_start_identity() { printf "start-%s\\n" "$1"; }',
        "log() { :; }",
        extractShellFunction(apiRuntime, "_api_spawn_gateway"),
        extractShellFunction(apiRuntime, "_api_spawn_proxy"),
        "_api_spawn_gateway && wait $API_GATEWAY_PID",
        "_api_spawn_proxy && wait $API_PROXY_PID",
      ],
      "/proc",
      trace,
    );

    expect(spawned.status, spawned.stderr).toBe(0);
    expect(traceLines(trace)[0]).toBe(
      `step-down rm -f ${dir}/profile/runtime/gateway.pid ${dir}/profile/runtime/gateway.lock`,
    );
    const gatewayLog = fs.readFileSync(path.join(dir, "logs", "api-gateway.log"), "utf8");
    const proxyLog = fs.readFileSync(path.join(dir, "logs", "api-proxy.log"), "utf8");
    expect(gatewayLog).toBe("gateway gateway run\n");
    expect(proxyLog).toBe(`proxy -I ${proxy}\n`);
  });
});
