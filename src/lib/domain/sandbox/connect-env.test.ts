// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
  hermesConfigUsesManagedLightSkin,
  NEMOCLAW_HERMES_LIGHT_SKIN_NAME,
  removeHermesLightSkinConfig,
  shouldInspectHermesLightSkinConfig,
  shouldRemoveHermesLightSkin,
} from "./connect-env";

describe("sandbox connect environment helpers", () => {
  it("inspects Hermes config only when NemoClaw owns the theme decision (#6380)", () => {
    expect(
      shouldInspectHermesLightSkinConfig(
        { name: "hermes" },
        { COLORFGBG: "0;15", TERM_PROGRAM: "Apple_Terminal" },
      ),
    ).toBe(true);
    expect(
      shouldInspectHermesLightSkinConfig(
        { name: "hermes" },
        { COLORFGBG: "0;0", TERM_PROGRAM: "Apple_Terminal" },
      ),
    ).toBe(true);
    for (const env of [{ HERMES_TUI_LIGHT: "0" }, { HERMES_TUI_THEME: "dark" }]) {
      expect(
        shouldInspectHermesLightSkinConfig({ name: "hermes" }, { COLORFGBG: "0;15", ...env }),
      ).toBe(false);
    }
    expect(shouldInspectHermesLightSkinConfig({ name: "openclaw" }, { COLORFGBG: "0;15" })).toBe(
      false,
    );
  });

  it("treats missing or unusable COLORFGBG as not-light and cleans up the managed skin (#6380)", () => {
    const config = {
      display: { skin: NEMOCLAW_HERMES_LIGHT_SKIN_NAME },
      model: "test",
    };
    expect(
      shouldRemoveHermesLightSkin(
        { name: "hermes" },
        { TERM_PROGRAM: "Apple_Terminal" },
        config,
      ),
    ).toBe(true);
    expect(
      shouldRemoveHermesLightSkin(
        { name: "hermes" },
        { COLORFGBG: "not-a-color", TERM_PROGRAM: "Apple_Terminal" },
        config,
      ),
    ).toBe(true);
  });

  it("removes only the NemoClaw-managed Hermes light skin from config (#6380)", () => {
    const config = {
      display: { skin: NEMOCLAW_HERMES_LIGHT_SKIN_NAME, width: 100 },
      model: "test",
    };

    expect(shouldRemoveHermesLightSkin({ name: "hermes" }, { COLORFGBG: "0;0" }, config)).toBe(
      true,
    );
    expect(removeHermesLightSkinConfig(config)).toBe(true);
    expect(config).toEqual({ display: { width: 100 }, model: "test" });
  });

  it("removes the empty display section when it only contains the managed Hermes skin (#6380)", () => {
    const config = {
      display: { skin: NEMOCLAW_HERMES_LIGHT_SKIN_NAME },
      model: "test",
    };

    expect(removeHermesLightSkinConfig(config)).toBe(true);
    expect(config).toEqual({ model: "test" });
  });

  it("keeps the managed skin on light terminals for sandboxes still on older images (#6380)", () => {
    const config = {
      display: { skin: NEMOCLAW_HERMES_LIGHT_SKIN_NAME },
      model: "test",
    };

    expect(shouldRemoveHermesLightSkin({ name: "hermes" }, { COLORFGBG: "0;15" }, config)).toBe(
      false,
    );
    expect(hermesConfigUsesManagedLightSkin(config)).toBe(true);
  });

  it("preserves user-owned Hermes display skins (#6380)", () => {
    const userConfig = { display: { skin: "solarized-light" } };
    expect(shouldRemoveHermesLightSkin({ name: "hermes" }, { COLORFGBG: "0;0" }, userConfig)).toBe(
      false,
    );
    expect(removeHermesLightSkinConfig(userConfig)).toBe(false);
    expect(userConfig.display.skin).toBe("solarized-light");
  });
});
