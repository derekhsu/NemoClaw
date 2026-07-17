<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# NemoClaw Image-Only CLI Review

Date: 2026-06-29
Status: Review draft
Owner: derekhsu/NemoClaw fork

## Context

This review compares two documents that both tackle the same problem, extracting image building out of NemoClaw's `onboard` / `sandbox rebuild` flow, which today bundles Dockerfile patching, `docker build`, and OpenShell registration into one transactional step.

The two documents do not reference each other. Closing that gap is the central output of this review.

Documents under review:

- [`docs/superpowers/specs/2026-06-29-image-only-cli-design.md`](./2026-06-29-image-only-cli-design.md) — the upstream-style feature spec proposing `nemoclaw image ...` CLI subcommands backed by a three-layer refactor.
- [`docs/modification/2026-06-29-image-build-pipeline.md`](../modification/2026-06-29-image-build-pipeline.md) — the fork-specific design that bypasses the NemoClaw CLI entirely with a standalone shell script at `scripts/build-sandbox-image.sh`.

Both target the same artifact: a generic sandbox runtime image that does not bake provider or model choices. Their divergence is where the build logic lives.

## Per-Doc Strengths and Weaknesses

### Image-Only CLI Design (the spec)

Strengths:

- The proposed three-layer internal shape (`agent image definition`, `image stage service`, `image build service`) is clean and correctly decouples from the `onboard` state machine.
- Explicit in-versus-out behavioral boundaries make the key design decision easy to defend in review.
- Treating the staged build context directory as the stable contract between local and CI is the right call.
- The registry contract is appropriately decoupled from authentication. The CLI only needs the final image tag. Auth is the caller's responsibility, especially in GitHub Actions.
- JSON metadata output is promised but lacks a concrete example (see weaknesses).

Weaknesses:

- The `--json` schema is described field by field but never shown as concrete JSON. Add one example for `image stage` and one for `image build` so reviewers can lock the shape.
- "Minimal Dockerfile patching" leaves the boundary between Dockerfile-level metadata and JSON-only metadata fuzzy. Decide whether the build ID goes into the image layer or only into the metadata file.
- Phase 3 ("migrate existing fork-specific shell scripts to thin wrappers around the new CLI") references scripts that are not enumerated. Spell out which scripts so Phase 3 review can verify coverage.
- The "Internal Refactoring Plan" risks scope creep. Ship Phase 1 + 2 first, then touch `onboard`.
- `--base-image` resolution policy is not stated. When the caller passes only `--tag` and the Dockerfile default is in effect, the spec does not say whether the CLI uses the default, prompts, or looks up via digest fallback chain. Pick one of: accept the Dockerfile default silently, or expose `--base-image <ref>` as an explicit flag.
- The "model/provider not baked into image" test needs a concrete assertion strategy. For example, inspect image env with `docker run --rm <ref> env`, or grep layers with `docker history --no-trunc`.

### Image Build Pipeline (the fork plan)

Strengths:

- The architecture-boundary paragraph in section 2 (image contains agent runtime only, never OpenShell daemon or sandbox lifecycle) is the single most useful paragraph in either document.
- The fork is honest about why it does not install the nemoclaw CLI (section 7). The observation that image build is intentionally non-splittable inside the CLI is correct.
- Cross-references to upstream files with line numbers in section 9 are excellent future-maintainer breadcrumbs.
- Section 10's env var mapping table is a useful reference even though it does not apply to the current fork.
- Section 4's staged build context allowlist correctly mirrors `stageOptimizedSandboxBuildContext` from `src/lib/sandbox/build-context.ts:71` with explicit exclusions.

Weaknesses:

- Reproducibility is broken by design. `NEMOCLAW_BUILD_ID=$(date +%s)` and the random `mktemp -d -t nemoclaw-build-XXXXXX` path together defeat layer-cache reuse across machines and produce non-deterministic image IDs.
- No `.dockerignore` is generated in the staged directory. The shell `cp -R` allowlist is the only protection against context bloat. If a future contributor runs `npm install` in `nemoclaw/`, the next build silently includes `node_modules`.
- `cp -R` symlink behaviour is BSD/GNU variant dependent. Worth a comment or an explicit flag.
- Errors do not name the failing file. Twenty-odd `cp` calls under `set -euo pipefail` make debugging painful. Add `cp ... || { echo "failed: src -> dst" >&2; exit 1; }` to surface the offender.
- No JSON metadata is emitted. OpenShell today may only need the tag, but any other consumer (or the upstream spec's eventual CLI) will want `digest` and `source_commit`. Emit `{"agent","tag","digest","source_commit","content_hash"}` once instead of refactoring later.
- Section 8 acknowledges reproducibility but does not act on it. Even a simple `--build-arg BASE_IMAGE=$pinned_digest` flag would help.

## Cross-Doc Conflicts

### Conflict 1. Where the logic lives

The spec proposes extending the NemoClaw CLI with `image ...` subcommands and a three-layer refactor.
The fork plan keeps the logic in a standalone shell script that bypasses the CLI entirely.

The spec's Phase 3 ("migrate fork-specific shell scripts to thin wrappers around the new CLI") implicitly admits the relationship, but neither document names it.

Resolution:

- The fork doc should add a "Relationship to upstream `nemoclaw image ...`" section pointing at the spec, and commit the staged build context directory plus emitted metadata as the long-term contract. This makes the shell script a thin wrapper when the CLI ships.
- The spec should add a "Known fork consumers" section pointing at the fork doc, and ensure the CLI's `--json` shape and stage-build directory contract are stable enough that fork scripts can adopt them without churn.

### Conflict 2. Metadata contract

The spec defines two JSON shapes (one for `image stage`, one for `image build`). The fork script emits only the tag string.

Recommendation: the spec's shape is authoritative. Both paths emit it. OpenShell will eventually want `digest` and `source_commit` anyway.

### Conflict 3. Build-context source of truth

The spec mandates TypeScript staging as the single source of truth and forbids a parallel shell-only implementation that drifts.
The fork maintains its own shell `cp` list, modeled after `stageOptimizedSandboxBuildContext`. The fork copy list will drift as the upstream allowlist evolves.

Resolution: the spec's CLI must be callable as a standalone binary path (without `npm install && npm link` of the whole monorepo) so forks can adopt it directly. Note this as an explicit Phase 1 deliverable, otherwise Phase 3 will beget another shell-script drift.

### Conflict 4. Hermes and multi-agent scope

The spec supports both `openclaw` and `hermes` agents.
The fork carries only OpenClaw sources. Section 11 of the fork doc flags whether to bring Hermes and LangChain sources along as an open question.

That is fine in practice (the spec's `--agent openclaw` default covers the fork), but the spec should be explicit: "Hermes support requires the agent's sources in the calling checkout. A fork that does not carry `agents/hermes/` will see a clear error, not a silent stub."

### Conflict 5. Reproducibility

The spec does not address it.
The fork flags it as future work in section 8 but writes `date +%s` anyway.

If the fork script is going to be used in CI before the CLI exists, both pieces need fixing now (build-ID reproducibility, staged-dir reproducibility, `.dockerignore`).

### Conflict 6. Terminology

The spec uses both "agent runtime image" and "sandbox image".
The fork uses "sandbox image".

Recommendation: use "agent runtime image" in both. The artifact is not a sandbox on its own (the OpenShell daemon is what makes it a sandbox), and "sandbox image" misleads readers into thinking the OpenShell daemon lives inside. Reserve "sandbox image" for the post-OpenShell-wrap artifact if a separate term is needed.

## Recommendations, in priority order

1. Add cross-reference sections to each doc so the reader sees the relationship immediately.
2. Make the fork script reproducible. Accept `--build-id <value>` (default to `git rev-parse HEAD`). Pass `--build-arg NEMOCLAW_BUILD_ID=<value>`. Use a deterministic staged-context path, for example `/tmp/nemoclaw-build-<agent>-<commit>`. Generate `.dockerignore` in the staged directory.
3. Emit JSON metadata from the fork script matching the spec's contract. At minimum: `{"agent","tag","digest","source_commit","content_hash"}`.
4. Show concrete `--json` examples in the spec for both `image stage` and `image build` to lock the schema.
5. Add a `--base-image` flag policy to the spec. State the default behaviour versus an explicit override.
6. Resolve the OPENCLAW_VERSION rebase strategy documented in fork-doc section 11 before committing. It affects whether future rebases are mechanical or painful.
7. Add the assertion strategy for "model/provider not baked in" to the spec's testing section. Concrete examples: `docker run --rm <ref> env` assertions, or `docker history --no-trunc` grep checks.
8. Standardize terminology. Use "agent runtime image" in both docs. Reserve "sandbox image" only for the post-OpenShell-wrap artifact.

## Verdict

Both documents are honestly written and solve a real problem.
The divergences are reconcilable with one cross-reference pass plus a handful of engineering tightenings on the fork script.
The spec is in good shape as a feature design.
The fork plan needs the reproducibility and metadata upgrades listed above before `scripts/build-sandbox-image.sh` gets committed.
