// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import { runImageBuild } from "./build";

describe("runImageBuild", () => {
  it("honors an explicit --base-image override and returns JSON metadata", async () => {
    const result = await runImageBuild(
      {
        agent: "openclaw",
        tag: "ghcr.io/example/openclaw-runtime:test",
        push: false,
        "base-image": "ghcr.io/example/base@sha256:abc",
        json: true,
      },
      {
        stageImageBuildContext: vi.fn().mockResolvedValue({
          agent: "openclaw",
          dockerfile: "/repo/Dockerfile",
          baseDockerfile: "/repo/Dockerfile.base",
          contextPath: "/tmp/openclaw/context",
          sourceCommit: "94dc7e6",
          contentHash: "sha256:stage",
        }),
        dockerBuild: vi.fn().mockResolvedValue({
          imageRef: "ghcr.io/example/openclaw-runtime@sha256:built",
          digest: "sha256:built",
        }),
      },
    );

    expect(result).toMatchObject({
      agent: "openclaw",
      tag: "ghcr.io/example/openclaw-runtime:test",
      imageRef: "ghcr.io/example/openclaw-runtime@sha256:built",
      digest: "sha256:built",
      stagedContextHash: "sha256:stage",
    });
  });

  it("never requires provider or model flags for image-only builds", async () => {
    const result = await runImageBuild(
      {
        agent: "openclaw",
        tag: "ghcr.io/example/openclaw-runtime:test",
        push: false,
        json: true,
      },
      {
        stageImageBuildContext: vi.fn().mockResolvedValue({
          agent: "openclaw",
          dockerfile: "/repo/Dockerfile",
          baseDockerfile: "/repo/Dockerfile.base",
          contextPath: "/tmp/openclaw/context",
          sourceCommit: "94dc7e6",
          contentHash: "sha256:stage",
        }),
        dockerBuild: vi.fn().mockResolvedValue({
          imageRef: "ghcr.io/example/openclaw-runtime@sha256:built",
          digest: "sha256:built",
        }),
      },
    );

    expect(result).not.toHaveProperty("provider");
    expect(result).not.toHaveProperty("model");
  });

  it("forwards the base-image override and push intent to the docker build hook", async () => {
    const dockerBuild = vi.fn().mockResolvedValue({
      imageRef: "ghcr.io/example/hermes-runtime@sha256:built",
      digest: "sha256:built",
    });
    await runImageBuild(
      {
        agent: "hermes",
        tag: "ghcr.io/example/hermes-runtime:test",
        push: true,
        "base-image": "ghcr.io/example/hermes-base@sha256:abc",
        json: true,
      },
      {
        stageImageBuildContext: vi.fn().mockResolvedValue({
          agent: "hermes",
          dockerfile: "/repo/agents/hermes/Dockerfile",
          baseDockerfile: "/repo/agents/hermes/Dockerfile.base",
          contextPath: "/tmp/hermes/context",
          sourceCommit: "94dc7e6",
          contentHash: "sha256:stage",
        }),
        dockerBuild,
        dockerPush: vi.fn().mockResolvedValue("sha256:pushed"),
      },
    );

    expect(dockerBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "ghcr.io/example/hermes-runtime:test",
        push: true,
        baseImage: "ghcr.io/example/hermes-base@sha256:abc",
      }),
    );
  });

  it("resolves a default base image when --base-image is not supplied", async () => {
    const resolveBaseImage = vi.fn().mockResolvedValue("ghcr.io/nvidia/nemoclaw/sandbox-base@sha256:abc");
    const dockerBuild = vi.fn().mockResolvedValue({
      imageRef: "local/openclaw:test",
      digest: "sha256:built",
    });
    const result = await runImageBuild(
      { agent: "openclaw", tag: "local/openclaw:test", push: false },
      {
        stageImageBuildContext: vi.fn().mockResolvedValue({
          agent: "openclaw",
          dockerfile: "/repo/Dockerfile",
          baseDockerfile: "/repo/Dockerfile.base",
          contextPath: "/tmp/openclaw/context",
          sourceCommit: "94dc7e6",
          contentHash: "sha256:stage",
        }),
        resolveBaseImage,
        dockerBuild,
      },
    );
    expect(resolveBaseImage).toHaveBeenCalled();
    expect(dockerBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        baseImage: "ghcr.io/nvidia/nemoclaw/sandbox-base@sha256:abc",
      }),
    );
    expect(result.baseImage).toBe("ghcr.io/nvidia/nemoclaw/sandbox-base@sha256:abc");
  });

  it("skips base image resolution when --base-image override is supplied", async () => {
    const resolveBaseImage = vi.fn();
    await runImageBuild(
      {
        agent: "openclaw",
        tag: "local/openclaw:test",
        push: false,
        "base-image": "ghcr.io/custom/base:latest",
      },
      {
        stageImageBuildContext: vi.fn().mockResolvedValue({
          agent: "openclaw",
          dockerfile: "/repo/Dockerfile",
          baseDockerfile: "/repo/Dockerfile.base",
          contextPath: "/tmp/openclaw/context",
          sourceCommit: "94dc7e6",
          contentHash: "sha256:stage",
        }),
        resolveBaseImage,
        dockerBuild: vi.fn().mockResolvedValue({ imageRef: "local/openclaw:test", digest: null }),
      },
    );
    expect(resolveBaseImage).not.toHaveBeenCalled();
  });

  it("spawns docker push when --push is set and returns the pushed digest", async () => {
    const dockerPush = vi.fn().mockResolvedValue("sha256:pushed");
    const result = await runImageBuild(
      { agent: "openclaw", tag: "ghcr.io/org/openclaw:test", push: true },
      {
        stageImageBuildContext: vi.fn().mockResolvedValue({
          agent: "openclaw",
          dockerfile: "/repo/Dockerfile",
          baseDockerfile: "/repo/Dockerfile.base",
          contextPath: "/tmp/openclaw/context",
          sourceCommit: "94dc7e6",
          contentHash: "sha256:stage",
        }),
        resolveBaseImage: vi.fn().mockResolvedValue(null),
        dockerBuild: vi.fn().mockResolvedValue({
          imageRef: "ghcr.io/org/openclaw:test",
          digest: "sha256:built",
        }),
        dockerPush,
      },
    );
    expect(dockerPush).toHaveBeenCalledWith("ghcr.io/org/openclaw:test");
    expect(result.digest).toBe("sha256:pushed");
  });

  it("does not spawn docker push when --push is not set", async () => {
    const dockerPush = vi.fn();
    await runImageBuild(
      { agent: "openclaw", tag: "local/openclaw:test", push: false },
      {
        stageImageBuildContext: vi.fn().mockResolvedValue({
          agent: "openclaw",
          dockerfile: "/repo/Dockerfile",
          baseDockerfile: "/repo/Dockerfile.base",
          contextPath: "/tmp/openclaw/context",
          sourceCommit: "94dc7e6",
          contentHash: "sha256:stage",
        }),
        resolveBaseImage: vi.fn().mockResolvedValue(null),
        dockerBuild: vi.fn().mockResolvedValue({ imageRef: "local/openclaw:test", digest: null }),
        dockerPush,
      },
    );
    expect(dockerPush).not.toHaveBeenCalled();
  });
});
