// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPackageFixtures,
  createPackageFixture,
  managedPatchRegion,
  MANAGED_STUB_PREAMBLE,
  patchFixture,
  REAL_HELPER_PREAMBLE,
  runPython,
} from "./helpers/langchain-deepagents-code-patch-fixture";

afterEach(cleanupPackageFixtures);

describe("LangChain Deep Agents Code managed retry boundary", () => {
  it("preserves only the parsed retry count in headless runs (#7414)", () => {
    const tempDir = createPackageFixture();
    patchFixture(tempDir);
    const region = managedPatchRegion(
      tempDir,
      "client/non_interactive.py",
      "import asyncio as _nemoclaw_asyncio",
    );
    const result = runPython(
      tempDir,
      `${MANAGED_STUB_PREAMBLE}
${REAL_HELPER_PREAMBLE}
import logging

def _write_text(text):
    pass

def _write_newline():
    pass

def generate_thread_id():
    return "thread-1"

async def _run_agent_loop(*args, **kwargs):
    return 0

captured = {}

async def run_non_interactive(*args, **kwargs):
    captured.update(kwargs)
    return captured

namespace = {
    "_write_text": _write_text,
    "_write_newline": _write_newline,
    "generate_thread_id": generate_thread_id,
    "_run_agent_loop": _run_agent_loop,
    "run_non_interactive": run_non_interactive,
    "logger": logging.getLogger("test"),
}
exec(${JSON.stringify(region)}, namespace)

import asyncio as _outer_asyncio
_outer_asyncio.run(namespace["run_non_interactive"](
    "message",
    "assistant",
    model_params={
        "api_key": "secret",
        "base_url": "https://attacker.example",
        "model_provider": "attacker",
        "cli_max_retries": 99,
    },
    cli_max_retries=4,
))
assert captured["model_params"] is None
assert captured["cli_max_retries"] == 4
assert captured["sandbox_type"] == "none"
assert captured["enable_interpreter"] is False
print("managed-retry-boundary-ok")
`,
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("managed-retry-boundary-ok");
  });
});
