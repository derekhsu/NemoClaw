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
    original_fstat = os.fstat
    target_stat = original(target)
    swapped = False
    original_open = os.open
    def swap_before_open(name, flags, *args, **kwargs):
        global swapped
        if str(name) in {str(target), target.name} and not swapped:
            swapped = True
            target.unlink()
            if replacement == "fifo":
                os.mkfifo(target)
            else:
                target.symlink_to(victim)
        return original_open(name, flags, *args, **kwargs)
    def recycled_fifo_identity(fd):
        opened = original_fstat(fd)
        if replacement == "fifo" and stat.S_ISFIFO(opened.st_mode):
            # Linux may reuse an unlinked inode for the replacement FIFO.
            # Keep its real type while making that case deterministic.
            fields = list(opened)
            fields[1] = target_stat.st_ino
            fields[2] = target_stat.st_dev
            return os.stat_result(fields)
        return opened
    m.os.open = swap_before_open
    m.os.fstat = recycled_fifo_identity
    try:
        m._api_ensure_design_surface(os.getuid(), os.getgid())
    except (OSError, m.UnsafePathError):
        pass
    else:
        raise AssertionError("accepted design-file replacement")
    finally:
        m.os.open = original_open
        m.os.fstat = original_fstat
    assert swapped, "design-file replacement probe did not run"
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

it.each([
  "symlink",
  "rename-out",
])("does not follow a replaced skill ancestor into an unrelated file (%s)", (replacement) => {
  const guard = path.resolve(import.meta.dirname, "../agents/hermes/runtime-config-guard.py");
  const result = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      String.raw`
import importlib.util, os, pathlib, shutil, stat, sys, tempfile
replacement = sys.argv[2]
spec = importlib.util.spec_from_file_location("guard", sys.argv[1])
m = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = m
spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as root:
    home = pathlib.Path(root) / "api"
    home.mkdir()
    (home / "SOUL.md").write_text("design")
    skills = home / "skills"
    nested = skills / "nested"
    nested.mkdir(parents=True)
    (nested / "passwd").write_text("skill")
    outside = pathlib.Path(root) / "outside"
    outside.mkdir()
    victim = outside / "passwd"
    victim.write_text("private")
    victim.chmod(0o600)
    m.HERMES_API_PROFILE_DIR = str(home)
    original_lstat = os.lstat
    original_stat = os.stat
    nested_identity = original_stat(nested)
    swapped = False
    def swap_before_descendant_stat(name, *args, **kwargs):
        global swapped
        parent_fd = kwargs.get("dir_fd")
        pinned_parent = os.fstat(parent_fd) if parent_fd is not None else None
        descendant = str(name) == str(nested / "passwd") or (
            str(name) == "passwd" and pinned_parent is not None and
            (pinned_parent.st_dev, pinned_parent.st_ino) ==
            (nested_identity.st_dev, nested_identity.st_ino)
        )
        if not swapped and descendant:
            swapped = True
            if replacement == "symlink":
                nested.rename(nested.with_name("nested-real"))
                nested.symlink_to(outside, target_is_directory=True)
            else:
                shutil.move(str(nested), str(outside / "nested"))
                nested.symlink_to(outside, target_is_directory=True)
    def racing_lstat(name, *args, **kwargs):
        swap_before_descendant_stat(name, *args, **kwargs)
        return original_lstat(name, *args, **kwargs)
    def racing_stat(name, *args, **kwargs):
        swap_before_descendant_stat(name, *args, **kwargs)
        return original_stat(name, *args, **kwargs)
    m.os.lstat = racing_lstat
    m.os.stat = racing_stat
    try:
        m._api_ensure_design_surface(os.getuid(), os.getgid())
    except (OSError, m.UnsafePathError):
        pass
    finally:
        m.os.lstat = original_lstat
        m.os.stat = original_stat
    assert swapped, "ancestor replacement probe did not run"
    assert stat.S_IMODE(victim.stat().st_mode) == 0o600
    assert victim.stat().st_uid == os.getuid()
    assert victim.read_text() == "private"
print("contained")
`,
      guard,
      replacement,
    ],
    { encoding: "utf8", timeout: 3000 },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe("contained");
});
