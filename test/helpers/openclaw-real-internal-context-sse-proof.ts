// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { type AssistantData, probe } from "./openclaw-native-sse-probe.ts";

/** Exercise the installed native SSE branch with deterministic assistant events. */
export async function runRealOpenClawInternalContextSseProof(dist: string): Promise<void> {
  const privateText =
    "<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\nprivate proof data\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>\n";
  const raw = "Before\n\n" + privateText + "VISIBLE";
  const events: AssistantData[] = Array.from(raw, (_char, index) => ({
    text: raw.slice(0, index + 1),
    delta: raw[index],
  }));
  events.push({ text: "Before\n\nVISIBLE", delta: "", replace: true });
  const frames = await probe(dist, events, { payloads: [{ text: "Before\n\nVISIBLE" }], meta: {} });
  const data = frames.filter((frame) => typeof frame !== "string");
  assert.equal(
    data
      .flatMap((frame) => frame.choices?.map((choice) => choice.delta.content ?? "") ?? [])
      .join(""),
    "Before\n\nVISIBLE",
  );
  assert.equal(
    data.some((frame) => frame.error),
    false,
  );
  assert.equal(frames.at(-1), "DONE");
}
