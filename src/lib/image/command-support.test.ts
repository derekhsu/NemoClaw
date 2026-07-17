// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  buildImageBuildFlags,
  buildImageStageFlags,
  imageBuildExamples,
  imageStageExamples,
} from "./command-support";

describe("image command support", () => {
  it("defines stage flags for agent, output, and json without requiring agent", () => {
    const flags = buildImageStageFlags();

    expect(flags.agent).toBeDefined();
    expect(flags.output).toBeDefined();
    expect(flags.json).toBeDefined();
    expect(flags.quiet).toBeDefined();
    expect(flags.agent.required).not.toBe(true);
  });

  it("defines build flags for agent, required tag, push, and base-image", () => {
    const flags = buildImageBuildFlags();

    expect(flags.agent).toBeDefined();
    expect(flags.tag).toBeDefined();
    expect(flags.push).toBeDefined();
    expect(flags["base-image"]).toBeDefined();
    expect(flags.quiet).toBeDefined();
    expect(flags.agent.required).not.toBe(true);
    expect(flags.tag.required).toBe(true);
    expect(flags.agent.options).toEqual(["openclaw", "hermes"]);
  });

  it("documents grouped image build usage with base-image and push examples", () => {
    expect(imageBuildExamples).toEqual(
      expect.arrayContaining([
        expect.stringContaining(" image build "),
        expect.stringContaining("--base-image"),
        expect.stringContaining("--push"),
      ]),
    );
  });

  it("documents grouped image stage usage in examples", () => {
    expect(imageStageExamples).toEqual(
      expect.arrayContaining([expect.stringContaining(" image stage ")]),
    );
  });
});
