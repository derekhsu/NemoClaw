# Track: Hermes Managed Local File Uploader

**ID:** `hermes_stdio_uploader_20260909`
**Status:** Complete — verified and checkpointed on 2026-09-11

## Documents

- [Specification](spec.md)
- [Implementation plan](plan.md)

## Scope

This track owns the fork-specific Hermes image and helper work. ClawShell
adapter changes are an external dependency and will be tracked in its own
repository.

## Completion evidence

The ClawShell track `hermes_local_uploader_20260909` completed the shared
image and uploader acceptance on 2026-09-11. Its Phase 4 checkpoint
`bd589343` records passing tests and a real LLM upload and download flow.
ClawShell commit `a2158c79` marked the track complete; `303452ad` archived it.

See [upgrade verification](upgrade-verification.md#2026-09-11-completed-verification)
for the recorded image digest, sandbox, test counts, and evidence locations.
This status records historical acceptance. The two commits on
`feat/hermes-local-uploader-0911` remain unmerged into `feat/image-only-cli`.
