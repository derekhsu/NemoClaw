// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PATCHER = path.resolve("agents/hermes/patch-cron-restore-drain.py");

const DRAIN_SOURCE = `from pathlib import Path
from utils import atomic_json_write

_DRAIN_REQUEST_FILENAME = ".drain_request.json"


@functools.lru_cache(maxsize=1)
def current_instantiation_epoch():
    return "epoch"

def drain_requested(*, home: Optional[Path] = None) -> bool:
    """True iff a begin-drain marker for THIS instantiation is present.
    """
    return True


def drain_notification_suppressed(*, home: Optional[Path] = None) -> bool:
    return False
`;

const RUN_SOURCE = `class GatewayRunner(GatewayAuthorizationMixin, GatewayKanbanWatchersMixin, GatewaySlashCommandsMixin):
    def __init__(self):
        # External (NAS-driven) drain state — distinct from the shutdown
        # \`\`_draining\`\` flag above. Set by \`\`_drain_control_watcher\`\` when the
        # \`\`.drain_request.json\`\` marker is present: the gateway flips
        # \`\`gateway_state -> draining\`\` and refuses NEW turns, but the process
        # does NOT exit (the whole point — quiesce-without-restart, D4a). It is
        # fully reversible: removing the marker reverts to \`\`running\`\` and
        # re-accepts turns. \`\`_draining\`\` (shutdown) is one-way and ends in
        # process exit; this one is a steady state NAS polls during its
        # request -> poll -> proceed loop.
        self._external_drain_active = False

    def _enter_external_drain(self):
        if self._external_drain_active:
            return
`;

interface Fixture {
  drainControl: string;
  gatewayRun: string;
  root: string;
}

function createFixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-cron-drain-patch-"));
  const drainControl = path.join(root, "drain_control.py");
  const gatewayRun = path.join(root, "run.py");
  fs.writeFileSync(drainControl, DRAIN_SOURCE);
  fs.writeFileSync(gatewayRun, RUN_SOURCE);
  return { drainControl, gatewayRun, root };
}

function runPatcher(fixture: Fixture) {
  return spawnSync(
    process.env.PYTHON || "python3",
    ["-I", PATCHER, "--drain-control", fixture.drainControl, "--gateway-run", fixture.gatewayRun],
    { encoding: "utf8" },
  );
}

describe("Hermes cron restore drain source patch", () => {
  it("composes independent drains and hydrates the startup gate synchronously", () => {
    const fixture = createFixture();
    try {
      const first = runPatcher(fixture);
      const firstDrain = fs.readFileSync(fixture.drainControl, "utf8");
      const firstRun = fs.readFileSync(fixture.gatewayRun, "utf8");
      const second = runPatcher(fixture);

      expect(first.status).toBe(0);
      expect(first.stderr).toBe("");
      expect(second.status).toBe(0);
      expect(second.stderr).toBe("");
      expect(fs.readFileSync(fixture.drainControl, "utf8")).toBe(firstDrain);
      expect(fs.readFileSync(fixture.gatewayRun, "utf8")).toBe(firstRun);
      expect(firstDrain).toContain('"/sandbox/.nemoclaw/hermes-cron-restore-drain.json"');
      expect(firstDrain).toContain("def operator_drain_requested(");
      expect(firstDrain).toContain("def nemoclaw_cron_restore_drain_requested(");
      expect(firstDrain).toContain("state_root_fd = os.open(state_root, flags)");
      expect(firstDrain).toContain("metadata = os.fstat(state_root_fd)");
      expect(firstDrain).toContain("dir_fd=state_root_fd");
      expect(firstDrain).toContain("metadata.st_uid != 0");
      expect(firstDrain).toContain("stat.S_IMODE(metadata.st_mode) & 0o022");
      expect(firstDrain).toContain(
        "nemoclaw_cron_restore_drain_requested()\n        or operator_drain_requested(home=home)",
      );
      expect(firstRun).toContain("self._external_drain_active = drain_requested()");
      expect(firstRun).toContain(
        'if self._external_drain_active:\n            self._update_runtime_status("draining")',
      );
      expect(firstRun).not.toContain("self._external_drain_active = False");
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("keeps untrusted state roots drained after directory replacement", () => {
    const fixture = createFixture();
    try {
      expect(runPatcher(fixture).status).toBe(0);
      const result = spawnSync(
        process.env.PYTHON || "python3",
        [
          "-I",
          "-c",
          String.raw`
import ast, json, os, stat, sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

source = ast.parse(Path(sys.argv[1]).read_text())
function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == "nemoclaw_cron_restore_drain_requested")
state_root = Path(sys.argv[2]) / "state"
state_root.mkdir(mode=0o755)
marker = state_root / "hermes-cron-restore-drain.json"
namespace = {"_NEMOCLAW_CRON_RESTORE_DRAIN_PATH": marker}
exec(compile(ast.Module(body=[function], type_ignores=[]), "patched-drain", "exec"), namespace)
predicate = namespace["nemoclaw_cron_restore_drain_requested"]
results = []
for euid, uid, gid, mode, present in [
    (1000, 1000, 1000, 0o755, False),
    (1000, 1000, 1000, 0o755, True),
    (0, 0, 0, 0o755, False),
    (0, 1000, 1000, 0o755, False),
    (1000, 1001, 1001, 0o755, False),
    (0, 0, 1000, 0o755, False),
    (1000, 0, 0, 0o755, False),
    (1000, 1000, 1000, 0o775, False),
    (1000, 1000, 1000, 0o777, False),
]:
    if present:
        marker.touch()
    else:
        marker.unlink(missing_ok=True)
    metadata = SimpleNamespace(st_mode=stat.S_IFDIR | mode, st_uid=uid, st_gid=gid)
    with patch("os.geteuid", return_value=euid), patch("os.fstat", return_value=metadata):
        results.append(predicate())
state_root.rmdir()
state_root.symlink_to(Path(sys.argv[2]), target_is_directory=True)
results.append(predicate())
state_root.unlink()
state_root.mkdir(mode=0o755)
marker.touch()
original_inode = state_root.stat().st_ino
original_fstat = os.fstat

def identity(fd):
    metadata = original_fstat(fd)
    uid = 0 if metadata.st_ino == original_inode else 1000
    return SimpleNamespace(st_mode=metadata.st_mode, st_uid=uid, st_gid=0)

with patch("os.geteuid", return_value=1000), patch("os.fstat", side_effect=identity):
    results.append(predicate())
    held = state_root.with_name("held-root")
    state_root.rename(held)
    state_root.mkdir(mode=0o755)
    assert (held / marker.name).exists()
    assert not marker.exists()
    results.append(predicate())
print(json.dumps(results))
`,
          fixture.drainControl,
          fixture.root,
        ],
        { encoding: "utf8", timeout: 5000 },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([
        true,
        true,
        false,
        true,
        true,
        true,
        false,
        true,
        true,
        true,
        true,
        true,
      ]);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects a partially applied two-file patch", () => {
    const fixture = createFixture();
    try {
      expect(runPatcher(fixture).status).toBe(0);
      fs.writeFileSync(fixture.gatewayRun, RUN_SOURCE);

      const result = runPatcher(fixture);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("patch is only partially applied");
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails closed when the pinned drain predicate shape drifts", () => {
    const fixture = createFixture();
    try {
      fs.writeFileSync(
        fixture.drainControl,
        DRAIN_SOURCE.replace(".drain_request.json", ".changed.json"),
      );

      const result = runPatcher(fixture);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("drain predicate is neither wholly");
      expect(fs.readFileSync(fixture.gatewayRun, "utf8")).toBe(RUN_SOURCE);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
});
