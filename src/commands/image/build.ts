// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { runImageBuildAction } from "../../lib/actions/image/build";
import { NemoClawCommand } from "../../lib/cli/nemoclaw-oclif-command";
import {
  buildImageBuildFlags,
  imageBuildExamples,
  type ImageBuildFlags,
} from "../../lib/image/command-support";

export default class ImageBuildCommand extends NemoClawCommand {
  static id = "image:build";
  static strict = true;
  static summary = "Build and optionally push an agent runtime image";
  static description =
    "Stage an agent's runtime image build context, apply minimal image-only Dockerfile patching, run a local docker build, optionally push the resulting image, and emit stable JSON metadata for downstream consumers.";
  static usage = [
    "image build --tag <ref> [--agent <openclaw|hermes>] [--push] [--base-image <ref>] [--json]",
  ];
  static examples = imageBuildExamples;
  static flags = buildImageBuildFlags();

  public async run(): Promise<void> {
    const { flags } = await this.parse(ImageBuildCommand);
    const result = await runImageBuildAction({
      agent: flags.agent as ImageBuildFlags["agent"],
      tag: flags.tag as ImageBuildFlags["tag"],
      push: flags.push as ImageBuildFlags["push"],
      "base-image": flags["base-image"] as ImageBuildFlags["base-image"],
      json: flags.json as ImageBuildFlags["json"],
      quiet: flags.quiet as ImageBuildFlags["quiet"],
    } satisfies ImageBuildFlags);
    if (flags.json) {
      this.log(JSON.stringify(result, null, 2));
    }
  }
}
