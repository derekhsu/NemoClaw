// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  HERMES_SANDBOX_BASE_IMAGE,
  isOfficialHermesBaseImageRef,
  readHermesPinnedBaseImageRef,
} from "./hermes-base-image-pin";

const roots: string[] = [];
const digest = `sha256:${"1".repeat(64)}`;
const pinnedRef = `${HERMES_SANDBOX_BASE_IMAGE}@${digest}`;

function writeDockerfile(source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-hermes-pin-"));
  roots.push(root);
  const dockerfile = path.join(root, "Dockerfile");
  fs.writeFileSync(dockerfile, source);
  return dockerfile;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

describe("Hermes base image pin", () => {
  it("reads one immutable official base image reference", () => {
    const dockerfile = writeDockerfile(`ARG BASE_IMAGE=${pinnedRef}\nFROM \${BASE_IMAGE}\n`);

    expect(readHermesPinnedBaseImageRef(dockerfile)).toBe(pinnedRef);
    expect(isOfficialHermesBaseImageRef(pinnedRef)).toBe(true);
  });

  it.each([
    ["missing", "FROM scratch\n"],
    ["duplicate", `ARG BASE_IMAGE=${pinnedRef}\nARG BASE_IMAGE=${pinnedRef}\n`],
    ["mutable", `ARG BASE_IMAGE=${HERMES_SANDBOX_BASE_IMAGE}:latest\n`],
    ["foreign", `ARG BASE_IMAGE=ghcr.io/example/hermes-base@${digest}\n`],
    ["malformed", `ARG BASE_IMAGE=${HERMES_SANDBOX_BASE_IMAGE}@sha256:abc\n`],
  ])("rejects a %s Hermes base image declaration", (_case, source) => {
    expect(() => readHermesPinnedBaseImageRef(writeDockerfile(source))).toThrow(
      "Hermes final Dockerfile must declare exactly one immutable official sandbox base image",
    );
  });

  it("reports an unreadable Hermes final Dockerfile", () => {
    expect(() => readHermesPinnedBaseImageRef("/missing/hermes/Dockerfile")).toThrow(
      "Failed to read Hermes final Dockerfile",
    );
  });
});
