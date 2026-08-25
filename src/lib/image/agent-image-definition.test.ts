// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MissingAgentImageSourcesError,
  resolveAgentImageDefinition,
} from "./agent-image-definition";

describe("resolveAgentImageDefinition", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-image-def-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("maps openclaw to the root Dockerfile family", () => {
    fs.writeFileSync(path.join(tmpDir, "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(tmpDir, "Dockerfile.base"), "FROM scratch\n");

    const def = resolveAgentImageDefinition("openclaw", tmpDir);

    expect(def.agent).toBe("openclaw");
    expect(def.dockerfilePath).toBe(path.join(tmpDir, "Dockerfile"));
    expect(def.baseDockerfilePath).toBe(path.join(tmpDir, "Dockerfile.base"));
    expect(def.contextRoot).toBe(tmpDir);
    expect(def.baseImageName).toBe("ghcr.io/nvidia/nemoclaw/sandbox-base");
  });

  it("maps hermes to the hermes Dockerfile family", () => {
    const hermesDir = path.join(tmpDir, "agents", "hermes");
    fs.mkdirSync(hermesDir, { recursive: true });
    fs.writeFileSync(path.join(hermesDir, "Dockerfile"), "FROM scratch\n");
    fs.writeFileSync(path.join(hermesDir, "Dockerfile.base"), "FROM scratch\n");

    const def = resolveAgentImageDefinition("hermes", tmpDir);

    expect(def.agent).toBe("hermes");
    expect(def.dockerfilePath).toBe(path.join(hermesDir, "Dockerfile"));
    expect(def.baseDockerfilePath).toBe(path.join(hermesDir, "Dockerfile.base"));
    expect(def.contextRoot).toBe(tmpDir);
    expect(def.baseImageName).toBe("ghcr.io/nvidia/nemoclaw/hermes-sandbox-base");
  });

  it("throws a clear error when the selected agent sources are missing", () => {
    expect(() => resolveAgentImageDefinition("hermes", tmpDir)).toThrow(
      MissingAgentImageSourcesError,
    );
  });

  it("throws a clear error for an unknown agent", () => {
    expect(() => resolveAgentImageDefinition("unknown", tmpDir)).toThrow(/unknown/i);
  });
});
