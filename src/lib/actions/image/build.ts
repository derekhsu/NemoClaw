// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ImageBuildFlags } from "../../image/command-support";
import type { ImageBuildResult } from "../../image/build";

type ImageBuildModule = {
  runImageBuild: (flags: ImageBuildFlags) => Promise<ImageBuildResult>;
};

export async function runImageBuildAction(flags: ImageBuildFlags): Promise<ImageBuildResult> {
  const { runImageBuild } = require("../../image/build") as ImageBuildModule;
  return runImageBuild(flags);
}
