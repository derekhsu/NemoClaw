// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import {
  FIXED_UNDICI_INTEGRITY,
  FIXED_UNDICI_TARBALL,
  FIXED_UNDICI_VERSION,
  REVIEWED_NPM_VERSION,
} from "../scripts/lib/patch-bundled-npm-undici.mts";
import { REVIEWED_NPM_VERSION as UPGRADED_NPM_VERSION } from "../scripts/upgrade-bundled-npm.mts";
import { requireSingleReviewedDockerfileRunCommand } from "./helpers/dockerfile-run-commands";

const repoRoot = path.resolve(import.meta.dirname, "..");
const copyInstruction =
  "COPY scripts/lib/patch-bundled-npm-undici.mts /scripts/lib/patch-bundled-npm-undici.mts";
const npmRootArguments = ["--npm-root", "/usr/local/lib/node_modules/npm"] as const;

function readDockerfile(file: string): string {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

describe("bundled npm undici image remediation contract (#19)", () => {
  it("binds the replacement to the reviewed npm and registry artifact", () => {
    expect(REVIEWED_NPM_VERSION).toBe(UPGRADED_NPM_VERSION);
    expect(REVIEWED_NPM_VERSION).toBe("12.0.2");
    expect(FIXED_UNDICI_VERSION).toBe("6.29.1");
    expect(FIXED_UNDICI_INTEGRITY).toBe(
      "sha512-EvRlUt/QqAEvXdQeRMYUfwOQsfzpDztykrG2owGEE/rBOBoYv9uF39ZzsNDh4lTFHhTr2XOZjKkYgueD12ZmGA==",
    );
    expect(FIXED_UNDICI_TARBALL).toBe("https://registry.npmjs.org/undici/-/undici-6.29.1.tgz");
  });

  it("patches the reviewed npm tree after upgrading it in the OpenClaw base image", () => {
    const source = readDockerfile("Dockerfile.base");
    const copy = source.indexOf(copyInstruction);
    const upgrade = requireSingleReviewedDockerfileRunCommand(
      source,
      "node /scripts/upgrade-bundled-npm.mts",
      npmRootArguments,
    ).commandStart;
    const ipAddressPatch = requireSingleReviewedDockerfileRunCommand(
      source,
      "node /scripts/lib/patch-bundled-npm-ip-address.mts",
      npmRootArguments,
    ).commandStart;
    const undiciPatch = requireSingleReviewedDockerfileRunCommand(
      source,
      "node /scripts/lib/patch-bundled-npm-undici.mts",
      npmRootArguments,
    );

    expect(copy).toBeGreaterThanOrEqual(0);
    expect(upgrade).toBeGreaterThan(copy);
    expect(ipAddressPatch).toBeGreaterThan(upgrade);
    expect(undiciPatch.commandStart).toBeGreaterThan(ipAddressPatch);
  });

  it("reasserts the private package fix in the OpenClaw sandbox image", () => {
    const source = readDockerfile("Dockerfile");
    const copy = source.indexOf(copyInstruction);
    const ipAddressPatch = requireSingleReviewedDockerfileRunCommand(
      source,
      "node --experimental-strip-types /scripts/lib/patch-bundled-npm-ip-address.mts",
      npmRootArguments,
    ).commandStart;
    const undiciPatch = requireSingleReviewedDockerfileRunCommand(
      source,
      "node --experimental-strip-types /scripts/lib/patch-bundled-npm-undici.mts",
      npmRootArguments,
    );

    expect(copy).toBeGreaterThanOrEqual(0);
    expect(ipAddressPatch).toBeGreaterThan(copy);
    expect(undiciPatch.commandStart).toBeGreaterThan(ipAddressPatch);
  });
});
