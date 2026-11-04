// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { extractShellFunction } from "./support/hermes-shell-harness";

const repoRoot = path.join(import.meta.dirname, "..");
const patcher = path.join(repoRoot, "agents", "hermes", "patch-discord-recovery-permissions.py");
const dockerfile = fs.readFileSync(path.join(repoRoot, "agents", "hermes", "Dockerfile"), "utf8");
const imageBuildProbes = fs.readFileSync(
  path.join(repoRoot, "agents", "hermes", "image-build-probes.py"),
  "utf8",
);
const baseDockerfile = fs.readFileSync(
  path.join(repoRoot, "agents", "hermes", "Dockerfile.base"),
  "utf8",
);
const startScript = fs.readFileSync(path.join(repoRoot, "agents", "hermes", "start.sh"), "utf8");
const fixtures: string[] = [];

const exactUpstreamFixture = `\
import os

_DB_FILENAME = "discord_message_recovery.db"


class DiscordRecoveryStore:
    def path(self):
        directory = self._hermes_home / "gateway"
        directory.mkdir(parents=True, exist_ok=True)
        return directory / _DB_FILENAME

    def call(self, path):
        os.chmod(path, 0o600)
`;

function fixtureFile(source = exactUpstreamFixture): string {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-discord-recovery-patch-"));
  fixtures.push(fixture);
  const file = path.join(fixture, "recovery.py");
  fs.writeFileSync(file, source);
  return file;
}

function runPatcher(file: string) {
  return spawnSync("python3", ["-I", patcher, file], {
    encoding: "utf8",
    timeout: 5000,
  });
}

function runCrossUidParentRepair(name: "gateway" | "runtime", kind: "symlink" | "file") {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-hermes-shared-parent-"));
  fixtures.push(fixture);
  const hermesHome = path.join(fixture, ".hermes");
  const stateDir = path.join(hermesHome, name);
  const script = path.join(fixture, "repair.sh");
  fs.mkdirSync(hermesHome);
  const setup: Record<typeof kind, () => void> = {
    symlink: () => {
      const target = path.join(fixture, `${name}-target`);
      fs.mkdirSync(target);
      fs.symlinkSync(target, stateDir);
    },
    file: () => fs.writeFileSync(stateDir, "unsafe\n"),
  };
  setup[kind]();
  fs.writeFileSync(
    script,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      extractShellFunction(startScript, "ensure_hermes_cross_uid_state_dir"),
      `ensure_hermes_cross_uid_state_dir ${name}`,
    ].join("\n"),
  );
  return spawnSync("bash", [script], {
    encoding: "utf8",
    env: { ...process.env, HERMES_DIR: hermesHome },
    timeout: 5000,
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

describe("Hermes cross-UID ledger permissions", () => {
  it("patches only the exact pinned upstream chmod shape", () => {
    const file = fixtureFile();
    const result = runPatcher(file);

    expect(result.status, result.stderr).toBe(0);
    const patched = fs.readFileSync(file, "utf8");
    expect(patched).toContain("os.chmod(path, 0o660)");
    expect(patched).not.toContain("os.chmod(path, 0o600)");
  });

  it.each([
    [
      "prepatched source",
      exactUpstreamFixture.replace("os.chmod(path, 0o600)", "os.chmod(path, 0o660)"),
      "prepatched 0660 chmods: 1",
    ],
    [
      "renamed parent",
      exactUpstreamFixture.replace(
        'directory = self._hermes_home / "gateway"',
        'directory = self._hermes_home / "discord"',
      ),
      "expected one gateway directory assignment, found 0",
    ],
    [
      "renamed database",
      exactUpstreamFixture.replace(
        '_DB_FILENAME = "discord_message_recovery.db"',
        '_DB_FILENAME = "recovery.db"',
      ),
      "expected one recovery database filename, found 0",
    ],
  ])("fails closed for %s", (_name, source, message) => {
    const file = fixtureFile(source);
    const result = runPatcher(file);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(fs.readFileSync(file, "utf8")).toBe(source);
  });

  it("hash-binds and executes the patcher in the final image", () => {
    const digest = createHash("sha256").update(fs.readFileSync(patcher)).digest("hex");

    expect(dockerfile).toContain(`ARG NEMOCLAW_HERMES_DISCORD_RECOVERY_PATCHER_SHA256=${digest}`);
    expect(dockerfile).toContain(
      "COPY agents/hermes/patch-discord-recovery-permissions.py " +
        "/usr/local/lib/nemoclaw/patch-hermes-discord-recovery-permissions.py",
    );
    expect(dockerfile).toMatch(
      /patch-hermes-discord-recovery-permissions[.]py \\\n\s+\/opt\/hermes\/plugins\/platforms\/discord\/recovery[.]py/,
    );
    expect(imageBuildProbes).toContain('source.count("os.chmod(path, 0o660)") == 1');
  });

  it("prepares both setgid cross-UID parents in both image layouts", () => {
    for (const source of [baseDockerfile, dockerfile]) {
      expect(source).toContain("/sandbox/.hermes/cron");
      expect(source).toContain("/sandbox/.hermes/gateway");
      expect(source).toMatch(
        /chown gateway:sandbox \\\n\s+\/sandbox\/[.]hermes\/cron \\\n\s+\/sandbox\/[.]hermes\/gateway \\\n\s+\/sandbox\/[.]hermes\/runtime/,
      );
      expect(source).toMatch(
        /chmod 2770 \\\n(?:[\s\S]*?)\/sandbox\/[.]hermes\/cron \\\n\s+\/sandbox\/[.]hermes\/gateway \\\n\s+\/sandbox\/[.]hermes\/runtime/,
      );
    }
  });

  it("requires a Dockerfile cross-identity probe for the cron ledger lifecycle", () => {
    expect(dockerfile).toContain(
      `stat -c '%U:%G %a' /sandbox/.hermes/runtime)" = "gateway:sandbox 2770"`,
    );
    expect(dockerfile).toContain("test ! -e /sandbox/.hermes/cron/executions.db");
    expect(imageBuildProbes).toContain("from cron.executions import create_execution");
    expect(imageBuildProbes).toContain("nemoclaw-cross-uid-create-probe");
    expect(imageBuildProbes).toContain("nemoclaw-cross-uid-reopen-probe");
    expect(dockerfile).toContain(`runtime/cron-executions.db)" = "gateway:sandbox 640"`);
    expect(dockerfile).toContain(`runtime/cron-executions.db)" = "sandbox:sandbox 660"`);
    expect(imageBuildProbes).toContain('for suffix in ("-wal", "-shm"):');
  });

  it("keeps cron/ group-accessible through the cross-identity build probes (#45)", () => {
    // Hermes' _secure_dir() chmods cron/ to 0700 unless it detects a container. A
    // build step and an OpenShell podman sandbox match none of its markers, so the
    // gateway-run probe baked 0700 and the same-UID runtime (Hermes as sandbox)
    // could not enter cron/.
    const lines = dockerfile.split("\n");
    const probeLaunches = lines.filter(
      (line, index) =>
        /\/usr\/bin\/setpriv --reuid=(?:gateway|sandbox) /u.test(line) &&
        /image-build-probes\.py (?:cron|discord)-/u.test(lines[index + 1] ?? ""),
    );
    expect(probeLaunches).toHaveLength(6);
    for (const launch of probeLaunches) {
      expect(launch).toContain(
        "    && HERMES_CONTAINER=1 HERMES_HOME=/sandbox/.hermes /usr/bin/setpriv --reuid=",
      );
    }

    const cronMode = `test "$(stat -c '%U:%G %a' /sandbox/.hermes/cron)" = "gateway:sandbox 2770"`;
    const cronCreate = dockerfile.indexOf("image-build-probes.py cron-create");
    const cronReopen = dockerfile.indexOf("image-build-probes.py cron-reopen");
    const discordCreate = dockerfile.indexOf("image-build-probes.py discord-create");
    const discordReopen = dockerfile.indexOf("image-build-probes.py discord-reopen");
    // Same RUN as cron-create, before the probe runs.
    expect(dockerfile.lastIndexOf(cronMode, cronCreate)).toBeGreaterThan(
      dockerfile.lastIndexOf("RUN ", cronCreate),
    );
    const afterCron = dockerfile.indexOf(cronMode, cronReopen);
    expect(afterCron).toBeGreaterThan(cronReopen);
    expect(afterCron).toBeLessThan(discordCreate);
    expect(dockerfile.indexOf(cronMode, discordReopen)).toBeGreaterThan(discordReopen);

    // The Darwin VM compatibility layer widens /sandbox/.hermes on purpose.
    const finalGate = dockerfile.slice(dockerfile.indexOf("RUN check_metadata()"));
    expect(finalGate).toContain(
      `    && { [ "$NEMOCLAW_DARWIN_VM_COMPAT" = "1" ] \\\n` +
        `        || check_metadata /sandbox/.hermes/cron 'gateway:sandbox 2770'; } \\\n`,
    );
  });

  it("build-probes Discord gateway creation, sandbox backup and replacement, then reopen", () => {
    expect(dockerfile).toContain(
      `stat -c '%U:%G %a' /sandbox/.hermes/gateway)" = "gateway:sandbox 2770"`,
    );
    expect(dockerfile).toContain(
      "/usr/bin/setpriv --reuid=gateway --regid=gateway --init-groups -- /opt/hermes/.venv/bin/python -I \\\n" +
        "        /opt/nemoclaw-hermes-config/image-build-probes.py discord-create",
    );
    expect(dockerfile).toContain(
      "/usr/bin/setpriv --reuid=sandbox --regid=sandbox --init-groups -- /opt/hermes/.venv/bin/python -I \\\n" +
        "        /opt/nemoclaw-hermes-config/image-build-probes.py discord-backup",
    );
    const discordBackup = imageBuildProbes.slice(
      imageBuildProbes.indexOf("def verify_discord_backup("),
      imageBuildProbes.indexOf("def verify_discord_reopen("),
    );
    expect(discordBackup).toContain(".nemoclaw-discord-recovery-staged");
    expect(discordBackup).toContain("source.backup(target)");
    expect(discordBackup).toContain("os.replace(staged, path)");
    expect(imageBuildProbes).toContain("gateway-reopened");
    expect(dockerfile).toContain(`discord_message_recovery.db)" = "sandbox:sandbox 660"`);
  });

  it("requires descriptor-relative, no-follow repair for both writable parents", () => {
    expect(startScript).toContain("ensure_hermes_cross_uid_state_dir() {");
    expect(startScript).toContain('name = os.environ["NEMOCLAW_HERMES_STATE_DIR_NAME"]');
    expect(startScript).toContain("os.O_DIRECTORY | os.O_NOFOLLOW");
    expect(startScript).toContain("os.open(name, open_flags, dir_fd=root_fd)");
    expect(startScript).toContain("os.mkdir(name, desired_mode, dir_fd=root_fd)");
    expect(startScript).toContain("os.fchown(gateway_fd, gateway_uid, sandbox_gid)");
    expect(startScript).toContain("os.fchmod(gateway_fd, desired_mode)");
    const repairStart = startScript.indexOf("repair_hermes_startup_layout() {");
    const lockedBranch = startScript.indexOf("if hermes_config_root_is_locked; then", repairStart);
    const gatewayRepair = startScript.indexOf(
      "if ! ensure_hermes_cross_uid_state_dir gateway; then",
      repairStart,
    );
    const runtimeRepair = startScript.indexOf(
      "if ! ensure_hermes_cross_uid_state_dir runtime; then",
      repairStart,
    );
    expect(repairStart).toBeGreaterThanOrEqual(0);
    expect(lockedBranch).toBeGreaterThan(repairStart);
    expect(gatewayRepair).toBeGreaterThan(repairStart);
    expect(gatewayRepair).toBeLessThan(
      startScript.indexOf("if hermes_config_root_is_locked; then", repairStart),
    );
    expect(runtimeRepair).toBeGreaterThan(gatewayRepair);
    expect(runtimeRepair).toBeLessThan(lockedBranch);
    expect(startScript).not.toContain("ensure_hermes_cross_uid_state_dir cron");
  });

  it.each([
    ["gateway", "symlink", "is a symlink"],
    ["gateway", "file", "is not a directory"],
    ["runtime", "symlink", "is a symlink"],
    ["runtime", "file", "is not a directory"],
  ] as const)("refuses an unsafe %s %s parent", (name, kind, message) => {
    const result = runCrossUidParentRepair(name, kind);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing Hermes cross-UID state repair");
    expect(result.stderr).toContain(`/${name} ${message}`);
  });
});
