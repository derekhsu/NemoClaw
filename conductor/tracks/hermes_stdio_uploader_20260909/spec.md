# Specification: Hermes Managed Local File Uploader

**Track ID:** `hermes_stdio_uploader_20260909`
**Type:** Feature
**Created:** 2026-09-09
**Status:** New

## Summary

Add one managed local stdio MCP server, `sandbox-file-uploader`, to this fork's
Hermes image. It lets a Hermes agent publish an allowed sandbox file through
the existing ClawShell Gateway upload flow and return a signed download link.

## Scope Authority

The fork owner approved this fork-specific capability. It is not an upstream
NemoClaw product claim or a change to Hermes Agent.

## User Story

As a ClawShell user, I want to retrieve a file created in a Hermes sandbox so
that I can access its contents through a signed download link.

## Acceptance Criteria

- [ ] The managed Hermes transaction accepts only the fixed uploader command,
  its reviewed arguments, and its reviewed environment references.
- [ ] It rejects an arbitrary command, argument, environment key, or literal
  credential before changing the Hermes configuration.
- [ ] The image contains the fixed uploader executable and the managed
  transaction registers it atomically with a confirmed gateway reload.
- [ ] A gateway-enabled sandbox can list `sandbox-file-uploader` and call
  `upload_file` for an allowed workspace path.
- [ ] The result is a short-lived signed download link, with existing Gateway
  ownership, path, expiry, and download-use controls preserved.
- [ ] Rebuild, registration, or probe failure leaves the sandbox usable and
  exposes a stable credential-free diagnostic.
- [ ] An upstream NemoClaw or Hermes update is not accepted until the patch
  rebases, the image builds, focused contracts pass, and a rebuilt sandbox
  proves the uploader flow.

## Dependencies

- `agents/hermes/mcp-config-transaction.py` and `agents/hermes/Dockerfile`.
- Existing Hermes managed-config and image-layout tests.
- ClawShell `sandbox-mcp-server` package and managed Gateway upload provider.
- A later ClawShell adapter change that invokes this supported image mode.

## Out of Scope

- A generic local stdio MCP installation interface.
- Changes to Hermes Agent upstream.
- Changes to upstream NemoClaw product scope or documentation.
- Gateway API redesign, remote HTTPS MCP registration, and changes to the
  existing OpenClaw uploader behavior.

## Technical Direction

Extend the image helper with one explicit local-uploader mutation mode. The
helper owns the fixed command and configuration shape; ClawShell supplies only
the reviewed runtime references. Package the uploader into the image and test
the helper, layout, integrity, and upgrade contract as one capability.
