# Hermes API-Profile Guard — 2026-09-30 handover

## Goal (unchanged)

ClawShell's externally exposed OpenAI-compatible v1 API runs on the restricted
`api` Hermes profile instead of `default`, so API callers get a reduced toolset
and cannot administer the sandbox. Hermes Agent source is not modified.

Confirmed architecture (option A): filesystem-isolated sibling home
`/sandbox/.hermes-api/profiles/api`, `hermesapi` runtime uid, `sandbox` admin
uid owns the design surface. The `api` profile intentionally does not appear in
default-home profile enumeration; the admin reaches it by fixed path.

## This session's changes (branch `codex/hermes-api-profile-guard`)

- `e7446e826` feat(hermes): api design surface becomes admin-editable
  - `runtime-config-guard.py`: `SOUL.md`/`skills/` sealed `sandbox:api`
    (0640/2750); seal creates a default `SOUL.md`; new `normalize-api-profile`
    action (repair design surface, then verify + key/journal checks);
    bootstrap retry normalizes old profiles instead of failing closed.
  - `api-runtime.sh`: supervisor fingerprints
    `config.yaml`/`.env`/`SOUL.md`/`skills/` every ~2s; after a stable debounce
    tick it waits for the port to free, then respawns only the api gateway
    (proxy untouched — it never reads design files).
  - `scripts/lib/gateway-supervisor.sh`: `gateway_control_tree_fingerprint`
    (path + `cksum` content, portable across GNU/BSD).
  - `seed-dashboard-config.py`: appends a one-time "API profile design
    surface" section to the dashboard-home `SOUL.md` (rejects symlinked paths,
    preserves content, non-blocking on failure). Tells the dashboard agent the
    fixed path, traverse-only parent dirs, auto-restart behavior, and the
    `bin/` placement rule for api-side helpers/MCP servers.
- `373a8fed5` fix(hermes): `normalize-api-profile` also runs the env-key and
  interrupted-transaction readiness checks (respawn path no longer weakens the
  contract).
- `6168230` fix(hermes): `_api_apply_proxy_env` — api gateway gets
  `HTTP(S)_PROXY`, `NO_PROXY` (+lowercase) and the CA bundle vars
  (`SSL_CERT_FILE`, `CURL_CA_BUNDLE`, `REQUESTS_CA_BUNDLE`, `GIT_SSL_CAINFO`,
  `NODE_EXTRA_CA_CERTS`). Whitelist-parses `/tmp/nemoclaw-proxy-env.sh` without
  eval (sandbox-owned file, root script), falls back to
  `10.200.0.1:3128` + `/etc/openshell-tls/ca-bundle.pem`.

## Why the proxy-env fix matters

`inference.local` does not resolve via sandbox DNS — all egress goes through
the OpenShell L7 proxy (`10.200.0.1:3128`). The api gateway (clean env under
`hermesapi`) never had proxy vars, so `/p/api/v1/chat/completions` returned a
valid envelope but failed upstream with "can't reach the model provider".
Confirmed this gap predates this work — image `.2` had it too; only
`/v1/models` (no upstream call) had been verified before.

## Validation evidence (sandbox `api-prof-0930e`, image .2 + hot-patched runtime)

- Readiness: `/p/api/health` 200; api key → 200 on `/p/api/v1/models`; same key
  → 401 on bare `/v1/models` (credential binding preserved).
- E2E-1 isolation: as `hermesapi`, writes to `SOUL.md`, `config.yaml`, `.env`,
  `skills/` all DENIED; dir write allowed but sticky bit blocks replacing
  sealed files.
- E2E-2 admin edit loop: `sandbox` uid wrote a marker into api `SOUL.md` →
  supervisor detected fingerprint change → api gateway pid changed
  (4369→52740+), default gateway untouched; normalize preserved the admin edit.
- E2E-3 toolset: api enabled `['file']`; default has the full set
  (web/browser/terminal/skills/cronjob/delegation/nemoclaw/…).
- E2E-4 dashboard SOUL: `dashboard-home/SOUL.md` contains the API-profile
  design-surface guidance (fixed path, traverse-only parents, auto-restart,
  `bin/` rule).
- Inference: after the proxy-env fix, `/p/api/v1/chat/completions` returns a
  real model reply (`finish_reason: stop`, usage populated) via
  `gpt-5.6-luna` → `https://inference.local/v1`.

## Images

- `2026.9.30.2` = `derekhsu/openshell-hermes@sha256:993190697abe7444740e6ceaca4ee1d6ee002374940d51ed4114c52028c9fba0`
  (all changes EXCEPT the proxy-env fix — still fails inference upstream).
- `2026.9.30.3` = `derekhsu/openshell-hermes@sha256:a53f3b52d44bc2cf88f648f8b0304aa4a95b50e3f4853c92b4c5b4d8a2795e88`
  (run `36697497695` at `6168230`) — the first image with working inference
  through the api profile. ClawShell blueprint `hermes-api-profile-verify-0924`
  `sandbox_source` was repointed to this digest (PUT via control API).

## Real ClawShell-path validation (sandbox `sbx-2f48f6a3` / `api-prof-0930g`)

Provisioned through `POST /api/sandboxes` on the live backend (`:8001`), ~90s
to `running`, container image verified as `a53f3b52d44b`:

- External OpenAI flow: `POST /api/sandboxes/sbx-2f48f6a3/v1/chat/completions`
  with a `csg_live_` API key + `x-thread-id` header → real `chat.completion`
  reply (`gpt-5.6-luna`, `finish_reason: stop`). Requires `x-thread-id`.
- Design-change loop on the .3 supervisor: `sandbox`-uid append to api
  `SOUL.md` → api gateway pid changed (4305→34905).
- Contract on the fresh image: `SOUL.md` `sandbox:api 0640`, `skills/`
  `sandbox:api 2750`, dashboard `SOUL.md` seeded with the design-surface note.
- Control-UI session issuance works (`POST .../control-ui/session` → iframe
  URL `?profile=dashboard-home`); the literal dashboard-chat edit was not
  exercised (needs a browser session).

## Known caveats / remaining

- `SOUL.md` writes through the dashboard agent trigger Hermes' protected-file
  approval prompt each time (by design).
- MCP/helper binaries for the api profile must live inside the profile dir
  (e.g. `bin/`) or another `hermesapi`-executable path — `/home/sandbox` and
  `/sandbox/.hermes` are unreachable for the api uid.
- The fingerprint baseline is sampled before gateway spawn; an edit landing
  during the multi-minute first boot registers as a change on the next tick.
- 5 unrelated test failures on this branch were reproduced with changes
  stashed — pre-existing environment issues (Linux scripts on macOS).
- Dashboard-chat edit itself remains the only unexercised step (browser UI).

## Source Contract Repair (October 03, 2026)

ClawShell PR #92 requires companion image changes for uploader verification and API runtime replacement.
The validation and image digests above describe the September 30 implementation.
They do not verify the October 03 source changes.

### Verify the Managed Local Uploader

ClawShell calls `hermes-mcp-config-transaction.py inspect-local-uploader` through the sandbox-user transport after `add-local-uploader`.
Both actions apply only to the default Hermes profile at `/sandbox/.hermes`.
ClawShell passes the reviewed Gateway URL and sandbox scope in a JSON `--payload` argument, using this shape:

```json
{"gateway_url":"https://gateway.example.com","sandbox_id":"sbx-example.00000000000000000000000000000000","replace_existing":true}
```

The inspection requires the canonical Gateway URL, the sandbox identifier, and `replace_existing: true`.
It compares the persisted `sandbox-file-uploader` entry with the fixed image-owned command, arguments, environment references, and server settings.
It also requires an authenticated guard snapshot that matches the applied MCP state.
The helper rechecks the snapshot before returning `{"ok":true,"state":"matched"}`.
A missing entry, a changed entry, or an integrity mismatch fails the inspection.
The inspection does not change configuration, repair integrity state, or restart a process.
ClawShell binds the sandbox scope to its HMAC proof before passing the argument.
The zero-filled proof above illustrates the format; ClawShell generates the actual proof.
The argument contains no secret credential values; the managed uploader uses the image-defined environment references.
Generic `inspect` verifies HTTP MCP server entries and cannot verify this command-based uploader contract.
These actions do not install or enable the uploader in the restricted API profile.

### Replace the API Runtime

`nemoclaw-api-runtime stop-wait` confirms that the supervisor singleton lock is released and the API listeners are absent before returning success.
The existing `stop` action uses the same completion barrier.
Both actions join the payload network namespace before checking listener absence.
The affected listeners are the API gateway on port `18699` and the prefix proxy on port `8642` in the payload network namespace.
The default gateway on port `18642` remains outside this stop operation.
If the supervisor or either API listener remains after the wait limit, the stop action returns failure.
The command also fails if it cannot resolve the payload namespace or read the listener tables.
ClawShell must stop its replacement sequence on that failure.

ClawShell maps its logical privileged-executor `stop` action to the attached command `nemoclaw-api-runtime stop-wait`.
Restart and configuration reapply wait for that command to complete, launch `start` detached, and then probe API health.
The existing `start` and `replace` actions remain detached operations.
This order prevents the previous API gateway's health response from satisfying readiness for the replacement.

### Adopt the Companion Image

Build a Hermes image that includes both source changes before deploying the corresponding ClawShell caller changes.
Select that image for the validation sandbox; upgrading the ClawShell backend alone does not update installed image helpers.
An older image rejects the unknown `stop-wait` action, so ClawShell stops instead of using an incomplete stop result.
An older image also rejects `inspect-local-uploader`.
Do not treat the September 30 image digests as evidence for these contracts.

No candidate image build, publication, or live sandbox validation is recorded for the October 03 contract changes in this addendum.
Before image adoption, verify uploader inspection rejection paths, stop timeout failures, and replacement readiness through ClawShell.
