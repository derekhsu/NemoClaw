// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPackageFixtures,
  createPackageFixture,
  linkManagedReasoningEffort,
  managedPatchRegion,
  MANAGED_STUB_PREAMBLE,
  patchFixture,
  REAL_HELPER_PREAMBLE,
  runPython,
  writeManagedReasoningEffort,
} from "./helpers/langchain-deepagents-code-patch-fixture";

afterEach(cleanupPackageFixtures);

const BASE_OPENAI_KWARGS = `{
    "api_key": "nemoclaw-managed-inference",
    "base_url": "https://inference.local/v1",
    "use_responses_api": False,
}`;
const BASE_OPENROUTER_KWARGS = `{
    "api_key": "nemoclaw-managed-inference",
    "base_url": "https://inference.local/v1",
}`;

function execConfig(root: string, script: string) {
  const region = managedPatchRegion(root, "config.py");
  return runPython(
    root,
    `${MANAGED_STUB_PREAMBLE}
${REAL_HELPER_PREAMBLE}
import os
import types
from typing import Any

config = types.ModuleType("deepagents_code.config")
config.__dict__.update({
    "os": os,
    "Any": Any,
    "_dotenv_loaded_values": {},
})
exec(${JSON.stringify(region)}, config.__dict__)
${script}`,
  );
}

const REJECTED_ASSERTIONS = `
assert _managed.managed_reasoning_effort() is None
assert "extra_body" not in config._get_provider_kwargs("openai")
print("managed-reasoning-effort-rejected-ok")
`;

describe("LangChain Deep Agents Code managed reasoning effort", () => {
  it.each([
    "low",
    "medium",
    "high",
  ])("supplies the configured reasoning effort from the managed provider resolver: %s (#7938)", (effort) => {
    const tempDir = createPackageFixture();
    patchFixture(tempDir);
    writeManagedReasoningEffort(tempDir, `${effort}\n`);

    const result = execConfig(
      tempDir,
      `
assert _managed.managed_reasoning_effort() == "${effort}"
assert config._get_provider_kwargs("openai") == {
    **${BASE_OPENAI_KWARGS},
    "extra_body": {"reasoning_effort": "${effort}"},
}
assert config._get_provider_kwargs("openrouter") == ${BASE_OPENROUTER_KWARGS}
print("managed-reasoning-effort-ok")
`,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("managed-reasoning-effort-ok");
  });

  it("keeps the endpoint default when onboarding recorded no reasoning effort (#7938)", () => {
    const tempDir = createPackageFixture();
    patchFixture(tempDir);
    writeManagedReasoningEffort(tempDir, "\n");

    const result = execConfig(
      tempDir,
      `
assert _managed.managed_reasoning_effort() is None
assert config._get_provider_kwargs("openai") == ${BASE_OPENAI_KWARGS}
print("managed-reasoning-effort-unset-ok")
`,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("managed-reasoning-effort-unset-ok");
  });

  it("composes the Ultra template argument with managed reasoning effort (#7441)", () => {
    const tempDir = createPackageFixture();
    patchFixture(tempDir);
    writeManagedReasoningEffort(tempDir, "high\n");

    const result = execConfig(
      tempDir,
      `
assert config._get_provider_kwargs(
    "openai",
    model_name="nvidia/nemotron-3-ultra-550b-a55b",
) == {
    **${BASE_OPENAI_KWARGS},
    "extra_body": {
        "reasoning_effort": "high",
        "chat_template_kwargs": {"force_nonempty_content": True},
    },
}
assert config._get_provider_kwargs(
    "openrouter",
    model_name="nvidia/nemotron-3-ultra-550b-a55b",
) == ${BASE_OPENROUTER_KWARGS}
print("managed-ultra-reasoning-effort-ok")
`,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("managed-ultra-reasoning-effort-ok");
  });

  it("falls back to the endpoint default for a missing capability file (#7938)", () => {
    const tempDir = createPackageFixture();
    patchFixture(tempDir);

    const result = execConfig(tempDir, REJECTED_ASSERTIONS);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("managed-reasoning-effort-rejected-ok");
  });

  it.each([
    ["unrecognized contents", "extreme\n", 0o444],
    ["a writable capability file", "high\n", 0o644],
    ["contents without the trailing newline", "high", 0o444],
  ])("falls back to the endpoint default for %s (#7938)", (_case, contents, mode) => {
    const tempDir = createPackageFixture();
    patchFixture(tempDir);
    writeManagedReasoningEffort(tempDir, contents, mode);

    const result = execConfig(tempDir, REJECTED_ASSERTIONS);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("managed-reasoning-effort-rejected-ok");
  });

  it("rejects a symbolic-link capability path (#7938)", () => {
    const tempDir = createPackageFixture();
    patchFixture(tempDir);
    linkManagedReasoningEffort(tempDir, "high\n");

    const result = execConfig(tempDir, REJECTED_ASSERTIONS);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("managed-reasoning-effort-rejected-ok");
  });

  it("returns a fresh contract per call so one caller cannot poison the next (#7938)", () => {
    const tempDir = createPackageFixture();
    patchFixture(tempDir);
    writeManagedReasoningEffort(tempDir, "high\n");

    const result = execConfig(
      tempDir,
      `
tampered = config._get_provider_kwargs("openai")
tampered["api_key"] = "tampered"
tampered["extra_body"]["reasoning_effort"] = "low"
assert config._get_provider_kwargs("openai") == {
    **${BASE_OPENAI_KWARGS},
    "extra_body": {"reasoning_effort": "high"},
}
print("managed-reasoning-effort-isolated-ok")
`,
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("managed-reasoning-effort-isolated-ok");
  });
});
