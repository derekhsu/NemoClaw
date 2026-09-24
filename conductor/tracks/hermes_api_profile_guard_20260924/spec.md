<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Specification: Hermes API Profile Guard

**Track ID:** `hermes_api_profile_guard_20260924`

**Type:** Feature

**Created:** 2026-09-24

**Status:** Draft

## Summary

Add an image-owned, root-controlled configuration transaction for the Hermes
`api` profile used by ClawShell. Keep the existing default-profile gateway and
its guard state independent.

This is a fork-specific image contract for the ClawShell deployment. It does
not establish a supported upstream NemoClaw integration.

## Problem

ClawShell starts one Hermes 0.20.6 gateway from `/sandbox/.hermes` and serves
its API through `/sandbox/.hermes/profiles/api`. The current image guard has a
strict hash anchor for the default profile at
`/etc/nemoclaw/hermes.config-hash`. That anchor names the default config and
`.env` paths.

ClawShell's profile-scoped `write-config` call passes the default anchor. The
guard rejects it with `refusing malformed Hermes config hash`. A sandbox-user
bootstrap also cannot establish a trusted strict anchor by writing the API
profile's own `.config-hash`: the sandbox user controls that file and its
ancestors.

The failure was observed on 2026-09-24 with image digest
`sha256:ea54c5ffa16b56f7fec2242782ba4092585d4c4f9b21d51b180159a75d95b888`,
OpenShell sandbox `hermes-api-0924-r2`, and ClawShell execution
`op-16c864769b09`. The gateway route `/p/api/v1/models` returned 200 with
the API profile key, but ClawShell provisioning ended in `error` during
inference.local configuration.

## Scope and ownership

NemoClaw owns the fixed profile bootstrap command, strict hash anchor,
restart-seal state, path protection, and image tests. ClawShell owns sandbox
identity checks, the privileged command caller, provider configuration, and
end-to-end provisioning. The dependent ClawShell track is
`hermes_api_profile_20260916`.

## Required contract

1. A root-only image command creates or verifies the exact `api` profile,
   including its fixed ClawShell tool policy, before the managed gateway
   starts. It accepts no caller-selected profile name or arbitrary path.
2. The command generates or preserves `API_SERVER_KEY` inside the sandbox. It
   never prints the key or places it in a command argument. The gateway user
   can read it. ClawShell may retrieve it through its existing authenticated
   sandbox transport for an API request. ClawShell must not log or persist it
   on the host. A verified retry preserves the key; deleting the sandbox
   removes it with the profile.
3. The API profile has a root-controlled strict hash anchor and a separate
   restart-seal state. Neither can alias the default profile's files.
4. The sandbox user cannot edit or replace the API profile's config, `.env`,
   `.config-hash`, `.clawshell-tool-policy.json`, or protected path entries.
   Hermes can still write the runtime state it needs in a separate writable
   location. The policy file is a ClawShell contract artifact written by the
   image bootstrap; its presence alone does not prove the active toolset.
5. A profile-scoped config transaction compares the expected config digest,
   verifies the strict anchor, changes only the API profile, and advances its
   hash state. It leaves the default profile's config, key, hash, and restart
   state unchanged.
6. Missing anchors, malformed metadata, unexpected ownership, symlinks,
   path replacement, races, and interrupted transactions fail closed. A retry
   either verifies the same completed state or reports a recovery condition;
   it does not adopt sandbox-user edits as a new baseline.
7. The existing default-profile guard contract and single gateway/multiplexer
   behavior remain valid. This track must not include Landlock POC patches.

## Design constraints

- Do not make the sandbox-owned API `.config-hash` the strict trust anchor.
- Do not copy a sandbox-owned hash to a root path without verifying the
  bootstrap inputs and protected path identity inside one privileged
  transaction.
- Protect the parent path as well as the files. File ownership alone does not
  prevent a sandbox user from replacing an entry in a writable parent.
- Expose one allowlisted bootstrap action and the existing guard transaction
  through the ClawShell privileged caller. Do not add a general root shell.
- Keep the current image tag unchanged until focused tests, image contracts,
  and fresh-sandbox verification pass on an immutable candidate digest.

## Acceptance criteria

- [ ] A fresh sandbox starts the managed gateway with one `/p/api` route and
  no second gateway process.
- [ ] ClawShell can update inference.local through the API profile guard and
  reach RUNNING without changing the default profile.
- [ ] The sandbox user cannot modify or replace the protected API config,
  credential, hash, tool policy, or parent path.
- [ ] Guard tests cover altered files, altered hashes, path replacement,
  interrupted bootstrap, retry, and rollback.
- [ ] Existing default-profile and uploader image contracts pass.
- [ ] The published candidate image is multi-architecture, has an immutable
  digest, and contains no Landlock POC patch layer.

## Out of scope

- A new gateway listener or public ClawShell API.
- Arbitrary Hermes profile names or a generic profile manager.
- OpenClaw behavior changes.
- Landlock policy changes.
- Publishing a candidate image before the release gate passes.
