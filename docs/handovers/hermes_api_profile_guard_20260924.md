# Handover: Hermes API Profile Guard (2026-09-24)

## 📝 Context

Continue the ClawShell Hermes API-profile integration by adding an image-owned, root-controlled configuration guard in NemoClaw. The guard must let ClawShell update the `api` profile without allowing the sandbox user or Hermes Agent to redefine its own trusted configuration baseline. Keep the existing default profile and gateway behavior independent. The active work is on the NemoClaw `feat/image-only-cli` build line; do not base it on the Landlock/local-uploader line.

## 🌿 Environment

- **NemoClaw repository:** `/Volumes/DS72/project/NemoClaw-api-profile-guard`
- **NemoClaw branch:** `codex/hermes-api-profile-guard` (based on `origin/feat/image-only-cli` at `af64f6f4`)
- **NemoClaw worktree status:** clean; one commit ahead of the base
- **NemoClaw Conductor Track:** `hermes_api_profile_guard_20260924` (Pending; plan not started)
- **ClawShell repository:** `/Users/derekhsu/Project/clawshell-gateway`
- **ClawShell integration worktree:** `/Users/derekhsu/.superset/worktrees/2c33b666-aef2-4ae1-a35f-a3008574ec22/verbose-scarecrow`
- **ClawShell branch:** `hermes-profile-boundary`, rebased onto `origin/main`
- **ClawShell Conductor Track:** `hermes_api_profile_20260916`

## 📂 Changes Summary

### Modified Files

NemoClaw branch currently contains the planning track only:

- `conductor/tracks/hermes_api_profile_guard_20260924/spec.md`
- `conductor/tracks/hermes_api_profile_guard_20260924/plan.md`
- `conductor/tracks/hermes_api_profile_guard_20260924/index.md`
- `conductor/tracks/hermes_api_profile_guard_20260924/metadata.json`
- `conductor/tracks.md`

The ClawShell worktree has uncommitted changes that belong to its ongoing integration work. Preserve them:

- Modified `conductor/tracks.md`
- Modified `conductor/tracks/hermes_api_profile_20260916/verification.md` with the latest failed end-to-end verification evidence
- Untracked `clawshell-gateway/backend/tests/unit/services/test_hermes_policy_runtime_paths.py`

### Recent Commit

- NemoClaw: `afc3d28b` — `docs(conductor): plan Hermes API profile guard`
- ClawShell: `bdedd45b` — `docs(conductor): record 0.20.6 image verification and readiness redesign`

## ✅ Progress & Status

### Completed

- Pulled/rebased the ClawShell integration branch onto current `origin/main`; the rebased branch contains the `/opt/uv-python` policy allowance.
- Verified a fresh ClawShell sandbox using published Hermes image digest `sha256:ea54c5ffa16b56f7fec2242782ba4092585d4c4f9b21d51b180159a75d95b888` and policy profile revision 2.
- Confirmed Hermes 0.20.6, `/p/api/health` and `/health` return 200, Dashboard ports return 200, API-key-authenticated `/p/api/v1/models` returns 200, and unprefixed `/v1/models` returns 401.
- Recorded that the ClawShell sandbox still ends in `error` during provider configuration. Do not describe the integration as passing.
- Created and reviewed the NemoClaw Conductor specification and phased implementation plan. The independent docs review found no remaining blockers after revisions. No NemoClaw source implementation has started.

### 🚧 In Progress

The API-profile managed configuration call fails with:

```text
hermes_config_update_failed
[SECURITY] refusing malformed Hermes config hash
```

Evidence: ClawShell execution `op-16c864769b09`, sandbox `hermes-api-0924-r2` (`sbx-fa40a767`). The image's fixed root-controlled anchor `/etc/nemoclaw/hermes.config-hash` describes the default profile paths, while ClawShell invokes the guard for `/sandbox/.hermes/profiles/api`. The API profile's own `.config-hash` is sandbox-user controlled and cannot be trusted as a strict anchor.

The guard correctly rejects this mismatch. The fix needs a dedicated root-controlled API-profile bootstrap, anchor, and restart-seal state, with path protection that prevents replacement through writable parent directories. The NemoClaw track also requires an explicit `NEMOCLAW_REQUIRE_API_PROFILE=1` startup contract for ClawShell-managed images.

## 🧪 Verification Results

### Latest Test Output

No test suite was run as part of preparing this handoff. The latest live integration probe is a **failed end-to-end run**: readiness and route/authentication checks passed, but sandbox provisioning failed during the profile-scoped managed-config update due to the malformed/default-profile hash anchor described above. Detailed evidence is recorded in the ClawShell track verification log.

## ⏭️ Next Steps

1. Read `conductor/tracks/hermes_api_profile_guard_20260924/spec.md` and `plan.md` in the NemoClaw worktree, then implement Phase 1: inspect existing guard/startup/restart-seal contracts and add adversarial tests for the observed API-profile mismatch, edited files/hashes, and path replacement.
2. Probe and select a parent-path protection mechanism that works in the actual Hermes image while preserving Hermes runtime writes. File ownership alone is insufficient if an ancestor directory remains writable.
3. Implement a fixed root-only bootstrap for the `api` profile. It must create/verify the profile, fixed `clawshell-api-minimal-v1` policy, key, independent strict hash anchor, and restart state without printing the key or accepting arbitrary profile paths. Keep the default-profile state untouched.
4. Update the managed entrypoint contract and ClawShell caller together. Do not solve this by pointing the current guard at the sandbox-owned API `.config-hash`, copying it blindly, adding a general root shell, or reverting the strict rejection.
5. Build a local candidate from `feat/image-only-cli`, run focused image/guard contract checks, then create a fresh ClawShell sandbox and verify provider update, restart/rebuild, default-profile non-interference, API route authentication, and sandbox-user tampering attempts before considering publication.
6. Preserve the ClawShell worktree's existing modified and untracked files listed above. The previous failed sandbox may remain for diagnosis; use a fresh sandbox for the next acceptance run.

## Important Boundaries

- Do not use `NemoClaw-recovered` or `feat/hermes-local-uploader-0911` as the implementation base; those belong to the Landlock/local-uploader build line.
- Do not publish or retag `nemoclaw-hermes:0.20.6` before the candidate passes the track's release gate.
- API keys must not appear in logs, command arguments, or host-side persistent files.
- NemoClaw owns the image guard/bootstrap contract; ClawShell owns its privileged caller and end-to-end provisioning verification.
