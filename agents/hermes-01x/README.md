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

- Build and publish: `.github/workflows/hermes-01x-image.yaml` (tags
  `openshell01x-*` only; never `latest` or `hermes-<calver>`).
- There is no `manifest.yaml` here on purpose: the NemoClaw CLI discovers
  agents from `agents/*/manifest.yaml`, and the CLI's Hermes agent remains
  `agents/hermes/`. This image is consumed by ClawShell only.
- ClawShell's `runtime/hermes/` overlay is adapted separately
  (derekhsu/clawshell-gateway#254).
