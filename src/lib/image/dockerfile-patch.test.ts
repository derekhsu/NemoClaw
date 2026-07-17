// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { applyImageOnlyDockerfilePatch } from "./dockerfile-patch";

describe("applyImageOnlyDockerfilePatch", () => {
  it("pins only the base image and build metadata", () => {
    const output = applyImageOnlyDockerfilePatch(
      "ARG BASE_IMAGE=ghcr.io/example/base:latest\nARG NEMOCLAW_BUILD_ID=dev\nARG NEMOCLAW_MODEL=model\n",
      {
        baseImageRef: "ghcr.io/example/base@sha256:abc",
        buildId: "94dc7e6",
      },
    );

    expect(output).toContain("ARG BASE_IMAGE=ghcr.io/example/base@sha256:abc");
    expect(output).toContain("ARG NEMOCLAW_BUILD_ID=94dc7e6");
    expect(output).toContain("ARG NEMOCLAW_MODEL=model");
  });

  it("does not inject provider or model runtime settings", () => {
    const output = applyImageOnlyDockerfilePatch("ARG NEMOCLAW_PROVIDER_KEY=unchanged\n", {
      baseImageRef: "ghcr.io/example/base@sha256:def",
      buildId: "94dc7e6",
    });

    expect(output).toContain("ARG NEMOCLAW_PROVIDER_KEY=unchanged");
    expect(output).not.toContain("nvidia");
    expect(output).not.toContain("openai");
  });

  it("leaves the base image untouched when no override is supplied", () => {
    const output = applyImageOnlyDockerfilePatch(
      "ARG BASE_IMAGE=ghcr.io/example/base:latest\nARG NEMOCLAW_BUILD_ID=dev\n",
      { baseImageRef: null, buildId: null },
    );

    expect(output).toContain("ARG BASE_IMAGE=ghcr.io/example/base:latest");
    expect(output).toContain("ARG NEMOCLAW_BUILD_ID=dev");
  });

  it("is a no-op when the Dockerfile does not declare the patched ARGs", () => {
    const original = "FROM scratch\nRUN echo hi\n";
    const output = applyImageOnlyDockerfilePatch(original, {
      baseImageRef: "ghcr.io/example/base@sha256:abc",
      buildId: "94dc7e6",
    });

    expect(output).toBe(original);
  });
});
