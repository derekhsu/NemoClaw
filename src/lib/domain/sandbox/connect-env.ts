// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ConfigObject, ConfigValue } from "../../security/credential-filter";

// Migration remnant: Hermes v2026.8.27 ships native light-terminal support
// (OSC 11 detection plus a global get_color remap), so NemoClaw no longer
// installs or applies this skin. These helpers only exist to strip the
// `nemoclaw-light` reference from sandbox configs written by older releases
// and to delete the skin file it pointed at.
export const NEMOCLAW_HERMES_LIGHT_SKIN_NAME = "nemoclaw-light";

function hasEnvValue(value: string | undefined): boolean {
  return String(value ?? "").trim().length > 0;
}

function isConfigRecord(value: ConfigValue): value is ConfigObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hermesConfigDisplaySkin(config: ConfigObject): string | null {
  const display = config.display;
  if (!isConfigRecord(display)) return null;
  return typeof display.skin === "string" ? display.skin : null;
}

export function hermesConfigUsesManagedLightSkin(config: ConfigObject): boolean {
  return hermesConfigDisplaySkin(config) === NEMOCLAW_HERMES_LIGHT_SKIN_NAME;
}

export function removeHermesLightSkinConfig(config: ConfigObject): boolean {
  const display = config.display;
  if (!isConfigRecord(display) || display.skin !== NEMOCLAW_HERMES_LIGHT_SKIN_NAME) {
    return false;
  }
  delete display.skin;
  if (Object.keys(display).length === 0) delete config.display;
  return true;
}

export function hostTerminalLooksLight(env: NodeJS.ProcessEnv): boolean {
  const colorfgbg = String(env.COLORFGBG ?? "").trim();
  if (!colorfgbg) return false;

  const lastField = colorfgbg.split(";").at(-1) ?? "";
  const bg = Number(lastField);
  if (!Number.isInteger(bg) || bg < 0 || bg > 15) return false;
  return bg === 7 || bg === 15;
}

export function shouldInspectHermesLightSkinConfig(
  agent: { name?: string } | null | undefined,
  env: NodeJS.ProcessEnv,
): boolean {
  return (
    agent?.name === "hermes" &&
    !hasEnvValue(env.HERMES_TUI_LIGHT) &&
    !hasEnvValue(env.HERMES_TUI_THEME)
  );
}

export function shouldRemoveHermesLightSkin(
  agent: { name?: string } | null | undefined,
  env: NodeJS.ProcessEnv,
  config: ConfigObject,
): boolean {
  return (
    shouldInspectHermesLightSkinConfig(agent, env) &&
    !hostTerminalLooksLight(env) &&
    hermesConfigUsesManagedLightSkin(config)
  );
}
