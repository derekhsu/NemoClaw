// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "..");
const maintainer = YAML.parse(
  fs.readFileSync(path.join(root, ".github/workflows/require-maintainer-edits.yaml"), "utf8"),
);
const step = maintainer.jobs["require-maintainer-edits"].steps[0];

it.each([
  ["same repository", "derekhsu/NemoClaw", "derekhsu/NemoClaw", "false", 0],
  ["external fork without permission", "contributor/NemoClaw", "NVIDIA/NemoClaw", "false", 1],
  ["external fork with permission", "contributor/NemoClaw", "NVIDIA/NemoClaw", "true", 0],
])("enforces maintainer edits for %s", (_name, source, target, allowed, expected) => {
  const result = spawnSync("bash", ["-c", step.run], {
    encoding: "utf8",
    env: {
      ...process.env,
      HEAD_REPO_FORK: "true",
      HEAD_REPO: source,
      BASE_REPO: target,
      MAINTAINER_CAN_MODIFY: allowed,
    },
  });
  expect(result.status, result.stderr + result.stdout).toBe(expected);
});

it.each([
  ["derekhsu/NemoClaw", "skipped", false],
  ["NVIDIA/NemoClaw", "skipped", false],
  ["NVIDIA/NemoClaw", "cancelled", false],
  ["NVIDIA/NemoClaw", "success", true],
  ["NVIDIA/NemoClaw", "failure", true],
])("publishes artifacts only after an eligible review on %s with result %s", (repository, result, expected) => {
  const advisor = YAML.parse(
    fs.readFileSync(path.join(root, ".github/workflows/pr-review-advisor.yaml"), "utf8"),
  );
  const condition = advisor.jobs.publish.if
    .slice(3, -2)
    .replaceAll("always()", "true")
    .replaceAll("github.repository", JSON.stringify(repository))
    .replaceAll("github.event_name", JSON.stringify("pull_request_target"))
    .replaceAll("github.event.action", JSON.stringify("synchronize"))
    .replaceAll("github.event.changes.base", "null")
    .replaceAll("needs.review.result", JSON.stringify(result));
  expect(Function("return (" + condition + ")")()).toBe(expected);
});
