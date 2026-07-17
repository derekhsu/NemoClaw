// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

export type ImageOnlyDockerfilePatchOptions = {
  baseImageRef: string | null;
  buildId: string | null;
};

export function applyImageOnlyDockerfilePatch(
  dockerfile: string,
  options: ImageOnlyDockerfilePatchOptions,
): string {
  let output = dockerfile;
  if (options.baseImageRef) {
    output = output.replace(/^ARG BASE_IMAGE=.*$/m, `ARG BASE_IMAGE=${options.baseImageRef}`);
  }
  if (options.buildId) {
    output = output.replace(
      /^ARG NEMOCLAW_BUILD_ID=.*$/m,
      `ARG NEMOCLAW_BUILD_ID=${options.buildId}`,
    );
  }
  return output;
}
