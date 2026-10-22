// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { linkSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { sanitizeOpenClawSqliteMachineAuthority } from "./openclaw-sqlite-sanitizer";

const testDirectories: string[] = [];

function createDatabase(): string {
  const dir = mkdtempSync(join(tmpdir(), "nemoclaw-openclaw-sqlite-sanitize-"));
  testDirectories.push(dir);
  const databasePath = join(dir, "openclaw.sqlite");
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE device_identities (
      identity_key TEXT NOT NULL PRIMARY KEY,
      device_id TEXT NOT NULL
    ) STRICT;
    CREATE TABLE device_auth_tokens (
      token TEXT NOT NULL PRIMARY KEY,
      device_id TEXT NOT NULL
    ) STRICT;
    CREATE TABLE device_pairing_paired (
      device_id TEXT NOT NULL PRIMARY KEY,
      tokens_json TEXT
    ) STRICT;
    CREATE TABLE channel_ingress_events (
      event_id TEXT NOT NULL PRIMARY KEY,
      claim_token TEXT,
      claim_owner TEXT,
      claimed_at INTEGER
    ) STRICT;
    CREATE TABLE mcp_oauth_stores (
      store_key TEXT NOT NULL PRIMARY KEY,
      store_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE session_state_heads (
      session_key TEXT NOT NULL PRIMARY KEY,
      head_json TEXT NOT NULL
    ) STRICT;
    CREATE TABLE cron_jobs (
      job_id TEXT NOT NULL PRIMARY KEY,
      spec_json TEXT NOT NULL
    ) STRICT;
    INSERT INTO device_identities VALUES ('local', 'device-1');
    INSERT INTO device_auth_tokens VALUES ('token-1', 'device-1');
    INSERT INTO device_pairing_paired VALUES ('device-2', '{"token":"t"}');
    INSERT INTO channel_ingress_events
      VALUES ('evt-1', 'claim-1', 'owner-1', 100);
    INSERT INTO mcp_oauth_stores VALUES ('store-1', '{"refresh":"r"}');
    INSERT INTO session_state_heads VALUES ('sess-1', '{"turn":3}');
    INSERT INTO cron_jobs VALUES ('job-1', '{"cron":"* * * * *"}');
  `);
  database.close();
  return databasePath;
}

function queryAll(databasePath: string, sql: string): Record<string, unknown>[] {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return database.prepare(sql).all() as Record<string, unknown>[];
  } finally {
    database.close();
  }
}

afterEach(() => {
  for (const testDirectory of testDirectories.splice(0)) {
    rmSync(testDirectory, { recursive: true, force: true });
  }
});

describe("sanitizeOpenClawSqliteMachineAuthority", () => {
  it("clears machine-bound authority tables and preserves portable state", () => {
    const databasePath = createDatabase();

    expect(sanitizeOpenClawSqliteMachineAuthority(databasePath)).toBeNull();

    expect(queryAll(databasePath, "SELECT * FROM device_identities")).toEqual([]);
    expect(queryAll(databasePath, "SELECT * FROM device_auth_tokens")).toEqual([]);
    expect(queryAll(databasePath, "SELECT * FROM mcp_oauth_stores")).toEqual([]);
    expect(queryAll(databasePath, "SELECT * FROM session_state_heads")).toEqual([
      { session_key: "sess-1", head_json: '{"turn":3}' },
    ]);
    expect(queryAll(databasePath, "SELECT * FROM cron_jobs")).toEqual([
      { job_id: "job-1", spec_json: '{"cron":"* * * * *"}' },
    ]);
  });

  it("nulls pairing tokens and ingress claims without dropping their rows", () => {
    const databasePath = createDatabase();

    expect(sanitizeOpenClawSqliteMachineAuthority(databasePath)).toBeNull();

    expect(
      queryAll(databasePath, "SELECT device_id, tokens_json FROM device_pairing_paired"),
    ).toEqual([{ device_id: "device-2", tokens_json: null }]);
    expect(
      queryAll(
        databasePath,
        "SELECT event_id, claim_token, claim_owner, claimed_at FROM channel_ingress_events",
      ),
    ).toEqual([{ event_id: "evt-1", claim_token: null, claim_owner: null, claimed_at: null }]);
  });

  it("leaves the artifact a standalone consistent database", () => {
    const databasePath = createDatabase();

    expect(sanitizeOpenClawSqliteMachineAuthority(databasePath)).toBeNull();

    const check = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(check.prepare("PRAGMA quick_check").get()).toEqual({ quick_check: "ok" });
      expect(check.prepare("PRAGMA journal_mode").get()).not.toEqual({ journal_mode: "wal" });
    } finally {
      check.close();
    }
  });

  it("tolerates a database without any authority tables", () => {
    const dir = mkdtempSync(join(tmpdir(), "nemoclaw-openclaw-sqlite-sanitize-"));
    testDirectories.push(dir);
    const databasePath = join(dir, "openclaw.sqlite");
    const database = new DatabaseSync(databasePath);
    database.exec("CREATE TABLE sessions (id TEXT PRIMARY KEY) STRICT;");
    database.exec("INSERT INTO sessions VALUES ('a')");
    database.close();

    expect(sanitizeOpenClawSqliteMachineAuthority(databasePath)).toBeNull();
    expect(queryAll(databasePath, "SELECT * FROM sessions")).toEqual([{ id: "a" }]);
  });

  it("rejects non-SQLite content", () => {
    const dir = mkdtempSync(join(tmpdir(), "nemoclaw-openclaw-sqlite-sanitize-"));
    testDirectories.push(dir);
    const filePath = join(dir, "openclaw.sqlite");
    writeFileSync(filePath, "not a database");

    expect(sanitizeOpenClawSqliteMachineAuthority(filePath)).toBe(
      "the OpenClaw state database is not a SQLite database",
    );
  });

  it("rejects a symlinked database", () => {
    const databasePath = createDatabase();
    const dir = mkdtempSync(join(tmpdir(), "nemoclaw-openclaw-sqlite-sanitize-"));
    testDirectories.push(dir);
    const linkPath = join(dir, "linked.sqlite");
    symlinkSync(databasePath, linkPath);

    expect(sanitizeOpenClawSqliteMachineAuthority(linkPath)).toBe(
      "the OpenClaw state database is not a plain file",
    );
  });

  it("rejects a hard-linked database", () => {
    const databasePath = createDatabase();
    const linkPath = `${databasePath}.linked`;
    linkSync(databasePath, linkPath);

    expect(sanitizeOpenClawSqliteMachineAuthority(databasePath)).toBe(
      "the OpenClaw state database is not a plain file",
    );
    rmSync(linkPath, { force: true });
  });
});
