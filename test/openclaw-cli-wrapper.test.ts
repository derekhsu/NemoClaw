// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("OpenClaw CLI wrapper", () => {
  it.each([
    ["update", "/usr/local", ""],
    ["plugins", "/user/upper", "/user/lower"],
  ])("uses the expected npm prefix for %s", (command, upper, lower) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-cli-wrapper-"));
    try {
      const node = path.join(root, "node");
      const wrapper = path.join(root, "wrapper.sh");
      fs.writeFileSync(
        node,
        '#!/bin/sh\nprintf "%s|%s|%s\\n" "${NPM_CONFIG_PREFIX-}" "${npm_config_prefix-}" "$*"\n',
        { mode: 0o755 },
      );
      fs.writeFileSync(
        wrapper,
        fs
          .readFileSync("scripts/openclaw-cli-wrapper.sh", "utf8")
          .replace("/usr/local/bin/node", node),
      );
      const result = spawnSync("sh", [wrapper, command, "--check"], {
        encoding: "utf8",
        env: { ...process.env, NPM_CONFIG_PREFIX: "/user/upper", npm_config_prefix: "/user/lower" },
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(
        `${upper}|${lower}|/usr/local/lib/node_modules/openclaw/openclaw.mjs ${command} --check`,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
