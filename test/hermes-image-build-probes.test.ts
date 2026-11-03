// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.join(import.meta.dirname, "..");
const dockerfile = fs.readFileSync(path.join(root, "agents", "hermes", "Dockerfile"), "utf8");
const probes = path.join(root, "agents", "hermes", "image-build-probes.py");
const imageProbePath = "/opt/nemoclaw-hermes-config/image-build-probes.py";
const commands = [
  "cron-backup",
  "cron-create",
  "cron-reopen",
  "cron-runtime-source",
  "dashboard-policy",
  "discord-backup",
  "discord-create",
  "discord-recovery-source",
  "discord-reopen",
  "gateway-process-identity",
  "gateway-runtime-metadata",
  "guard-without-dac-override",
  "langfuse-credentials",
  "neutral-platform-inertness",
  "profile-policy",
  "session-preview",
] as const;

describe("Hermes image build probes", () => {
  it("uses a checked-in probe runner instead of builder-dependent heredocs (#7981)", () => {
    expect(dockerfile).not.toMatch(/<<-?\s*['"]?[A-Za-z_][A-Za-z0-9_]*['"]?/u);
    expect(dockerfile).toContain(`COPY agents/hermes/image-build-probes.py ${imageProbePath}`);
    const normalizedDockerfile = dockerfile.replace(/\\\n/gu, "").replace(/\s+/gu, " ");

    for (const command of commands) {
      expect(normalizedDockerfile).toContain(`${imageProbePath} ${command}`);
    }

    const removal = dockerfile.indexOf(`rm -f ${imageProbePath}`);
    expect(dockerfile.lastIndexOf(`rm -f ${imageProbePath}`)).toBe(removal);
    expect(removal).toBeGreaterThan(dockerfile.indexOf(`${imageProbePath} discord-reopen`));
    expect(removal).toBeGreaterThan(
      dockerfile.indexOf(`${imageProbePath} guard-without-dac-override`),
    );
    expect(dockerfile.indexOf(`check_absent ${imageProbePath}`)).toBeGreaterThan(removal);
  });

  it("proves the root guard without CAP_DAC_OVERRIDE and CAP_FSETID after pre-creating the api chain (#21)", () => {
    const normalizedDockerfile = dockerfile.replace(/\\\n/gu, "").replace(/\s+/gu, " ");
    const chain =
      "RUN install -d -o root -g root -m 0711 /sandbox/.hermes-api /sandbox/.hermes-api/profiles";
    const probe =
      "RUN /usr/bin/setpriv --bounding-set -dac_override,-fsetid -- /opt/hermes/.venv/bin/python -I " +
      `${imageProbePath} guard-without-dac-override`;
    expect(normalizedDockerfile).toContain(chain);
    expect(normalizedDockerfile).toContain(probe);
    // The probe needs the final /sandbox layout, the root-owned anchor parent,
    // and the pre-created chain; the metadata gate then proves it left no seal.
    const probeAt = normalizedDockerfile.indexOf(probe);
    expect(probeAt).toBeGreaterThan(normalizedDockerfile.indexOf(chain));
    expect(probeAt).toBeGreaterThan(
      normalizedDockerfile.indexOf("RUN chown root:root /sandbox/.nemoclaw"),
    );
    expect(probeAt).toBeGreaterThan(
      normalizedDockerfile.indexOf(
        "cp /etc/nemoclaw/hermes.config-hash /sandbox/.hermes/.config-hash",
      ),
    );
    const gate = normalizedDockerfile.indexOf("RUN check_metadata()");
    expect(gate).toBeGreaterThan(probeAt);
    for (const check of [
      "check_metadata /sandbox/.hermes-api 'root:root 711'",
      "check_metadata /sandbox/.hermes-api/profiles 'root:root 711'",
      "check_absent /sandbox/.hermes-api/profiles/api",
      "check_absent /sandbox/.nemoclaw/hermes-api.config-hash",
      "check_absent /sandbox/.nemoclaw/hermes-api-profile.json",
    ]) {
      expect(normalizedDockerfile.indexOf(check, gate)).toBeGreaterThan(gate);
    }
  });

  it("lists every Dockerfile probe command in the runner usage", () => {
    const result = spawnSync("python3", ["-I", probes], {
      encoding: "utf8",
      timeout: 5000,
    });

    expect(result.status).toBe(1);
    for (const command of commands) {
      expect(result.stderr).toContain(command);
    }
  });
});
