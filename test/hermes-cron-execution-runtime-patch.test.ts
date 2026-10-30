// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const root = path.join(import.meta.dirname, "..");
const patcher = path.join(root, "agents", "hermes", "patch-cron-execution-runtime.py");
const dockerfile = fs.readFileSync(path.join(root, "agents", "hermes", "Dockerfile"), "utf8");
const imageBuildProbes = fs.readFileSync(
  path.join(root, "agents", "hermes", "image-build-probes.py"),
  "utf8",
);
const fixtures: string[] = [];

// Hermes v2026.9.14 / 0.21.3 resolves the ledger lazily inside _connect;
// EXECUTIONS_FILE is an optional test override, not the production path.
const upstreamExecutions = `\
from typing import Optional
from pathlib import Path
from hermes_constants import get_hermes_home

EXECUTIONS_FILE: Optional[Path] = None


def _connect():
    path = EXECUTIONS_FILE or (get_hermes_home().resolve() / "cron" / "executions.db")
    path.parent.mkdir(parents=True, exist_ok=True)
`;

// v2026.9.14 shares the executions database with cron/incidents.py; its
// fallback branch resolves the same upstream path.
const upstreamIncidents = `\
from hermes_constants import get_hermes_home


def _db_path():
    return get_hermes_home().resolve() / "cron" / "executions.db"
`;

const upstreamBackup = `\
_QUICK_STATE_FILES = (
    "state.db",
    "cron/jobs.json",
    "cron/executions.db",
)
`;

function fixtureFiles(options: { executions?: string; incidents?: string; backup?: string } = {}) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-hermes-cron-runtime-"));
  fixtures.push(fixture);
  const executions = path.join(fixture, "executions.py");
  const incidents = path.join(fixture, "incidents.py");
  const backup = path.join(fixture, "backup.py");
  fs.writeFileSync(executions, options.executions ?? upstreamExecutions);
  fs.writeFileSync(incidents, options.incidents ?? upstreamIncidents);
  fs.writeFileSync(backup, options.backup ?? upstreamBackup);
  return { executions, incidents, backup };
}

function runPatcher(executions: string, incidents: string, backup: string) {
  return spawnSync(
    "python3",
    ["-I", patcher, "--executions", executions, "--incidents", incidents, "--backup", backup],
    { encoding: "utf8", timeout: 5000 },
  );
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

describe("Hermes cron execution runtime patch", () => {
  it("relocates the ledger and quick snapshot entry together and remains idempotent", () => {
    const files = fixtureFiles();

    const first = runPatcher(files.executions, files.incidents, files.backup);
    expect(first.status, first.stderr).toBe(0);
    expect(fs.readFileSync(files.executions, "utf8")).toContain(
      'get_hermes_home().resolve() / "runtime" / "cron-executions.db"',
    );
    expect(fs.readFileSync(files.incidents, "utf8")).toContain(
      'get_hermes_home().resolve() / "runtime" / "cron-executions.db"',
    );
    expect(fs.readFileSync(files.backup, "utf8")).toContain('"runtime/cron-executions.db"');
    expect(fs.readFileSync(files.executions, "utf8")).not.toContain('/ "cron" / "executions.db"');
    expect(fs.readFileSync(files.incidents, "utf8")).not.toContain('/ "cron" / "executions.db"');
    expect(fs.readFileSync(files.backup, "utf8")).not.toContain('"cron/executions.db"');

    const second = runPatcher(files.executions, files.incidents, files.backup);
    expect(second.status, second.stderr).toBe(0);
  });

  it("fails closed before any file changes when a pinned source shape drifts", () => {
    const driftedBackup = upstreamBackup.replace(
      '"cron/executions.db"',
      '"cron/execution-history.db"',
    );
    const files = fixtureFiles({ backup: driftedBackup });

    const result = runPatcher(files.executions, files.incidents, files.backup);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cron execution runtime source shape changed");
    expect(fs.readFileSync(files.executions, "utf8")).toBe(upstreamExecutions);
    expect(fs.readFileSync(files.incidents, "utf8")).toBe(upstreamIncidents);
    expect(fs.readFileSync(files.backup, "utf8")).toBe(driftedBackup);
  });

  it("rejects a partially applied pair instead of splitting the runtime contract", () => {
    const files = fixtureFiles({
      executions: upstreamExecutions.replace(
        '/ "cron" / "executions.db"',
        '/ "runtime" / "cron-executions.db"',
      ),
    });

    const result = runPatcher(files.executions, files.incidents, files.backup);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("only partially applied");
    expect(fs.readFileSync(files.backup, "utf8")).toBe(upstreamBackup);
    expect(fs.readFileSync(files.incidents, "utf8")).toBe(upstreamIncidents);
  });

  it("hash-binds all upstream modules and requires installed-path build probes", () => {
    const digest = createHash("sha256").update(fs.readFileSync(patcher)).digest("hex");

    expect(dockerfile).toContain(`ARG NEMOCLAW_HERMES_CRON_RUNTIME_PATCHER_SHA256=${digest}`);
    expect(dockerfile).toContain(
      "ARG NEMOCLAW_HERMES_CRON_EXECUTIONS_SOURCE_SHA256=" +
        "1c7af4651cece5cdd8995464ba5d18c88a3b9c23cfceed757626b73c01e06535",
    );
    expect(dockerfile).toContain(
      "ARG NEMOCLAW_HERMES_CRON_INCIDENTS_SOURCE_SHA256=" +
        "5f614becfe4dac5a468988bc643724caf89c6a9bb978b2dd6c5590049b24a0d1",
    );
    expect(dockerfile).toContain(
      "ARG NEMOCLAW_HERMES_BACKUP_SOURCE_SHA256=" +
        "1a48cbde16552268d796bcf22fdaa8231c924c76a4af24f9f391bf12ca1b37c0",
    );
    expect(dockerfile).toContain(
      "COPY agents/hermes/patch-cron-execution-runtime.py " +
        "/opt/nemoclaw-hermes-config/patch-cron-execution-runtime.py",
    );
    expect(dockerfile).toMatch(
      /patch-cron-execution-runtime[.]py \\\n\s+--executions \/opt\/hermes\/cron\/executions[.]py \\\n\s+--incidents \/opt\/hermes\/cron\/incidents[.]py \\\n\s+--backup \/opt\/hermes\/hermes_cli\/backup[.]py/u,
    );
    expect(imageBuildProbes).toContain(
      'expected = get_hermes_home().resolve() / "runtime" / "cron-executions.db"',
    );
    expect(imageBuildProbes).toContain("cron.incidents._db_path() == expected");
    expect(imageBuildProbes).toContain('assert "cron/executions.db" not in _QUICK_STATE_FILES');
  });
});
