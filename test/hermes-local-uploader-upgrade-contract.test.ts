// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const UPGRADE_GUIDE = path.join(
  ROOT,
  "conductor",
  "tracks",
  "hermes_stdio_uploader_20260909",
  "upgrade-verification.md",
);

describe("Hermes local uploader upgrade contract", () => {
  it("pins the imported uploader revision and the files requiring re-review", () => {
    const guide = fs.readFileSync(UPGRADE_GUIDE, "utf-8");

    expect(guide).toContain("3b1690dab83adff35898ab1fdcaf2e99aa71c420");
    expect(guide).toContain("agents/hermes/mcp-config-transaction.py");
    expect(guide).toContain("agents/hermes/Dockerfile");
    expect(guide).toContain("vendor/clawshell/sandbox-mcp-server/");
  });

  it("requires a rebuild and signed-link proof after an accepted upgrade", () => {
    const guide = fs.readFileSync(UPGRADE_GUIDE, "utf-8");

    expect(guide).toContain("npm exec vitest run");
    expect(guide).toContain("docker build");
    expect(guide).toContain("upload_file");
    expect(guide).toContain("signed download link");
  });
});
