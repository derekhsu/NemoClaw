// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { patchOpenClawInternalContextSse } from "../../scripts/lib/patch-openclaw-internal-context-sse.mts";
import fixture from "../fixtures/openclaw-sse-2026.9.2.json";

const temporary: string[] = [];

export function cleanupRuntimes() {
  temporary.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
}

export function createRuntime(patch = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-sse-"));
  temporary.push(root);
  const dist = path.join(root, "dist");
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "2026.9.2" }));
  for (const [name, source] of Object.entries(fixture.files))
    fs.writeFileSync(path.join(dist, name), source);
  if (patch) patchOpenClawInternalContextSse(dist);
  return dist;
}
