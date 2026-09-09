# Technical Stack

- TypeScript and Vitest for NemoClaw orchestration and image-contract tests.
- Python for Hermes image helpers, including the managed MCP transaction.
- Docker multi-architecture images for the Hermes runtime.
- OpenShell provider credentials for runtime credential placeholders.
- The existing ClawShell `sandbox-mcp-server` package as the fixed local MCP
  executable dependency.

Use the repository's `npm` scripts and focused Vitest projects. Do not add a
new package manager or a host-global dependency for this capability.
