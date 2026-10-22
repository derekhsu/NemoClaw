// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(import.meta.dirname, "../agents/hermes/api-runtime.sh"),
  "utf8",
);
const block = source.slice(
  source.indexOf('if [ "$ACTION" = "stop" ]'),
  source.indexOf('if [ "$ACTION" = "replace" ]; then'),
);
function stop(lockHeld: boolean, portHeld: boolean) {
  // Run the production stop branch; OS boundaries model a supervisor refusing
  // shutdown and an API listener remaining after the supervisor exits.
  return spawnSync(
    "bash",
    [
      "-c",
      `
ACTION=stop
SUPERVISOR_PID_FILE=/nonexistent-pr92-pid
log() { printf '%s\n' "$*" >&2; }
flock() { return ${lockHeld ? 1 : 0}; }
_api_kill_stale_children() { :; }
_api_wait_port_free() { return ${portHeld ? 1 : 0}; }
API_INTERNAL_PORT=18699
PUBLIC_PORT=8642
${block}
`,
    ],
    { encoding: "utf8" },
  );
}
it("refuses success while the previous supervisor owns its lock", () => {
  expect(stop(true, false).status).not.toBe(0);
});
it("refuses success while an API listener remains", () => {
  expect(stop(false, true).status).not.toBe(0);
});
it("reports stopped only after supervisor and listeners exit", () => {
  expect(stop(false, false).status).toBe(0);
});

it("does not treat a listener without a visible owner as a free port", () => {
  const functions = source.slice(
    source.indexOf("_api_wait_port_free() {"),
    source.indexOf("_api_wait_owned_listener() {"),
  );
  const result = spawnSync(
    "bash",
    [
      "-c",
      `
_api_port_owner_pid() { return 1; }
_api_listener_present() { return 0; }
sleep() { :; }
log() { :; }
${functions}
_api_wait_port_free 8642
`,
    ],
    { encoding: "utf8" },
  );
  expect(result.status).not.toBe(0);
});

it("checks stop listeners inside the payload namespace", () => {
  const namespace = source.slice(
    source.indexOf('PAYLOAD_NS_PID=""'),
    source.indexOf("# ── Supervisor singleton"),
  );
  const result = spawnSync(
    "bash",
    [
      "-c",
      `
ACTION=stop
_api_resolve_payload_ns_pid() { PAYLOAD_NS_PID=42; }
readlink() { if [ "$1" = /proc/self/ns/net ]; then echo outer; else echo payload; fi; }
command() { return 0; }
exec() { printf '%s\n' "$*"; }
${namespace}
`,
    ],
    { encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain("nsenter -t 42 -n");
});
