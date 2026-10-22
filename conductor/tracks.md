# Project Tracks

---

## [~] Track: Hermes Managed Local File Uploader

*Link: [./tracks/hermes_stdio_uploader_20260909/](./tracks/hermes_stdio_uploader_20260909/)*

Fork-specific managed Hermes image support for the fixed `sandbox-file-uploader`
local stdio MCP server, with upgrade compatibility evidence.

Accepted on 2026-09-11 on the `feat/hermes-local-uploader-0911` lineage in
ClawShell; that verified delta is not merged into `feat/image-only-cli`, so
completion on this branch remains pending. See the track
[verification record](./tracks/hermes_stdio_uploader_20260909/upgrade-verification.md)
for the test results, sandbox evidence, and source commits.

---

## [~] Track: Hermes API Profile Guard

*Link: [./tracks/hermes_api_profile_guard_20260924/](./tracks/hermes_api_profile_guard_20260924/)*

Fork-specific guard support for the ClawShell-managed Hermes `api` profile.
The image must protect the profile's config and credential before ClawShell
applies inference.local through a profile-scoped transaction.

---

## [x] Track: OpenClaw Exec Approvals SQLite State

*Link: [./tracks/exec_approvals_sqlite_20261019/](./tracks/exec_approvals_sqlite_20261019/)*

Repair fork issue #3 by stopping legacy exec approvals empty-file creation for
OpenClaw 2026.9.2. Preserve existing policy and SQLite state, and verify fresh
sandbox startup.

Implementation and live acceptance completed; signed source commit `7fa6bb8b5`.
Existing unrelated fixture and hook failures remain tracked in fork issue #4.
