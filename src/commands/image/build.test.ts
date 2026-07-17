// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";

const runImageBuildAction = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    agent: "openclaw",
    tag: "ghcr.io/example/openclaw-runtime:test",
    imageRef: "ghcr.io/example/openclaw-runtime@sha256:built",
    digest: "sha256:built",
    sourceCommit: "94dc7e6",
    stagedContextHash: "sha256:stage",
  }),
);

vi.mock("../../lib/actions/image/build", () => ({
  runImageBuildAction,
}));

import ImageBuildCommand from "./build";

const rootDir = process.cwd();

describe("ImageBuildCommand", () => {
  beforeEach(() => {
    runImageBuildAction.mockReset();
    runImageBuildAction.mockResolvedValue({
      agent: "openclaw",
      tag: "ghcr.io/example/openclaw-runtime:test",
      imageRef: "ghcr.io/example/openclaw-runtime@sha256:built",
      digest: "sha256:built",
      sourceCommit: "94dc7e6",
      stagedContextHash: "sha256:stage",
    });
  });

  it("forwards build flags to the image build action", async () => {
    await ImageBuildCommand.run(
      [
        "--agent",
        "hermes",
        "--tag",
        "ghcr.io/example/hermes-runtime:test",
        "--push",
        "--base-image",
        "ghcr.io/example/hermes-base@sha256:abc",
        "--json",
      ],
      rootDir,
    );

    expect(runImageBuildAction).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "hermes",
        tag: "ghcr.io/example/hermes-runtime:test",
        push: true,
        "base-image": "ghcr.io/example/hermes-base@sha256:abc",
        json: true,
      }),
    );
  });

  it("rejects a missing required tag before dispatch", async () => {
    await expect(ImageBuildCommand.run(["--agent", "hermes"], rootDir)).rejects.toThrow(/tag/i);

    expect(runImageBuildAction).not.toHaveBeenCalled();
  });

  it("rejects an unsupported agent before dispatch", async () => {
    await expect(
      ImageBuildCommand.run(["--agent", "invalid-runtime", "--tag", "ghcr.io/example/test"], rootDir),
    ).rejects.toThrow(/Expected .* to be one of|agent/i);

    expect(runImageBuildAction).not.toHaveBeenCalled();
  });

  it("prints machine-readable JSON in build mode", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await ImageBuildCommand.run(
        ["--agent", "openclaw", "--tag", "ghcr.io/example/openclaw-runtime:test", "--json"],
        rootDir,
      );
      expect(logSpy).toHaveBeenCalled();
      const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(output).toContain('"tag"');
      expect(output).toContain('"stagedContextHash"');
    } finally {
      logSpy.mockRestore();
    }
  });
});
