# Hermes image for OpenShell 0.1.x

This directory builds the Hermes image for OpenShell 0.1.x
(derekhsu/NemoClaw#52). It started as a copy of `agents/hermes/` at
`7ca4d04159` and is rewritten here for the 0.1.x permission model:

- every process runs as the `sandbox` user (OpenShell 0.1.x rejects UID/GID 0,
  and root has no capabilities);
- the API profile runs under a Landlock self-restriction instead of the
  separate `hermesapi` UID.

`agents/hermes/` stays the OpenShell 0.0.x image (f314, 0.0.92) and takes only
necessary fixes until the migration completes; the 0.0.x directory is then
removed. Port a 0.0.x fix here as well when it is unrelated to the permission
model.

- Build and publish: `.github/workflows/hermes-01x-image.yaml`. Input the
  release date (e.g. `2026.11.7`); it publishes
  `openshell01x-hermes-<semver>-<release>` plus `-amd64`/`-arm64`, with the
  Hermes version read from `Dockerfile.base`. It never moves `latest` or
  `hermes-<calver>`. Before tagging, the workflow fails if either platform
  image has more than 115 layers. Docker's overlay2 storage driver refuses an
  image with more than 125 layers; Podman has no such limit (#70). To add a
  build step, extend an existing `RUN` instruction.
- There is no `manifest.yaml` here on purpose: the NemoClaw CLI discovers
  agents from `agents/*/manifest.yaml`, and the CLI's Hermes agent remains
  `agents/hermes/`. This image is consumed by ClawShell only.
- ClawShell's `runtime/hermes/` overlay is adapted separately
  (derekhsu/clawshell-gateway#254).

## Credential boundary (OpenShell 0.1.x)

Children of the OpenShell supervisor see provider credentials only as
placeholders. OpenShell replaces a placeholder with the real value when a
request leaves the sandbox.

- Endpoint-bound credentials resolve only through the placeholder in the
  environment, which carries a stable handle
  (`openshell:resolve:env:s<64 hex>_NAME`) or a revision (`v<n>_NAME`). A bare
  `openshell:resolve:env:NAME` fails with `credential_unavailable` (#34).
- A provider value that is not a static credential reaches children as its raw
  value. Raw provider keys are therefore not a fixed list.

`hermes-mcp-config-transaction.py add` accepts
`Authorization: Bearer openshell:resolve:env:NAME` and:

1. refuses `NAME` when it is reserved in
   `openshell-child-visible-credentials.v0.1.7.json` or uses the `v<n>_` or
   `s<64 hex>_` placeholder namespace;
2. refuses `NAME` unless the transaction's own environment holds an OpenShell
   placeholder for it, which rejects raw (non-secret) values;
3. stores `Bearer <that placeholder>`. OpenShell resolves a placeholder by
   value, so the running gateway can use it even though its own environment
   predates a provider attached after the sandbox started; a `${NAME}`
   reference would expand from that stale environment. Re-attaching the
   provider issues a new handle: `inspect` then reports a mismatch and the
   server must be added again (a non-forced `remove` still recognizes it).

Regenerate the manifest for a new OpenShell release from
`google_cloud.rs`, `provider_credentials.rs` and `secrets.rs` in
`openshell-core`, and `grpc/policy.rs` in `openshell-server`, and record their
blob ids and SHA-256 in `generation.upstreamSourceEvidence`.

## OpenShell 0.0.x leftovers (unused on 0.1.x)

OpenShell 0.1.x has no `inference.local`; ClawShell writes the provider
connection with `write-model-config` and `hermes-api-profile.py write-config`
after Hermes starts. These parts still describe the 0.0.x route and are not
used on 0.1.x. They are removed together with `agents/hermes/` after the f314
migration (#34):

- `Dockerfile` defaults `NEMOCLAW_INFERENCE_BASE_URL` to
  `https://inference.local/v1`, so the build-time `config.yaml` points at it
  until ClawShell rewrites the model routing.
- `runtime-config-guard.py` keeps the managed-default commands
  (`write-managed-default` and related) and `start.sh` keeps
  `reload-managed-default`. They need root, which 0.1.x workloads do not have,
  and ClawShell no longer calls them (derekhsu/clawshell-gateway#267).
