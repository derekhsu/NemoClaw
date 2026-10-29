// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  dockerRunCommandBetween,
  type LoggedDockerShellResult,
  runLoggedDockerShell,
} from "./helpers/dockerfile-run-shell";

const DOCKERFILE = path.join(import.meta.dirname, "..", "Dockerfile");

function runPluginInstallBlock(
  functionDefinition: string,
  env: Record<string, string>,
  tamperArchive = false,
): LoggedDockerShellResult {
  const dockerfile = fs.readFileSync(DOCKERFILE, "utf-8");
  let command = dockerRunCommandBetween(
    dockerfile,
    "# Install non-messaging OpenClaw plugins",
    "# The reviewed cache stays root-owned and immutable to the sandbox user.",
  );
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-tavily-plugin-"));

  try {
    // Keep the real Dockerfile integrity check active over deterministic fixture bytes.
    const archive = "reviewed Tavily archive fixture";
    fs.writeFileSync(
      path.join(tmp, "tavily-plugin-2026.9.2.tgz"),
      tamperArchive ? `${archive} tampered` : archive,
    );
    command = command.replaceAll("/opt/nemoclaw-reviewed-npm-archives", tmp);
    const outcome = runLoggedDockerShell(command, tmp, [functionDefinition], {
      env: {
        ...env,
        OPENCLAW_TAVILY_PLUGIN_2026_9_2_INTEGRITY: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      },
    });
    return { ...outcome, calls: outcome.calls.replaceAll(tmp, "<archives>") };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const TAVILY_BUILD_ENV = {
  NEMOCLAW_OPENCLAW_OTEL: "0",
  NEMOCLAW_WEB_SEARCH_ENABLED: "1",
  NEMOCLAW_WEB_SEARCH_PROVIDER: "tavily",
  OPENCLAW_VERSION: "2026.9.2",
};

describe("sandbox provisioning: reviewed OpenClaw Tavily extension", () => {
  it("installs the verified archive offline and preserves its placeholder during doctor", () => {
    const { result, calls } = runPluginInstallBlock(
      [
        "openclaw() {",
        '  printf "%s|TAVILY_API_KEY=%s\\n" "$*" "${TAVILY_API_KEY:-}" >> "$call_log"',
        '  if [ "$1 $2" = "plugins install" ]; then',
        '    [ "${NPM_CONFIG_OFFLINE:-}" = "true" ] || return 42',
        '    [ "${NPM_CONFIG_IGNORE_SCRIPTS:-}" = "true" ] || return 43',
        '    [ "${npm_config_ignore_scripts:-}" = "true" ] || return 44',
        "  fi",
        "}",
      ].join("\n"),
      TAVILY_BUILD_ENV,
    );

    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(calls.trim().split("\n")).toEqual([
      "plugins install --force --accept-capabilities npm-pack:<archives>/tavily-plugin-2026.9.2.tgz|TAVILY_API_KEY=",
      "doctor --fix --non-interactive|TAVILY_API_KEY=openshell:resolve:env:TAVILY_API_KEY",
    ]);
    expect(calls).not.toContain("plugins inspect");
  });

  it("fails closed when the reviewed extension cannot be installed", () => {
    const { result, calls } = runPluginInstallBlock(
      [
        "openclaw() {",
        '  printf "%s\\n" "$*" >> "$call_log"',
        '  if [ "$1 $2" = "plugins install" ]; then return 41; fi',
        "}",
      ].join("\n"),
      TAVILY_BUILD_ENV,
    );

    expect(result.status).toBe(41);
    expect(calls.trim()).toBe(
      "plugins install --force --accept-capabilities npm-pack:<archives>/tavily-plugin-2026.9.2.tgz",
    );
  });

  it("rejects an archive whose integrity differs from the reviewed pin", () => {
    const { result, calls } = runPluginInstallBlock(
      'openclaw() { printf "%s\\n" "$*" >> "$call_log"; }',
      TAVILY_BUILD_ENV,
      true,
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("integrity mismatch");
    expect(calls).toBe("");
  });
});
