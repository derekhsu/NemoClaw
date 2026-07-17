// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";

const runImageStageAction = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    agent: "openclaw",
    dockerfile: "/repo/Dockerfile",
    baseDockerfile: "/repo/Dockerfile.base",
    contextPath: "/tmp/out/context",
    sourceCommit: "94dc7e6",
    contentHash: "sha256:stage",
  }),
);

vi.mock("../../lib/actions/image/stage", () => ({
  runImageStageAction,
}));

import ImageStageCommand from "./stage";

const rootDir = process.cwd();

describe("ImageStageCommand", () => {
  beforeEach(() => {
    runImageStageAction.mockReset();
    runImageStageAction.mockResolvedValue({
      agent: "openclaw",
      dockerfile: "/repo/Dockerfile",
      baseDockerfile: "/repo/Dockerfile.base",
      contextPath: "/tmp/out/context",
      sourceCommit: "94dc7e6",
      contentHash: "sha256:stage",
    });
  });

  it("forwards stage flags to the image stage action", async () => {
    await ImageStageCommand.run(
      ["--agent", "openclaw", "--output", "/tmp/out", "--json"],
      rootDir,
    );

    expect(runImageStageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "openclaw",
        output: "/tmp/out",
        json: true,
      }),
    );
  });

  it("rejects an unsupported agent before dispatch", async () => {
    await expect(ImageStageCommand.run(["--agent", "invalid-runtime"], rootDir)).rejects.toThrow(
      /Expected .* to be one of|agent/i,
    );

    expect(runImageStageAction).not.toHaveBeenCalled();
  });

  it("prints machine-readable JSON in stage mode", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await ImageStageCommand.run(
        ["--agent", "openclaw", "--output", "/tmp/out", "--json"],
        rootDir,
      );
      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain('"contextPath"');
    } finally {
      logSpy.mockRestore();
    }
  });
});
