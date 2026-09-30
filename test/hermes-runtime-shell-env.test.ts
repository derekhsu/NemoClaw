// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { shellQuote } from "../src/lib/core/shell-quote";
import { bashPrintfQ } from "./support/hermes-shell-harness";

const START_SCRIPT = path.join(import.meta.dirname, "..", "agents", "hermes", "start.sh");

function extractRuntimeShellEnvBlock(src: string): string {
  const start = src.indexOf("write_runtime_shell_env() {");
  const end = src.indexOf("\nwrite_runtime_shell_env\n", start);
  expect(
    start >= 0 && end >= 0,
    "Expected write_runtime_shell_env block in agents/hermes/start.sh",
  ).toBe(true);
  return src.slice(start, end).trimEnd();
}

function runRuntimeShellEnvBootstrap() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-hermes-runtime-env-"));
  const envFile = path.join(tmpDir, "nemoclaw-proxy-env.sh");
  const caFile = path.join(tmpDir, "proxy ca.pem");
  const hermesHome = path.join(tmpDir, ".hermes");
  const scriptPath = path.join(tmpDir, "run.sh");

  fs.mkdirSync(hermesHome, { recursive: true });
  fs.writeFileSync(caFile, "ca");

  const src = fs.readFileSync(START_SCRIPT, "utf-8");
  fs.writeFileSync(
    scriptPath,
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'emit_sandbox_sourced_file() { cat >"$1"; chmod 444 "$1"; }',
      `_PROXY_ENV_FILE=${shellQuote(envFile)}`,
      `_PROXY_URL=${shellQuote("http://10.200.0.1:3128")}`,
      `_NO_PROXY_VAL=${shellQuote("localhost,127.0.0.1,::1,10.200.0.1")}`,
      `HERMES_DIR=${shellQuote(hermesHome)}`,
      `SSL_CERT_FILE=${shellQuote(caFile)}`,
      "CURL_CA_BUNDLE=",
      "REQUESTS_CA_BUNDLE=",
      "GIT_SSL_CAINFO=",
      extractRuntimeShellEnvBlock(src),
      "write_runtime_shell_env",
    ].join("\n"),
    { mode: 0o700 },
  );

  try {
    const result = spawnSync("bash", [scriptPath], {
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, AWS_EC2_METADATA_DISABLED: "false" },
    });
    const envFileContent = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf-8") : "";
    const envFileMode = fs.existsSync(envFile)
      ? (fs.statSync(envFile).mode & 0o777).toString(8)
      : "";
    const guardResult = spawnSync("bash", ["-c", `. ${shellQuote(envFile)}; hermes setup`], {
      encoding: "utf-8",
      timeout: 5000,
      env: { ...process.env, PATH: "/usr/bin:/bin" },
    });
    const preservedHomeResult = spawnSync(
      "bash",
      ["-c", `HERMES_HOME=/sandbox/.hermes/profiles/dashboard-home; . ${shellQuote(envFile)}; printf '%s' "$HERMES_HOME"`],
      { encoding: "utf-8", timeout: 5000 },
    );
    const defaultHomeResult = spawnSync(
      "bash",
      ["-c", `unset HERMES_HOME; . ${shellQuote(envFile)}; printf '%s' "$HERMES_HOME"`],
      { encoding: "utf-8", timeout: 5000 },
    );

    return {
      src,
      result,
      envFileContent,
      envFileMode,
      guardResult,
      preservedHomeResult,
      defaultHomeResult,
      hermesHome,
      caFile,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("agents/hermes/start.sh runtime shell env", () => {
  it("puts the Hermes configure guard in the sourced proxy env file", () => {
    const run = runRuntimeShellEnvBootstrap();
    const escapedCaFile = bashPrintfQ(run.caFile);

    expect(run.result.status).toBe(0);
    expect(run.envFileMode).toBe("444");
    expect(run.envFileContent).toContain(`export HERMES_HOME="\${HERMES_HOME:-${run.hermesHome}}"`);
    expect(run.preservedHomeResult.stdout).toBe("/sandbox/.hermes/profiles/dashboard-home");
    expect(run.defaultHomeResult.stdout).toBe(run.hermesHome);
    expect(run.envFileContent).toContain('export HERMES_TUI_DIR="/opt/hermes/ui-tui"');
    expect(run.envFileContent).not.toContain("AWS_EC2_METADATA_DISABLED");
    expect(run.envFileContent).not.toContain('HERMES_TUI_DIR="${HERMES_TUI_DIR:-');
    expect(run.envFileContent).toContain(`export SSL_CERT_FILE=${escapedCaFile}`);
    expect(run.envFileContent).toContain("# nemoclaw-configure-guard begin");
    expect(run.envFileContent).toContain("hermes() {");
    expect(run.envFileContent).toContain("# nemoclaw-configure-guard end");
    expect(run.envFileContent).not.toContain(".bashrc");
    expect(run.envFileContent).not.toContain(".profile");

    expect(run.guardResult.status).toBe(1);
    expect(run.guardResult.stderr).toContain(
      "Error: 'hermes setup' cannot modify config inside the sandbox.",
    );
  });
});
