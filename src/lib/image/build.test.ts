// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

import { resolveDefaultImageBuildBaseImage, runImageBuild } from "./build";

const hermesBase = "ghcr.io/nvidia/nemoclaw/hermes-sandbox-base";
const hermesPin = `${hermesBase}@sha256:${"1".repeat(64)}`;
const hermesPlatformRef = `${hermesBase}@sha256:${"2".repeat(64)}`;

describe("resolveDefaultImageBuildBaseImage", () => {
  it("prefers the reviewed Hermes pin and uses the Hermes base Dockerfile", async () => {
    const resolve = vi.fn().mockReturnValue({
      ref: hermesPlatformRef,
      digest: `sha256:${"2".repeat(64)}`,
      source: "pinned",
      glibcVersion: "2.41",
    });
    const readPin = vi.fn().mockReturnValue(hermesPin);
    const validate = vi.fn(() => true);

    await expect(
      resolveDefaultImageBuildBaseImage(
        {
          agent: "hermes",
          dockerfilePath: "/repo/agents/hermes/Dockerfile",
          baseDockerfilePath: "/repo/agents/hermes/Dockerfile.base",
          baseImageName: hermesBase,
          repoRoot: "/repo",
        },
        {
          resolveSandboxBaseImage: resolve,
          readHermesPinnedBaseImageRef: readPin,
          validateHermesBaseImage: validate,
        },
      ),
    ).resolves.toBe(hermesPlatformRef);

    expect(readPin).toHaveBeenCalledWith("/repo/agents/hermes/Dockerfile");
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        imageName: hermesBase,
        dockerfilePath: "/repo/agents/hermes/Dockerfile.base",
        inputPaths: ["/repo/agents/hermes/Dockerfile"],
        pinnedRemoteRef: hermesPin,
        preferPinnedRemoteRef: true,
        rootDir: "/repo",
        validateImage: validate,
      }),
    );
  });

  it("keeps the OpenClaw repository and uses the OpenClaw base Dockerfile", async () => {
    const openclawRef = "ghcr.io/nvidia/nemoclaw/sandbox-base@sha256:abc";
    const resolve = vi.fn().mockReturnValue({
      ref: openclawRef,
      digest: "sha256:abc",
      source: "latest",
      glibcVersion: "2.41",
    });

    await expect(
      resolveDefaultImageBuildBaseImage(
        {
          agent: "openclaw",
          dockerfilePath: "/repo/Dockerfile",
          baseDockerfilePath: "/repo/Dockerfile.base",
          baseImageName: "ghcr.io/nvidia/nemoclaw/sandbox-base",
          repoRoot: "/repo",
        },
        { resolveSandboxBaseImage: resolve },
      ),
    ).resolves.toBe(openclawRef);

    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        imageName: "ghcr.io/nvidia/nemoclaw/sandbox-base",
        dockerfilePath: "/repo/Dockerfile.base",
        localTag: "ghcr.io/nvidia/nemoclaw/sandbox-base:local",
        rootDir: "/repo",
      }),
    );
    expect(resolve.mock.calls[0]?.[0]).not.toHaveProperty("pinnedRemoteRef");
  });

  it("rejects a missing compatible Hermes base before the final image build", async () => {
    await expect(
      resolveDefaultImageBuildBaseImage(
        {
          agent: "hermes",
          dockerfilePath: "/repo/agents/hermes/Dockerfile",
          baseDockerfilePath: "/repo/agents/hermes/Dockerfile.base",
          baseImageName: hermesBase,
          repoRoot: "/repo",
        },
        {
          resolveSandboxBaseImage: vi.fn().mockReturnValue(null),
          readHermesPinnedBaseImageRef: vi.fn().mockReturnValue(hermesPin),
          validateHermesBaseImage: vi.fn(() => false),
        },
      ),
    ).rejects.toThrow("Unable to resolve a compatible hermes base image");
  });
});

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
        resolveBaseImage: vi.fn().mockResolvedValue("ghcr.io/example/base:latest"),
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
    const resolveBaseImage = vi
      .fn()
      .mockResolvedValue("ghcr.io/nvidia/nemoclaw/sandbox-base@sha256:abc");
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
    expect(resolveBaseImage).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: "openclaw",
        dockerfilePath: "/repo/Dockerfile",
        baseDockerfilePath: "/repo/Dockerfile.base",
        baseImageName: "ghcr.io/nvidia/nemoclaw/sandbox-base",
      }),
    );
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

  it("forwards --build-arg entries to the docker build hook", async () => {
    const dockerBuild = vi.fn().mockResolvedValue({
      imageRef: "local/openclaw:test",
      digest: "sha256:built",
    });
    await runImageBuild(
      {
        agent: "openclaw",
        tag: "local/openclaw:test",
        push: false,
        "build-arg": ["OPENCLAW_VERSION=2026.5.27", "NEMOCLAW_BUILD_ID=abc123"],
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
        resolveBaseImage: vi.fn().mockResolvedValue(null),
        dockerBuild,
      },
    );
    expect(dockerBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        buildArgs: ["OPENCLAW_VERSION=2026.5.27", "NEMOCLAW_BUILD_ID=abc123"],
      }),
    );
  });

  it("defaults buildArgs to an empty array when --build-arg is not supplied", async () => {
    const dockerBuild = vi
      .fn()
      .mockResolvedValue({ imageRef: "local/openclaw:test", digest: null });
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
        dockerBuild,
      },
    );
    expect(dockerBuild).toHaveBeenCalledWith(expect.objectContaining({ buildArgs: [] }));
  });
});
