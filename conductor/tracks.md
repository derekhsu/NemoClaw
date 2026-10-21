# Project Tracks

---

## [~] Track: Hermes Managed Local File Uploader

*Link: [./conductor/tracks/hermes_stdio_uploader_20260909/](./conductor/tracks/hermes_stdio_uploader_20260909/)*

Fork-specific managed Hermes image support for the fixed `sandbox-file-uploader`
local stdio MCP server, with upgrade compatibility evidence.

---

## [x] Track: OpenClaw Exec Approvals SQLite State

*Link: [./conductor/tracks/exec_approvals_sqlite_20261019/](./conductor/tracks/exec_approvals_sqlite_20261019/)*

Repair fork issue #3 by stopping legacy exec approvals empty-file creation for
OpenClaw 2026.9.2. Preserve existing policy and SQLite state, and verify fresh
sandbox startup.

Implementation and live acceptance completed; signed source commit `7fa6bb8b5`.
Existing unrelated fixture and hook failures remain tracked in fork issue #4.
