// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it.each([0, 23])("preserves managed package installation exit status %s", (status) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-union-install-"));
  try {
    const dockerfile = fs.readFileSync(
      path.resolve(import.meta.dirname, "../agents/hermes/Dockerfile"),
      "utf8",
    );
    const instruction = dockerfile.match(
      /^RUN --network=none --mount=from=hermes-managed-teams-wheels[\s\S]*?(?=\n\n)/m,
    )?.[0];
    if (!instruction) throw new Error("Managed installation instruction is missing");
    fs.writeFileSync(path.join(directory, "node"), "#!/bin/sh\nexit " + status + "\n", {
      mode: 0o755,
    });
    const python = path.join(directory, "python");
    fs.writeFileSync(python, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const body = instruction
      .replace(/^RUN --network=none --mount=\S+ /, "")
      .replaceAll("/opt/hermes/.venv/bin/python", python);
    const result = spawnSync("sh", ["-c", body], {
      env: {
        ...process.env,
        NEMOCLAW_MANAGED_IMAGE_CAPABILITY_UNION: "1",
        PATH: directory + ":" + process.env.PATH,
      },
      encoding: "utf8",
    });
    expect(result.status, result.stderr).toBe(status);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
