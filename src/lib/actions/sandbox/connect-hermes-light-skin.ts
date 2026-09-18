// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { runOpenshell } from "../../adapters/openshell/runtime";
import { OPENSHELL_PROBE_TIMEOUT_MS } from "../../adapters/openshell/timeouts";
import { R, YW } from "../../cli/terminal-style";
import {
  removeHermesLightSkinConfig,
  shouldInspectHermesLightSkinConfig,
  shouldRemoveHermesLightSkin,
} from "../../domain/sandbox/connect-env";
import { readSandboxConfig, resolveAgentConfig, writeSandboxConfig } from "../../sandbox/config";
import { redact } from "../../security/redact";

type ConnectAgent = { name?: string } | null | undefined;

function warnHermesLightSkinFailure(action: string, error: unknown): void {
  const detail = error instanceof Error && error.message ? `: ${redact(error.message)}` : "";
  console.error(`  ${YW}⚠${R} Could not ${action} Hermes light terminal skin${detail}`);
}

function removeHermesLightSkinFile(sandboxName: string): boolean {
  const script = [
    "set -eu",
    'hermes_home="${HERMES_HOME:-/sandbox/.hermes}"',
    'skin_dir="$hermes_home/skins"',
    'rm -f "$skin_dir/nemoclaw-light.yaml"',
  ].join("\n");
  const result = runOpenshell(["sandbox", "exec", "--name", sandboxName, "--", "sh", "-s"], {
    ignoreError: true,
    input: script,
    stdio: ["pipe", "ignore", "ignore"],
    timeout: OPENSHELL_PROBE_TIMEOUT_MS,
  });
  if (result.status === 0 && !result.error && !result.signal) return true;
  warnHermesLightSkinFailure("remove", result.error ?? `exit ${result.status ?? result.signal}`);
  return false;
}

// Migration cleanup only. Hermes v2026.8.27 detects light terminals natively
// and remaps skin colors, so connect no longer installs or applies the
// NemoClaw-managed `nemoclaw-light` skin. What remains is stripping the stale
// `display.skin` reference and deleting the skin file on dark-terminal hosts
// for sandboxes configured by older releases.
export function prepareHermesLightTerminalSkin(
  sandboxName: string,
  agent: ConnectAgent,
  env: NodeJS.ProcessEnv,
): void {
  if (agent?.name !== "hermes") return;
  if (!shouldInspectHermesLightSkinConfig(agent, env)) return;

  const target = resolveAgentConfig(sandboxName);
  if (target.agentName !== "hermes") return;

  let config: ReturnType<typeof readSandboxConfig>;
  try {
    config = readSandboxConfig(sandboxName, target);
  } catch (error) {
    warnHermesLightSkinFailure("read", error);
    return;
  }

  if (!shouldRemoveHermesLightSkin(agent, env, config)) return;
  if (!removeHermesLightSkinConfig(config)) return;
  try {
    writeSandboxConfig(sandboxName, target, config);
  } catch (error) {
    warnHermesLightSkinFailure("update", error);
    return;
  }
  if (!removeHermesLightSkinFile(sandboxName)) return;
}
