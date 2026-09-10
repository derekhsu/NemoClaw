# Hermes Local Uploader Upgrade Verification

## Pinned import

The vendored uploader originated from ClawShell Gateway revision
`3b1690dab83adff35898ab1fdcaf2e99aa71c420`. The forked package intentionally
removes credential-bearing debug logs and is versioned as
`0.1.0+nemoclaw.1`.

## Required re-review scope

After rebasing this branch onto a new NemoClaw revision, review every diff in:

- `agents/hermes/mcp-config-transaction.py`
- `agents/hermes/Dockerfile`
- `vendor/clawshell/sandbox-mcp-server/`
- `src/lib/actions/sandbox/openshell-child-visible-credentials.v0.0.101.json`

Do not carry the patch forward if the Hermes MCP configuration format, the
credential-boundary manifest, the `/sandbox/.venvs/sandbox-mcp-server` path,
or the `sandbox-mcp-server` entry point changes without an explicit review.

## Verification sequence

1. Rebase onto the selected NemoClaw revision and resolve only reviewed
   conflicts in the required scope.
2. Refresh the vendor provenance and lockfile if the imported ClawShell
   uploader changes; preserve the credential-log removal.
3. Run focused contracts:

   ```sh
   npm exec vitest run test/hermes-local-uploader-contract.test.ts test/hermes-local-uploader-image-contract.test.ts test/hermes-local-uploader-upgrade-contract.test.ts
   ```

4. Build the new image from the repository root:

   ```sh
   docker build -f agents/hermes/Dockerfile -t nemoclaw-hermes-local-uploader:verify .
   ```

5. Create a new Hermes sandbox from that image. Configure the managed local
   uploader and have Hermes create a harmless file. Call `upload_file` once.
   The result must contain a signed download link that can be fetched within
   its documented lifetime.

6. Record the NemoClaw revision, image digest, sandbox identifier, and the
   successful signed-link evidence before publishing the image.

If any step fails, do not publish or reuse the rebuilt image.
