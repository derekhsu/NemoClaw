# Product Guidelines

- Keep Hermes Agent upstream behavior unchanged.
- Add only the one reviewed `sandbox-file-uploader` local MCP server; do not
  create a general local-command registration interface.
- Never store or log a provider credential in a Hermes MCP configuration.
- Preserve the managed transaction's ownership, integrity, rollback, and
  gateway-reload checks.
- Treat a NemoClaw upgrade as incomplete until the patch rebases, the image
  builds, focused contracts pass, and a rebuilt sandbox proves file delivery.
- Document this capability as fork-specific unless upstream accepts it.
