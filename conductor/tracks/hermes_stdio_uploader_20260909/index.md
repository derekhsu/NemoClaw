# Track: Hermes Managed Local File Uploader

**ID:** `hermes_stdio_uploader_20260909`
**Status:** In Progress — uploader source integration in PR #7; live
acceptance of the integrated image remains pending

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

See [upgrade verification](upgrade-verification.md#2026-09-11-verified-acceptance-on-the-uploader-0911-lineage)
for the recorded image digest, sandbox, test counts, and evidence locations.
The historical acceptance is bound to the `feat/hermes-local-uploader-0911`
lineage. Commit `7a38c12be` ports the verified image delta; `ff43f3d1c` adds
the subsequent scoped sandbox-id fix. PR #7 integrates the remaining changes
by squash and preserves the current stricter transaction validation, uploader
inspection, API-profile protections, and image workflow. The source commits
remain references rather than Git ancestors of this branch. See the
[integration record](upgrade-verification.md#2026-10-22-source-integration-in-pr-7)
for the retained contracts and remaining acceptance gates.
