# Track: Hermes Managed Local File Uploader

**ID:** `hermes_stdio_uploader_20260909`
**Status:** In Progress — accepted on 2026-09-11 on
`feat/hermes-local-uploader-0911`; the verified delta is not merged into
`feat/image-only-cli`

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
The acceptance is bound to the `feat/hermes-local-uploader-0911` lineage: its
commits `7a38c12be` and `ff43f3d1c` are the port of the verified 2026-09-11
image delta, and they are not merged into `feat/image-only-cli`. This branch
carries a divergent implementation of the same capability, so the track stays
open here until the verified delta merges or this branch's implementation
receives its own live verification.
