// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0
//
// OpenClaw 2026.9.2 keeps portable state (sessions, cron, delivery queues,
// skill library) in state/openclaw.sqlite alongside machine-local authority
// (device identities, pairing tokens). The manifest captures the database
// with sqlite_backup and the backup pipeline scrubs machine authority so a
// restored clone re-pairs locally instead of inheriting the source identity.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// See snapshot.test.ts — HOME must move before importing sandbox-state.
const ORIGINAL_HOME = process.env.HOME;
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-openclaw-sqlite-"));
process.env.HOME = TMP_HOME;
const REPO_ROOT = path.join(import.meta.dirname, "..");
const sandboxState = (await import(
  pathToFileURL(path.join(REPO_ROOT, "src", "lib", "state", "sandbox.ts")).href
)) as typeof import("../src/lib/state/sandbox.js");

const OPENCLAW_DIR_NAME = ".openclaw";
const SQLITE_STATE_PATH = path.join("state", "openclaw.sqlite");

function restoreEnv(name: string, value: string | undefined): void {
  value === undefined
    ? Reflect.deleteProperty(process.env, name)
    : Reflect.set(process.env, name, value);
}

function writeExecutable(filePath: string, source: string): void {
  fs.writeFileSync(filePath, source, { mode: 0o755 });
}

function writeFakeOpenshell(binDir: string): string {
  const openshell = path.join(binDir, "openshell");
  writeExecutable(
    openshell,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === "sandbox" && args[1] === "ssh-config") {
  const name = args[args.length - 1];
  process.stdout.write("Host openshell-" + name + "\\n  HostName 127.0.0.1\\n  User sandbox\\n");
  process.exit(0);
}
process.exit(0);
`,
  );
  return openshell;
}

function writeOpenClawRegistry(sandboxName: string): void {
  fs.mkdirSync(path.join(TMP_HOME, ".nemoclaw"), { recursive: true });
  fs.writeFileSync(
    path.join(TMP_HOME, ".nemoclaw", "sandboxes.json"),
    JSON.stringify({
      defaultSandbox: sandboxName,
      sandboxes: {
        [sandboxName]: {
          name: sandboxName,
          model: "m",
          provider: "p",
          gpuEnabled: false,
          policies: [],
          agent: null,
        },
      },
    }),
  );
}

function createRemoteOpenClawStateDatabase(openclawDir: string): void {
  const databasePath = path.join(openclawDir, SQLITE_STATE_PATH);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import sqlite3, sys
db = sys.argv[1]
conn = sqlite3.connect(db)
conn.execute('PRAGMA journal_mode = WAL')
conn.executescript("""
CREATE TABLE device_identities (identity_key TEXT PRIMARY KEY, device_id TEXT NOT NULL);
CREATE TABLE device_auth_tokens (token TEXT PRIMARY KEY, device_id TEXT NOT NULL);
CREATE TABLE device_pairing_pending (request_id TEXT PRIMARY KEY, device_id TEXT NOT NULL);
CREATE TABLE device_pairing_paired (device_id TEXT PRIMARY KEY, tokens_json TEXT);
CREATE TABLE channel_ingress_events (
  event_id TEXT PRIMARY KEY, claim_token TEXT, claim_owner TEXT, claimed_at INTEGER
);
CREATE TABLE secret_store_entries (entry_key TEXT PRIMARY KEY, secret_json TEXT NOT NULL);
CREATE TABLE session_state_heads (session_key TEXT PRIMARY KEY, head_json TEXT NOT NULL);
CREATE TABLE cron_jobs (job_id TEXT PRIMARY KEY, spec_json TEXT NOT NULL);
INSERT INTO device_identities VALUES ('local', 'device-source');
INSERT INTO device_auth_tokens VALUES ('tok-source', 'device-source');
INSERT INTO device_pairing_pending VALUES ('req-1', 'device-foreign');
INSERT INTO device_pairing_paired VALUES ('device-peer', '{"token":"peer-tok"}');
INSERT INTO channel_ingress_events VALUES ('evt-1', 'claim-tok', 'owner-1', 7);
INSERT INTO secret_store_entries VALUES ('api', '{"key":"sk-secret"}');
INSERT INTO session_state_heads VALUES ('sess-1', '{"turn":5}');
INSERT INTO cron_jobs VALUES ('job-1', '{"cron":"0 * * * *"}');
""")
conn.commit()
conn.close()
`,
      databasePath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`failed to create fixture database: ${result.stderr}`);
  }
}

function queryJson(databasePath: string, sql: string): unknown {
  const result = spawnSync(
    "python3",
    [
      "-c",
      `
import json, sqlite3, sys
conn = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)
try:
    rows = conn.execute(sys.argv[2]).fetchall()
    print(json.dumps(rows))
finally:
    conn.close()
`,
      databasePath,
      sql,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`sqlite query failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function openclawSqliteSshSource(openclawDir: string): string {
  return `#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const cmd = process.argv[process.argv.length - 1] || "";
if (cmd.includes("[ -d ")) process.exit(0);
if (cmd.includes("nemoclaw-sqlite-backup") && cmd.includes("state/openclaw.sqlite")) {
  const mapped = cmd.split("/sandbox/${OPENCLAW_DIR_NAME}").join(${JSON.stringify(openclawDir)});
  const result = spawnSync("/bin/sh", ["-c", mapped], { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  if (result.stdout) fs.writeSync(1, result.stdout);
  if (result.stderr) fs.writeSync(2, result.stderr);
  process.exit(result.status === null ? 1 : result.status);
}
if (cmd.includes("cat --")) process.exit(2);
if (cmd.includes("tar -cf -")) process.exit(0);
process.exit(0);
`;
}

afterAll(() => {
  process.env.HOME = ORIGINAL_HOME;
  fs.rmSync(TMP_HOME, { recursive: true, force: true });
});

describe("OpenClaw SQLite state capture", () => {
  it("backs up a consistent database with machine-bound authority stripped", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-openclaw-sqlite-backup-"));
    const oldPath = process.env.PATH;
    const oldOpenshell = process.env.NEMOCLAW_OPENSHELL_BIN;
    try {
      const binDir = path.join(fixture, "bin");
      const openclawDir = path.join(fixture, "sandbox-root", OPENCLAW_DIR_NAME);
      fs.mkdirSync(binDir, { recursive: true });
      createRemoteOpenClawStateDatabase(openclawDir);

      const openshell = writeFakeOpenshell(binDir);
      writeExecutable(path.join(binDir, "ssh"), openclawSqliteSshSource(openclawDir));
      writeOpenClawRegistry("alpha");
      process.env.NEMOCLAW_OPENSHELL_BIN = openshell;
      process.env.PATH = `${binDir}${path.delimiter}${oldPath || ""}`;

      const backup = sandboxState.backupSandboxState("alpha");

      expect(backup.success).toBe(true);
      expect(backup.failedFiles).toEqual([]);
      expect(backup.backedUpFiles).toContain(SQLITE_STATE_PATH.split(path.sep).join("/"));

      const backupPath = String(backup.manifest?.backupPath);
      const capturedDb = path.join(backupPath, SQLITE_STATE_PATH);

      // Machine-bound authority does not survive the capture boundary.
      expect(queryJson(capturedDb, "SELECT * FROM device_identities")).toEqual([]);
      expect(queryJson(capturedDb, "SELECT * FROM device_auth_tokens")).toEqual([]);
      expect(queryJson(capturedDb, "SELECT * FROM device_pairing_pending")).toEqual([]);
      expect(queryJson(capturedDb, "SELECT * FROM secret_store_entries")).toEqual([]);
      expect(
        queryJson(capturedDb, "SELECT device_id, tokens_json FROM device_pairing_paired"),
      ).toEqual([["device-peer", null]]);
      expect(
        queryJson(
          capturedDb,
          "SELECT event_id, claim_token, claim_owner, claimed_at FROM channel_ingress_events",
        ),
      ).toEqual([["evt-1", null, null, null]]);

      // Portable state survives intact.
      expect(queryJson(capturedDb, "SELECT * FROM session_state_heads")).toEqual([
        ["sess-1", '{"turn":5}'],
      ]);
      expect(queryJson(capturedDb, "SELECT * FROM cron_jobs")).toEqual([
        ["job-1", '{"cron":"0 * * * *"}'],
      ]);

      // WAL sidecars never enter the backup — the captured file stands alone.
      expect(fs.readdirSync(path.dirname(capturedDb))).toEqual(["openclaw.sqlite"]);
    } finally {
      restoreEnv("NEMOCLAW_OPENSHELL_BIN", oldOpenshell);
      process.env.PATH = oldPath;
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("fails closed when the live database is a symlink", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-openclaw-sqlite-link-"));
    const oldPath = process.env.PATH;
    const oldOpenshell = process.env.NEMOCLAW_OPENSHELL_BIN;
    try {
      const binDir = path.join(fixture, "bin");
      const openclawDir = path.join(fixture, "sandbox-root", OPENCLAW_DIR_NAME);
      fs.mkdirSync(binDir, { recursive: true });
      const databasePath = path.join(openclawDir, SQLITE_STATE_PATH);
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
      const linkTarget = path.join(fixture, "elsewhere.sqlite");
      fs.writeFileSync(linkTarget, "placeholder");
      fs.symlinkSync(linkTarget, databasePath);

      const openshell = writeFakeOpenshell(binDir);
      writeExecutable(path.join(binDir, "ssh"), openclawSqliteSshSource(openclawDir));
      writeOpenClawRegistry("beta");
      process.env.NEMOCLAW_OPENSHELL_BIN = openshell;
      process.env.PATH = `${binDir}${path.delimiter}${oldPath || ""}`;

      const backup = sandboxState.backupSandboxState("beta");

      expect(backup.success).toBe(false);
      expect(backup.unreachable).toBeFalsy();
      expect(backup.failedFiles).toContain(SQLITE_STATE_PATH.split(path.sep).join("/"));
      expect(backup.backedUpFiles).not.toContain(SQLITE_STATE_PATH.split(path.sep).join("/"));
      expect(fs.existsSync(path.join(String(backup.manifest?.backupPath), SQLITE_STATE_PATH))).toBe(
        false,
      );
    } finally {
      restoreEnv("NEMOCLAW_OPENSHELL_BIN", oldOpenshell);
      process.env.PATH = oldPath;
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("fails closed when the live database is corrupt", () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-openclaw-sqlite-corrupt-"));
    const oldPath = process.env.PATH;
    const oldOpenshell = process.env.NEMOCLAW_OPENSHELL_BIN;
    try {
      const binDir = path.join(fixture, "bin");
      const openclawDir = path.join(fixture, "sandbox-root", OPENCLAW_DIR_NAME);
      fs.mkdirSync(binDir, { recursive: true });
      const databasePath = path.join(openclawDir, SQLITE_STATE_PATH);
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
      fs.writeFileSync(databasePath, Buffer.alloc(4096, 0x5a));

      const openshell = writeFakeOpenshell(binDir);
      writeExecutable(path.join(binDir, "ssh"), openclawSqliteSshSource(openclawDir));
      writeOpenClawRegistry("gamma");
      process.env.NEMOCLAW_OPENSHELL_BIN = openshell;
      process.env.PATH = `${binDir}${path.delimiter}${oldPath || ""}`;

      const backup = sandboxState.backupSandboxState("gamma");

      expect(backup.success).toBe(false);
      expect(backup.failedFiles).toContain(SQLITE_STATE_PATH.split(path.sep).join("/"));
      expect(backup.backedUpFiles).not.toContain(SQLITE_STATE_PATH.split(path.sep).join("/"));
      expect(fs.existsSync(path.join(String(backup.manifest?.backupPath), SQLITE_STATE_PATH))).toBe(
        false,
      );
    } finally {
      restoreEnv("NEMOCLAW_OPENSHELL_BIN", oldOpenshell);
      process.env.PATH = oldPath;
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
});
