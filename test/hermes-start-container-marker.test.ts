// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { extractShellFunctionFromSource } from "./support/shell-function-extractor";

const START_SCRIPT = path.join(import.meta.dirname, "..", "agents", "hermes", "start.sh");

function runMarkedChild() {
  const fn = extractShellFunctionFromSource(
    fs.readFileSync(START_SCRIPT, "utf-8"),
    "mark_hermes_container_runtime",
  );
  const env = { ...process.env };
  delete env.HERMES_CONTAINER;
  return spawnSync(
    "bash",
    [
      "-c",
      [
        "set -euo pipefail",
        fn,
        "mark_hermes_container_runtime",
        `exec sh -c 'printf "%s" "$HERMES_CONTAINER"'`,
      ].join("\n"),
    ],
    { encoding: "utf-8", timeout: 5000, env },
  );
}

describe("agents/hermes/start.sh container marker", () => {
  // Hermes' _secure_dir() turns the baked sandbox:sandbox 3770 .hermes into 0700
  // when it cannot detect a container (OpenShell podman); root without
  // CAP_DAC_OVERRIDE then cannot write config there.
  it("exports HERMES_CONTAINER=1 to every process the entrypoint starts", () => {
    const result = runMarkedChild();

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("1");
  });
});
