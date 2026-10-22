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

// Execute the workflow command against an interpreter-aware container fixture.
it("runs installed MCP validation with the helper runtime interpreter", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-ci-mcp-"));
  try {
    fs.mkdirSync(path.join(directory, "hermes-evidence"));
    const helper = fs.readFileSync(
      path.resolve(import.meta.dirname, "../agents/hermes/mcp-config-transaction.py"),
      "utf8",
    );
    const interpreter = helper.split("\n")[0].slice(2);
    const docker = path.join(directory, "docker");
    fs.writeFileSync(
      docker,
      `#!/bin/bash
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--entrypoint" ]; then
    [ "$2" = "$EXPECTED_HERMES_PYTHON" ] || { echo "helper runtime mismatch" >&2; exit 17; }
    cat >/dev/null
    echo '{"installed_mcp_scope_contract":"passed"}'
    exit 0
  fi
  shift
done
exit 18
`,
    );
    fs.chmodSync(docker, 0o755);
    const step = steps.find(
      (entry: { name: string }) => entry.name === "Verify installed default MCP scope contract",
    );
    const result = spawnSync("bash", ["-c", step.run], {
      cwd: path.resolve(import.meta.dirname, ".."),
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        RUNNER_TEMP: directory,
        EXPECTED_HERMES_PYTHON: interpreter,
      },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(0);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(directory, "hermes-evidence/installed-mcp-scope.json"), "utf8"),
      ),
    ).toEqual({ installed_mcp_scope_contract: "passed" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
