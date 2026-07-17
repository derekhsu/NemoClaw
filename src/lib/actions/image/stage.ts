// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import type { ImageStageFlags } from "../../image/command-support";
import type { StageImageBuildContextResult } from "../../image/stage";

type ImageStageModule = {
  runImageStage: (flags: ImageStageFlags) => Promise<StageImageBuildContextResult>;
};

export async function runImageStageAction(
  flags: ImageStageFlags,
): Promise<StageImageBuildContextResult> {
  const { runImageStage } = require("../../image/stage") as ImageStageModule;
  return runImageStage(flags);
}
