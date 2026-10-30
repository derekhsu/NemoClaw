// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const PATCHER = path.join(ROOT, "agents", "hermes", "patch-neutral-platform-env-activation.py");

// Hermes v0.21.3 keeps an explicitly disabled platform disabled, but its
// table-driven credential steps still copy ambient credentials into the
// platform object before scrubbing the explicit-disable marker.
const UPSTREAM_CONFIG_ENV = `def _apply_env_overrides(config) -> None:
    import os

    token = os.getenv("CHANNEL_TOKEN")
    if token:
        for platform_config in config.platforms.values():
            if not platform_config.extra.get("_enabled_explicit", False):
                platform_config.enabled = True
            platform_config.token = token
            platform_config.extra["credential"] = token

    for platform_config in config.platforms.values():
        platform_config.extra.pop("_enabled_explicit", None)
`;

const UPSTREAM_CONFIG = `import json
import os
from dataclasses import dataclass, field


@dataclass
class PlatformConfig:
    enabled: bool = False
    token: str | None = None
    extra: dict = field(default_factory=dict)


@dataclass
class GatewayConfig:
    platforms: dict = field(default_factory=dict)


def _apply_env_overrides(config: GatewayConfig) -> None:
    """Apply environment variable overrides to config (see \`\`gateway.config_env\`\`)."""
    from gateway.config_env import _apply_env_overrides as _impl
    _impl(config)


def main() -> None:
    disabled = PlatformConfig(extra={"_enabled_explicit": True})
    enabled = PlatformConfig(enabled=True, extra={"selected": True})
    config = GatewayConfig(platforms={"disabled": disabled, "enabled": enabled})
    _apply_env_overrides(config)
    print(json.dumps({
        name: {
            "enabled": platform.enabled,
            "token": platform.token,
            "extra": platform.extra,
        }
        for name, platform in config.platforms.items()
    }, sort_keys=True))
`;

function createFixture(config = UPSTREAM_CONFIG) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-hermes-inert-env-"));
  const gatewayDir = path.join(temporaryRoot, "gateway");
  fs.mkdirSync(gatewayDir);
  fs.writeFileSync(path.join(gatewayDir, "__init__.py"), "");
  fs.writeFileSync(path.join(gatewayDir, "config_env.py"), UPSTREAM_CONFIG_ENV);
  const configPath = path.join(gatewayDir, "config.py");
  fs.writeFileSync(configPath, config);
  return { configPath, temporaryRoot };
}

function runPatcher(configPath: string) {
  return spawnSync("python3", ["-I", PATCHER, configPath], {
    encoding: "utf8",
    timeout: 5000,
  });
}

function probe(temporaryRoot: string, capabilityUnion: string) {
  return spawnSync("python3", ["-c", "import gateway.config as config; config.main()"], {
    cwd: temporaryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CHANNEL_TOKEN: "hostile-ambient-credential",
      NEMOCLAW_MANAGED_IMAGE_CAPABILITY_UNION: capabilityUnion,
      PYTHONDONTWRITEBYTECODE: "1",
    },
    timeout: 5000,
  });
}

describe("Hermes neutral platform environment activation guard", () => {
  it("preserves explicit disables while leaving validated enabled platforms active", () => {
    const { configPath, temporaryRoot } = createFixture();
    try {
      const result = runPatcher(configPath);
      expect(result.status, result.stderr).toBe(0);
      const patched = fs.readFileSync(configPath, "utf8");
      const second = runPatcher(configPath);
      expect(second.status, second.stderr).toBe(0);
      expect(fs.readFileSync(configPath, "utf8")).toBe(patched);

      const legacyProbe = probe(temporaryRoot, "0");
      expect(legacyProbe.status, legacyProbe.stderr).toBe(0);
      expect(JSON.parse(legacyProbe.stdout).disabled).toEqual({
        enabled: false,
        extra: { credential: "hostile-ambient-credential" },
        token: "hostile-ambient-credential",
      });

      const neutralProbe = probe(temporaryRoot, "1");
      expect(neutralProbe.status, neutralProbe.stderr).toBe(0);
      expect(JSON.parse(neutralProbe.stdout)).toEqual({
        disabled: { enabled: false, extra: {}, token: null },
        enabled: {
          enabled: true,
          extra: { credential: "hostile-ambient-credential", selected: true },
          token: "hostile-ambient-credential",
        },
      });
    } finally {
      fs.rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it("fails closed without modifying the source when the pinned delegate shape drifts", () => {
    const drifted = UPSTREAM_CONFIG.replace(
      "    _impl(config)\n",
      "    _impl(config, strict=True)\n",
    );
    const { configPath, temporaryRoot } = createFixture(drifted);
    try {
      const result = runPatcher(configPath);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("neutral platform environment source shape changed");
      expect(fs.readFileSync(configPath, "utf8")).toBe(drifted);
    } finally {
      fs.rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });
});
