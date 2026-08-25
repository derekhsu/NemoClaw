// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";

export const HERMES_SANDBOX_BASE_IMAGE = "ghcr.io/nvidia/nemoclaw/hermes-sandbox-base";

// Matches the official Hermes base repository for both Dockerfile manifest-list
// pins and Docker-normalized platform manifest digests.
const HERMES_OFFICIAL_BASE_DIGEST_REF =
  /^ghcr\.io\/nvidia\/nemoclaw\/hermes-sandbox-base@sha256:[0-9a-f]{64}$/u;

export function isOfficialHermesBaseImageRef(imageRef: string): boolean {
  return HERMES_OFFICIAL_BASE_DIGEST_REF.test(imageRef);
}

export function readHermesPinnedBaseImageRef(finalDockerfilePath: string): string {
  let dockerfile: string;
  try {
    dockerfile = fs.readFileSync(finalDockerfilePath, "utf8");
  } catch (error) {
    throw new Error(`Failed to read Hermes final Dockerfile: ${finalDockerfilePath}`, {
      cause: error,
    });
  }
  const declarations = [...dockerfile.matchAll(/^ARG BASE_IMAGE=(\S+)$/gmu)].map(
    (match) => match[1],
  );
  const pinnedRef = declarations.length === 1 ? declarations[0] : null;
  if (!pinnedRef || !isOfficialHermesBaseImageRef(pinnedRef)) {
    throw new Error(
      "Hermes final Dockerfile must declare exactly one immutable official sandbox base image",
    );
  }
  return pinnedRef;
}
