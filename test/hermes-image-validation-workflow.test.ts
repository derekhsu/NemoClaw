// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import YAML from "yaml";

const workflow = YAML.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../.github/workflows/hermes-image-validation.yaml"),
    "utf8",
  ),
);
const steps = workflow.jobs.validate.steps;

it.each([
  ["candidate-baseline-20261005", 0],
  ["latest", 1],
  ["hermes-v2026.8.27", 1],
  ["bad;touch /tmp/invalid", 1],
  ["", 1],
  ["a".repeat(112), 1],
])("checks candidate tag %s before credentials or builds", (tag, expected) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-ci-tag-"));
  try {
    const step = steps.find((entry: { name: string }) => entry.name === "Validate candidate tag");
    const result = spawnSync("bash", ["-c", step.run], {
      env: {
        ...process.env,
        CANDIDATE_TAG: tag,
        RUNNER_TEMP: directory,
        GITHUB_SHA: "a".repeat(40),
      },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(expected);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
