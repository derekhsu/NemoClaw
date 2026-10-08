// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractShellFunction, runHermesBashHarness } from "./support/hermes-shell-harness";

const start = path.join(import.meta.dirname, "../agents/hermes/start.sh");
const guard = path.join(import.meta.dirname, "../agents/hermes/runtime-config-guard.py");

it.each([
  "after-poll",
  "before-poll",
  "unfinished",
])("recovers a completed transaction gateway exit %s", (scenario) => {
  const source = fs.readFileSync(start, "utf8");
  const result = runHermesBashHarness([
    "GATEWAY_PID=21",
    "GATEWAY_PID_START_IDENTITY=1200",
    "INTERNAL_PORT=18642",
    "HERMES_MANAGED_DEFAULT_PENDING=1",
    "HERMES_MANAGED_GATEWAY_EXIT_COUNT=0",
    scenario === "after-poll" ? "CHECKS=0" : "CHECKS=1",
    'hermes_tracked_role_is_current() { (( CHECKS+=1 )); [ "$CHECKS" -le 1 ]; }',
    // The real marker check must clear pending before the subsequent exit.
    scenario === "unfinished"
      ? '[() { case "$*" in *\'/sandbox/.hermes/.nemoclaw-hermes-restart-seal\'*) case "$1 $2" in "! -e") return 1 ;; *) return 0 ;; esac ;; *) builtin [ "$@" ;; esac; }'
      : '[() { case "$*" in *\'/sandbox/.hermes/.nemoclaw-hermes-restart-seal\'*) builtin [ "$1" = "!" ]; return ;; *) builtin [ "$@" ;; esac; }',
    "stat() { printf '0:0 600 1\\n'; }",
    "hermes_gateway_healthy() { return 0; }",
    "ensure_hermes_supervised_auxiliaries() { return 0; }",
    "refresh_hermes_supervised_child_pids() { :; }",
    "sleep() { :; }",
    "mark_hermes_gateway_stopped() { :; }",
    "hermes_managed_gateway_exit_was_host_authorized() { HERMES_MANAGED_DEFAULT_TOKEN=; return 1; }",
    "record_hermes_managed_gateway_exit() { HERMES_MANAGED_GATEWAY_EXIT_COUNT=1; }",
    "recover_hermes_gateway_current_user() { printf 'recovered pending=%s\\n' \"$HERMES_MANAGED_DEFAULT_PENDING\"; exit 0; }",
    extractShellFunction(source, "hermes_managed_default_transaction_pending"),
    extractShellFunction(source, "supervise_hermes_gateway_current_user"),
    "supervise_hermes_gateway_current_user",
  ]);
  if (scenario === "unfinished") {
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("refusing automatic recovery");
  } else {
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("recovered pending=0\n");
  }
});

const finishHarness = String.raw`
import importlib.util, json, pathlib, sys, tempfile
spec = importlib.util.spec_from_file_location("guard", sys.argv[1])
g = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = g
spec.loader.exec_module(g)
scenario = sys.argv[2]
with tempfile.TemporaryDirectory() as tmp:
    root = pathlib.Path(tmp)
    proc = root / "proc"
    pid = proc / "42"
    pid.mkdir(parents=True)
    def process_stat(state="S", start="1200"):
        # Linux stat field 22 is starttime; comm may contain a closing paren.
        return "42 (hermes gateway) worker) " + " ".join([state, "10"] + ["0"] * 17 + [start]) + "\n"
    (pid / "stat").write_text(process_stat("Z" if scenario == "zombie" else "S"))
    g.PROC_ROOT = str(proc)
    g.HERMES_RESTART_STATE_FILE = str(root / "journal")
    receipt = {"gateway_pid": 42, "gateway_start_time": "1200"}
    if scenario == "reused":
        (pid / "stat").write_text(process_stat(start="1201"))
    elif scenario == "missing":
        (pid / "stat").unlink()
    elif scenario == "invalid-receipt":
        receipt["gateway_pid"] = True
    state = {"version": 1, "phase": "managed-default-prepared", "managed_default": {"healthy": receipt}}
    g._write_restart_state(g.HERMES_RESTART_STATE_FILE, state, create=True)
    g.inspect_managed_default_transaction = lambda token: g._load_restart_state(g.HERMES_RESTART_STATE_FILE)
    # Hash/seal mutations need root image paths. Keep procfs identity reads real.
    g.refresh_hashes = lambda *args, **kwargs: None
    g._record_current_sealed_inodes = lambda *args: None
    completed = root / "completed"
    g.unseal_restart = lambda *args: completed.write_text("unsealed")
    original = pathlib.Path(g.HERMES_RESTART_STATE_FILE).read_bytes()
    if scenario in {"raced-start", "raced-zombie"}:
        read = g._read_proc_pid_file
        calls = [0]
        def mutate_after_read(fd, name, display):
            value = read(fd, name, display)
            if name == "stat":
                calls[0] += 1
                if calls[0] == 1:
                    (pid / "stat").write_text(process_stat(
                        state="Z" if scenario == "raced-zombie" else "S",
                        start="1201" if scenario == "raced-start" else "1200",
                    ))
            return value
        g._read_proc_pid_file = mutate_after_read
    rejected = False
    try:
        g.finish_managed_default("a" * 64)
    except g.UnsafePathError:
        rejected = True
    if scenario == "live":
        assert not rejected and completed.exists(), "live gateway was not unsealed"
        assert g._load_restart_state(g.HERMES_RESTART_STATE_FILE)["phase"] == "sealed"
    else:
        assert rejected, "unavailable gateway was accepted: " + scenario
        assert not completed.exists(), "rejected gateway was unsealed"
        assert pathlib.Path(g.HERMES_RESTART_STATE_FILE).read_bytes() == original, "rejected receipt advanced the journal"
`;

describe("managed default completion identity", () => {
  it.each([
    "live",
    "zombie",
    "reused",
    "missing",
    "invalid-receipt",
    "raced-start",
    "raced-zombie",
  ])("validates gateway identity %s before completing the transaction", (scenario) => {
    const result = spawnSync("python3", ["-c", finishHarness, guard, scenario], {
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status, result.stderr).toBe(0);
  });
});
