// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOCKERFILE = path.join(ROOT, "agents", "hermes", "Dockerfile");
const START_SCRIPT = path.join(ROOT, "agents", "hermes", "start.sh");
const CREDENTIAL_MANIFEST = path.join(
  ROOT,
  "src",
  "lib",
  "actions",
  "sandbox",
  "openshell-child-visible-credentials.v0.0.101.json",
);
const UPLOADER_SOURCE = path.join(ROOT, "vendor", "clawshell", "sandbox-mcp-server");
const UPLOADER_VENV = "/sandbox/.venvs/sandbox-mcp-server";

describe("Hermes managed local uploader image contract", () => {
  it("builds the reviewed uploader into the fixed sandbox virtual environment", () => {
    const dockerfile = fs.readFileSync(DOCKERFILE, "utf-8");

    expect(fs.existsSync(path.join(UPLOADER_SOURCE, "pyproject.toml"))).toBe(true);
    expect(fs.existsSync(path.join(UPLOADER_SOURCE, "uv.lock"))).toBe(true);
    expect(
      fs.existsSync(path.join(UPLOADER_SOURCE, "src", "sandbox_mcp_server", "server.py")),
    ).toBe(true);

    expect(dockerfile).toContain("FROM scratch AS hermes-local-uploader-payload");
    expect(dockerfile).toContain(
      "COPY vendor/clawshell/sandbox-mcp-server/ /opt/nemoclaw-sandbox-mcp-server/",
    );
    expect(dockerfile).toContain("COPY --from=hermes-local-uploader-payload / /");
    expect(dockerfile).toContain(
      `UV_PROJECT_ENVIRONMENT=${UPLOADER_VENV} uv sync --frozen --no-dev --no-editable --no-cache`,
    );
    expect(dockerfile).toContain(`${UPLOADER_VENV}/bin/sandbox-mcp-server`);
    expect(dockerfile).toContain(`chmod -R go-w ${UPLOADER_VENV}`);
    expect(dockerfile).toContain(`chmod -R a+rX ${UPLOADER_VENV}`);
    expect(fs.readFileSync(START_SCRIPT, "utf-8")).not.toContain("sandbox-mcp-server");
  });

  it("keeps the uploaded package free of credential-bearing debug logging", () => {
    const gatewayClient = fs.readFileSync(
      path.join(UPLOADER_SOURCE, "src", "sandbox_mcp_server", "gateway_client.py"),
      "utf-8",
    );

    expect(gatewayClient).not.toContain("_debug_log");
    expect(gatewayClient).not.toContain("socket_probe");
  });

  it("uses the reviewed Gateway environment boundary already shipped to Hermes", () => {
    const dockerfile = fs.readFileSync(DOCKERFILE, "utf-8");
    const credentialManifest = JSON.parse(fs.readFileSync(CREDENTIAL_MANIFEST, "utf-8"));

    expect(credentialManifest.runtimeControlPrefixes).toContain("GATEWAY_");
    expect(dockerfile).toContain(
      "COPY src/lib/actions/sandbox/openshell-child-visible-credentials.v0.0.101.json /usr/local/lib/nemoclaw/openshell-child-visible-credentials.v0.0.101.json",
    );
  });
});
