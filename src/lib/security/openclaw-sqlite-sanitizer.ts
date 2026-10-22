// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { closeSync, lstatSync, openSync, readSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0", "latin1");

// Tables owned by the local machine's authority: device identity, pairing
// state, origin tokens, push registrations, OAuth stores, and the secret
// store. A restored clone must re-establish all of these from scratch; the
// remaining tables (sessions, cron, delivery, projects, skill library, …)
// are portable user state that the restore contract preserves.
const MACHINE_AUTHORITY_TABLES_TO_CLEAR = [
  "apns_registration_tombstones",
  "apns_registrations",
  "audit_identity_keys",
  "channel_pairing_requests",
  "config_revision_keys",
  "device_auth_tokens",
  "device_bootstrap_tokens",
  "device_identities",
  "device_pair_setup_completions",
  "device_pairing_join_codes",
  "device_pairing_pending",
  "gateway_origin_device_tokens",
  "mcp_oauth_stores",
  "native_hook_relay_bridges",
  "secret_store_entries",
  "web_push_subscriptions",
] as const;

const MACHINE_AUTHORITY_COLUMN_UPDATES = [
  {
    table: "channel_ingress_events",
    statement:
      "UPDATE channel_ingress_events SET claim_token = NULL, claim_owner = NULL, claimed_at = NULL WHERE claim_token IS NOT NULL",
  },
  {
    table: "device_pairing_paired",
    statement: "UPDATE device_pairing_paired SET tokens_json = NULL WHERE tokens_json IS NOT NULL",
  },
] as const;

function isSqliteFileHeader(filePath: string): boolean {
  const header = Buffer.alloc(SQLITE_MAGIC.byteLength);
  const fd = openSync(filePath, "r");
  try {
    return (
      readSync(fd, header, 0, header.byteLength, 0) === header.byteLength &&
      header.equals(SQLITE_MAGIC)
    );
  } finally {
    closeSync(fd);
  }
}

/**
 * Remove machine-bound device authority from a captured OpenClaw state
 * database in place. Returns null on success or a safe error string.
 * Callers must fail the owning backup rather than publish the file when an
 * error is returned.
 */
export function sanitizeOpenClawSqliteMachineAuthority(filePath: string): string | null {
  const stat = lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
    return "the OpenClaw state database is not a plain file";
  }
  try {
    if (!isSqliteFileHeader(filePath)) {
      return "the OpenClaw state database is not a SQLite database";
    }
  } catch (error) {
    return `could not inspect the OpenClaw state database: ${error instanceof Error ? error.message : String(error)}`;
  }

  let database: DatabaseSync | null = null;
  try {
    database = new DatabaseSync(filePath, { allowExtension: false, timeout: 2_000 });
    // journal_mode=DELETE detaches the artifact from any WAL sidecar and keeps
    // the standalone file consistent; secure_delete zeroes cleared rows so the
    // removed authority does not survive in free pages.
    database.exec(
      "PRAGMA journal_mode = DELETE; PRAGMA foreign_keys = OFF; PRAGMA secure_delete = ON; BEGIN IMMEDIATE;",
    );
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
        .all()
        .map((row) => String(row.name)),
    );
    for (const table of MACHINE_AUTHORITY_TABLES_TO_CLEAR) {
      if (tables.has(table)) database.exec(`DELETE FROM ${table}`);
    }
    for (const { table, statement } of MACHINE_AUTHORITY_COLUMN_UPDATES) {
      if (tables.has(table)) database.exec(statement);
    }
    database.exec("COMMIT;");
    database.close();
    database = null;
    return null;
  } catch (error) {
    try {
      database?.exec("ROLLBACK;");
    } catch {
      // Preserve the primary sanitation failure.
    }
    return `could not sanitize the OpenClaw state database: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    try {
      database?.close();
    } catch {
      // The backup is discarded on failure; a stuck handle is not load-bearing.
    }
  }
}
