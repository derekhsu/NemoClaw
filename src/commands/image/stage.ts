// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { runImageStageAction } from "../../lib/actions/image/stage";
import { NemoClawCommand } from "../../lib/cli/nemoclaw-oclif-command";
import {
  buildImageStageFlags,
  imageStageExamples,
  type ImageStageFlags,
} from "../../lib/image/command-support";

export default class ImageStageCommand extends NemoClawCommand {
  static id = "image:stage";
  static strict = true;
  static summary = "Stage a deterministic agent runtime image build context";
  static description =
    "Resolve an agent's runtime image inputs and write a deterministic Docker build context directory with stable JSON metadata, without running onboarding or sandbox lifecycle logic.";
  static usage = ["image stage --agent <openclaw|hermes> [--output <dir>] [--json]"];
  static examples = imageStageExamples;
  static flags = buildImageStageFlags();

  public async run(): Promise<void> {
    const { flags } = await this.parse(ImageStageCommand);
    const result = await runImageStageAction({
      agent: flags.agent as ImageStageFlags["agent"],
      output: flags.output as ImageStageFlags["output"],
      json: flags.json as ImageStageFlags["json"],
      quiet: flags.quiet as ImageStageFlags["quiet"],
    } satisfies ImageStageFlags);
    if (flags.json) {
      this.log(JSON.stringify(result, null, 2));
    }
  }
}
