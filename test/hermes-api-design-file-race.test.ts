// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";

it.each([
  ["SOUL.md", "symlink"],
  ["SOUL.md", "fifo"],
  ["skill", "symlink"],
  ["skill", "fifo"],
])("refuses a %s %s swap without blocking or changing its target permissions", (surface, replacement) => {
  const guard = path.resolve(import.meta.dirname, "../agents/hermes/runtime-config-guard.py");
  const result = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      String.raw`
import importlib.util, os, pathlib, stat, sys, tempfile
replacement = sys.argv[2]
surface = sys.argv[3]
spec = importlib.util.spec_from_file_location("guard", sys.argv[1])
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as root:
    home = pathlib.Path(root) / "api"
    home.mkdir()
    soul = home / "SOUL.md"
    soul.write_text("design")
    skills = home / "skills"
    skills.mkdir()
    skill = skills / "SKILL.md"
    skill.write_text("skill")
    target = soul if surface == "SOUL.md" else skill
    victim = pathlib.Path(root) / "private"
    victim.write_text("private")
    victim.chmod(0o600)
    m.HERMES_API_PROFILE_DIR = str(home)
    original = os.lstat
    swapped = False
    def swap_after_check(name, *args, **kwargs):
        global swapped
        before = original(name, *args, **kwargs)
        if str(name) == str(target) and not swapped:
            swapped = True
            target.unlink()
            if replacement == "fifo":
                os.mkfifo(target)
            else:
                target.symlink_to(victim)
        return before
    m.os.lstat = swap_after_check
    try:
        m._api_ensure_design_surface(os.getuid(), os.getgid())
    except (OSError, m.UnsafePathError):
        pass
    else:
        raise AssertionError("accepted design-file replacement")
    finally:
        m.os.lstat = original
    assert stat.S_IMODE(victim.stat().st_mode) == 0o600
print("denied")
`,
      guard,
      replacement,
      surface,
    ],
    { encoding: "utf8", timeout: 3000 },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe("denied");
});
