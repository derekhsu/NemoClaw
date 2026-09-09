# Project Workflow

## Task workflow

1. Mark the selected task `[~]` before changing source.
2. Add or update a focused failing test first.
3. Make the smallest change that passes the test.
4. Run the focused test and the applicable image-contract test.
5. Commit one logical task with a Conventional Commit message and record its
   short SHA in `plan.md`.
6. Pause for the user manual-verification task at each phase boundary.

## Upgrade workflow

For every NemoClaw or Hermes upgrade, rebase this patch onto the selected
upstream revision, review changes to `agents/hermes/`, rebuild the image, run
the managed-MCP contracts, and rebuild a Hermes sandbox to verify that
`upload_file` returns a valid signed download link. Do not publish an updated
image if any of these checks fails.

## Commands

- Focused tests: `npm exec vitest run --project integration --testNamePattern="Hermes MCP"`
- Changed-source tests: `npm run test:changed`
- Image and package contracts: `npm run test:package`
- Broad validation before publication: `npm run validate:pr`

Live sandbox testing is opt-in and requires explicit user approval.
