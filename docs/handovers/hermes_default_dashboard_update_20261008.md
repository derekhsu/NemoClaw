<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Hermes Default Dashboard Update Handover

This handover records the ClawShell fork work for a managed Hermes default model update through the Dashboard.
The user canceled the old sandbox migration.
The current scope covers a new Hermes sandbox initialized by an image that contains the managed default update capability.
This handover does not establish a supported NVIDIA NemoClaw integration.

The source commit is `17f3ebc37`, with uncommitted implementation changes in the assigned checkout.
Source behavior, the new image build, and live Dashboard acceptance have separate evidence requirements.
The live HTTP contract acceptance passed for the configured Luna route.
Browser interaction and a change to another model were not tested.

## Keep the Default and API Profiles Separate

The Dashboard main model action must use the managed default update operation.
The native `POST /api/model/set` save cannot authorize a privileged runtime configuration change.
The Gateway derives the model, inference endpoint, credential reference, and API mode from the sandbox's configured `inference.local` route.
The browser cannot select an arbitrary endpoint or supply a credential through this operation.

The runtime default configuration is `/sandbox/.hermes/config.yaml`.
The restricted API profile remains at `/sandbox/.hermes-api/profiles/api/config.yaml`.
The update preserves authenticated default tools, Model Context Protocol (MCP) settings, and other non-routing options.
The update does not copy configuration, credentials, or tools from the API profile.
Ordinary Provider Reapply preserves the runtime default profile.
Creation and replacement Rebuild retain their separate default initialization behavior.

## Authenticate Fresh Initialized State

The root guard accepts the managed update payload fields `local_uploader` and `config_base64`.
The Gateway no longer supplies image baseline configuration or environment inputs.
The expected configuration digest protects the operation against a concurrent configuration change.

The root strict hash authenticates the fresh initialized configuration and environment.
When the Gateway has added the canonical `sandbox-file-uploader` MCP entry, the guard reverses exactly that addition.
The reversed, normalized configuration must match the original configuration digest in the strict anchor.
The existing environment must already match the strict environment digest.
The operation permits no environment append or legacy baseline conversion.

The guard accepts only the uploader entry authorized by the Gateway's sandbox scope and uploader values.
Mutable configuration cannot authorize the uploader URL or sandbox scope.
The replacement may change routing fields while preserving authenticated non-routing fields.

The guard must refuse these conditions before it advances trust:

- An old or uninitialized sandbox configuration.
- An unknown baseline or modified strict anchor.
- Additional or modified MCP server entries.
- Configuration or environment drift outside the exact canonical uploader addition.
- A stale configuration digest or an incompatible installed guard.
- A locked posture or an unresolved transaction recovery record.

The default `API_SERVER_KEY` remains in `/sandbox/.hermes/.env` for the managed Hermes internal API.
The update does not rotate or remove that key, transfer it to the API profile, or return it to the browser.
OpenShell resolves the `inference.local` credential reference through the configured provider.
This update does not rotate or remove that provider credential.

## Reload and Finish the Update

The root guard records the configuration write in a protected transaction.
The image-owned root controller reloads the managed default runtime and records a health receipt.
The receipt identifies the gateway process by PID and process start time.
The host reads back the configuration and revalidates the live inference route before requesting transaction completion.

The guard finishes only when the receipt still identifies the live gateway process.
A zombie process, exited process, changed start time, or reused PID cannot authorize completion.
A configuration write or reload response alone does not establish update success.

If the operation refuses a request, investigate the named condition before retrying.
For a stale digest, reload the model view and inspect the committed state.
For unexplained drift, preserve the configuration, strict anchors, and failure evidence.
Do not edit strict hashes or the protected transaction record to bypass a refusal.
If readback, route revalidation, or reload verification fails, preserve the protected recovery record.
Do not report that failure as a completed model update.

## Verify the Dashboard Outcome

Live acceptance must use a new initialized Hermes sandbox with the managed capability installed.
Use **Models > Set Main Model > Switch** for the model on the configured route.
For this case, the acceptance values are `gpt-5.6-luna`, `https://inference.local/v1`, and `codex_responses`.

The live acceptance must establish these results:

- The runtime default configuration and Dashboard readback agree after the update.
- A new default conversation succeeds through the configured `inference.local` route.
- The selected default model persists after a managed restart and ordinary Provider Reapply.
- The API profile retains its own route, credentials, and tools.
- The default profile retains its authenticated tool and MCP settings.
- Tampered inputs and a stale digest fail without an unauthorized configuration change.
- Transaction completion rejects a dead, zombie, or replaced gateway process.

An existing chat session does not prove that a new conversation uses the changed model.
A successful source test or a request that no longer returns 405 does not prove live Dashboard acceptance.

## Record the Image Evidence

The full Dockerfile build failed because its pinned base MCP module lacks `_ensure_mcp_sdk`.
The local acceptance recipe is `agents/hermes/Dockerfile.managed-default-validation`.
The recipe derives from the previously verified pinned image and installs the five managed-update runtime files with their protected permissions.
The completed image is `local/hermes-issue106-fresh@sha256:145e91d6252d3b95781f315f19bab80954d6df0ec6494785b7672bb44bc67ac3`.
This local derivative is not a published release and does not establish that the full Dockerfile builds.

After OrbStack recovered, the normal create pipeline completed provisioning of the new fixture.
The pipeline skipped only remote creation for the same OpenShell sandbox ID that already existed.
The fixture identifiers are:

- ClawShell sandbox ID: `sbx-f63916c0`.
- Sandbox name: `hermes-m106-1008`.
- OpenShell sandbox ID: `a86789ca-f76b-4407-83e4-5f30fed1fd2d`.

The fixture reached the ClawShell `running` state with the new image.

## Record the Live Acceptance

The live HTTP harness used the actual FastAPI Control UI route with an owner-signed session, an `Origin` header, and the native Dashboard POST payload.
Two consecutive explicit default/main update requests returned HTTP 200.
Luna was already the fresh default, so both requests performed an idempotent alignment with the configured route.
Each update stopped the previous gateway through the managed controller and verified the replacement gateway and health receipt.
The selected configuration persisted across both managed gateway restarts.
The acceptance did not restart the whole container, change the global inference route, or select another model.

The harness obtained the native Dashboard session header from bootstrap without printing its value.
Dashboard readback through `GET /api/model/auxiliary?profile=default` returned HTTP 200 with main provider `custom` and model `gpt-5.6-luna`.
This verifies the live HTTP contract; the harness did not click the browser UI.

After the update, the live fixture produced these results:

- Default `/v1/chat/completions` returned HTTP 200 with reply `OK`.
- API `/p/api/v1/chat/completions` returned HTTP 200 with reply `OK`.
- Each profile accepted its own API key with HTTP 200 and refused the other profile's key with HTTP 401.
- The profile API keys remained distinct.
- Default and API configuration and environment hashes remained unchanged across the idempotent updates.
- The canonical uploader remained present only in the default profile.

Ordinary Provider Reapply then completed.
Both profiles retained the same configuration and environment hashes, their separate keys, the route model, and tool isolation.
These results prove acceptance for the tested fresh fixture and Luna route, not a model change or another image.

The earlier fresh fixture `hermes-f106-1008` used image index digest `sha256:1423523e249a3c32bc59c93f442de0dc76ddaa8d55df0d19f9882ee798303b8a`.
That fixture validated default and API Luna chat requests returning HTTP 200 and API key isolation.
Its image lacks the dedicated managed default update capability, so its evidence does not establish the managed update result above.

The live stale-digest probe supplied `expected_config_sha256` as 64 zeroes.
The root guard rejected the request with a nonzero exit status, and the configuration bytes remained unchanged.
The root `_verify_strict_hash` and `_verify_compat_hash` checks passed after the refusal.
The protected transaction file `/run/nemoclaw/hermes-restart-seal.json` was absent after the checks.

## Record Source Checks and Remaining Work

The focused Gateway tests passed with 307 tests.
The external source checks passed with 184 tests across 12 files.
The generated shared-name artifact was built before those checks.
The existing start-test fixture was updated with two required source variables after its failure reproduced on the source commit.
The configuration compare-and-swap, tamper, and reload receipt source checks passed with 55 tests.
With `OPENSHELL_GATEWAY_ENDPOINT=127.0.0.1:17670`, the full backend unit suite reported 2,241 passed and three failed.
The failed tests were:

- `test_registered_second_runtime_mcp_configure_register_and_verify_use_neutral_contexts`.
- `test_hermes_provisioning_records_local_uploader_probe_failure`.
- `test_run_provisioning_task_status_transitions_and_probe_success`.

All three failures reproduced with the same environment in an archive of unmodified Gateway commit `07aeca2e`.
The first run also had six TLS endpoint mismatch failures, which reproduced on that unmodified commit.
After endpoint correction, the related 35 tests passed.
The full backend suite did not pass without failures.

After the final hook edits, the external source checks passed again with 184 tests.
The shell formatter changed four lines through line wrapping only.
The Dockerfile retains numeric `USER 0:0` for root bootstrap and documents its `DL3002` exception.
The live acceptance image above was built before those final edits.
Its evidence does not establish a byte-for-byte image build from the final formatted source.

This handover provides no old sandbox deployment or migration procedure.
The full Dockerfile MCP dependency mismatch remains unresolved.
Browser interaction, a switch from another model, and persistence after a whole-container restart have no live evidence in this handover.
This handover introduces no Fern navigation page, release entry, or agent-guide variant.
An independent documentation writer reviewed the earlier handover; its build-status finding was incorporated.
The final evidence update requires another independent writer review before final handoff.
The documentation task performs no live update, inference request, or sandbox image change.

The documentation build `npm_config_offline=true npm run docs` passed for the final evidence revision with zero Fern errors and two warnings.
The direct whitespace check passed for the assigned handover.
