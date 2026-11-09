// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import type { SandboxMessagingInputReference } from "../../manifest";
import { resolveTelegramTemplateReference } from "./template-resolver";

describe("Telegram template resolver", () => {
  it.each([
    ["open", { "*": { requireMention: true } }],
    ["allowlist", undefined],
    ["disabled", undefined],
  ] as const)("resolves OpenClaw group policy %s", (groupPolicy, expectedGroups) => {
    const inputs: SandboxMessagingInputReference[] = [
      {
        channelId: "telegram",
        inputId: "requireMention",
        kind: "config",
        required: false,
        statePath: "telegramConfig.requireMention",
        value: "1",
      },
      {
        channelId: "telegram",
        inputId: "groupPolicy",
        kind: "config",
        required: false,
        statePath: "telegramConfig.groupPolicy",
        value: groupPolicy,
      },
    ];

    expect(resolveTelegramTemplateReference("telegramConfig.groupPolicy", { inputs })?.value).toBe(
      groupPolicy,
    );
    expect(
      resolveTelegramTemplateReference("telegramConfig.openclawGroups", { inputs })?.value,
    ).toEqual(expectedGroups);
  });

  it.each([
    ["0.0.x default", {}, "http://10.200.0.1:3128"],
    [
      "0.0.x operator proxy",
      { NEMOCLAW_PROXY_HOST: "proxy.corp.example" },
      "http://proxy.corp.example:3128",
    ],
    [
      "0.1.x with the baked 0.0.x address",
      { NEMOCLAW_OPENSHELL_LINE: "0.1", NEMOCLAW_PROXY_HOST: "10.200.0.1" },
      undefined,
    ],
    ["0.1.x without a proxy host", { NEMOCLAW_OPENSHELL_LINE: "0.1" }, undefined],
    [
      "0.1.x operator proxy",
      {
        NEMOCLAW_OPENSHELL_LINE: "0.1",
        NEMOCLAW_PROXY_HOST: "proxy.corp.example",
        NEMOCLAW_PROXY_PORT: "8080",
      },
      "http://proxy.corp.example:8080",
    ],
  ] as const)("resolves the account proxy for %s (NemoClaw#33)", (_case, env, expected) => {
    expect(resolveTelegramTemplateReference("proxyUrl", { inputs: [], env })?.value).toBe(expected);
  });
});
