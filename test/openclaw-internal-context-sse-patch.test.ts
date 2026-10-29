// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { patchOpenClawInternalContextSse } from "../scripts/lib/patch-openclaw-internal-context-sse.mts";
import {
  type AssistantData,
  type NativeFrames,
  probe,
  type SseFrame,
} from "./helpers/openclaw-native-sse-probe";
import { cleanupRuntimes, createRuntime as runtime } from "./helpers/openclaw-sse-patch-runtime";

afterEach(cleanupRuntimes);
const internal =
  "<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>\nprivate\n<<<END_OPENCLAW_INTERNAL_CONTEXT>>>\n";
function dataFrames(frames: NativeFrames): SseFrame[] {
  return frames.filter((frame): frame is SseFrame => typeof frame !== "string");
}
function content(frames: NativeFrames) {
  return dataFrames(frames)
    .flatMap((frame) => frame?.choices?.map((choice) => choice.delta?.content ?? "") ?? [])
    .join("");
}
describe("native OpenClaw SSE internal context", () => {
  it("withholds internal context before a sanitized replacement (#9)", async () => {
    const frames = await probe(runtime(), [
      { text: internal + "VISIBLE", delta: internal + "VISIBLE" },
      { text: "VISIBLE", delta: "", replace: true },
    ]);
    expect(content(frames)).toBe("VISIBLE");
    expect(dataFrames(frames).some((frame) => frame.error)).toBe(false);
    expect(frames.at(-1)).toBe("DONE");
  });
  it("withholds split delimiters after visible text (#9)", async () => {
    const raw = "Before\n\n" + internal + "VISIBLE";
    const updates: AssistantData[] = Array.from(raw, (_, index) => ({
      text: raw.slice(0, index + 1),
      delta: raw[index],
    }));
    updates.push({ text: "Before\n\nVISIBLE", delta: "", replace: true });
    const frames = await probe(runtime(), updates, {
      payloads: [{ text: "Before\n\nVISIBLE" }],
      meta: {},
    });
    expect(content(frames)).toBe("Before\n\nVISIBLE");
    expect(dataFrames(frames).some((frame) => frame.error)).toBe(false);
  });
  it.each([
    "Ordinary answer.",
    "Before\n\n<",
    "literal <<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>> mention",
    "Answer with trailing whitespace. \n",
  ])("preserves ordinary text and releases an unfinished literal: %s (#9)", async (text) => {
    const updates = Array.from(text, (_, index) => ({
      text: text.slice(0, index + 1),
      delta: text[index],
    }));
    const frames = await probe(runtime(), updates, { payloads: [{ text }], meta: {} });
    expect(content(frames)).toBe(text);
    expect(dataFrames(frames).some((frame) => frame.error)).toBe(false);
  });
  it("streams ordinary deltas before the agent result resolves (#9)", async () => {
    const observed: string[] = [];
    const frames = await probe(
      runtime(),
      [
        { text: "Hello", delta: "Hello" },
        { text: "Hello world", delta: " world" },
      ],
      { payloads: [{ text: "Hello world" }], meta: {} },
      { afterEvent: (wire: string) => observed.push(wire) },
    );
    expect(observed[0]).toContain('"content":"Hello"');
    expect(observed[0]).not.toContain("[DONE]");
    expect(content(frames)).toBe("Hello world");
  });
  it("holds CRLF delimiters split after the carriage return (#9)", async () => {
    const raw = internal.replaceAll("\n", "\r\n") + "VISIBLE";
    const updates: AssistantData[] = Array.from(raw, (_char, index) => ({
      text: raw.slice(0, index + 1),
      delta: raw[index],
    }));
    updates.push({ text: "VISIBLE", delta: "", replace: true });
    const frames = await probe(runtime(), updates);
    expect(content(frames)).toBe("VISIBLE");
    expect(dataFrames(frames).some((frame) => frame.error)).toBe(false);
  });
  it("preserves buffered ordinary whitespace at an item boundary (#9)", async () => {
    const frames = await probe(
      runtime(),
      [
        { itemId: "a", text: "Hello ", delta: "Hello " },
        { itemId: "b", text: "world", delta: "world" },
      ],
      { payloads: [{ text: "Hello world" }], meta: {} },
    );
    expect(content(frames)).toBe("Hello world");
    expect(dataFrames(frames).some((frame) => frame.error)).toBe(false);
  });
  it("preserves delta-only text across assistant items (#9)", async () => {
    const frames = await probe(
      runtime(),
      [
        { itemId: "a", delta: "Hello " },
        { itemId: "b", delta: "world" },
      ],
      { payloads: [{ text: "Hello world" }], meta: {} },
    );
    expect(content(frames)).toBe("Hello world");
    expect(dataFrames(frames).some((frame) => frame.error)).toBe(false);
  });
  it("preserves deferred whitespace before an unkeyed additive snapshot (#9)", async () => {
    const frames = await probe(
      runtime(),
      [
        { text: "Hello ", delta: "Hello " },
        { text: "world", delta: "world" },
      ],
      { payloads: [{ text: "Hello world" }], meta: {} },
    );
    expect(content(frames)).toBe("Hello world");
    expect(dataFrames(frames).some((frame) => frame.error)).toBe(false);
  });
  it("preserves an unrelated non-prefix replacement error (#9)", async () => {
    const frames = await probe(
      runtime(),
      [
        { text: "Original", delta: "Original" },
        { text: "Changed", delta: "", replace: true },
      ],
      { payloads: [{ text: "Changed" }], meta: {} },
    );
    expect(content(frames)).toBe("Original");
    expect(dataFrames(frames).find((frame) => frame.error)?.error?.message).toBe(
      "Assistant output cannot be represented as an append-only response stream.",
    );
  });
  it("preserves lifecycle errors after visible output (#9)", async () => {
    const frames = await probe(
      runtime(),
      [
        { text: "Answer", delta: "Answer" },
        { stream: "lifecycle", data: { phase: "error", error: "provider failed" } },
      ],
      { payloads: [{ text: "Answer" }], meta: {} },
    );
    expect(content(frames)).toBe("Answer");
    expect(dataFrames(frames).find((frame) => frame.error)?.error?.message).toBe("provider failed");
  });
  it("preserves client tool names, arguments, and finish reason (#9)", async () => {
    const frames = await probe(
      runtime(),
      [{ text: internal + "Calling tool", delta: internal + "Calling tool" }],
      {
        payloads: [{ text: "Calling tool" }],
        meta: {
          stopReason: "tool_calls",
          pendingToolCalls: [{ id: "call1", name: "lookup", arguments: '{"query":"x"}' }],
        },
      },
    );
    const calls = dataFrames(frames).flatMap(
      (frame) => frame?.choices?.flatMap((choice) => choice.delta?.tool_calls ?? []) ?? [],
    );
    expect(calls[0]).toMatchObject({ id: "call1", function: { name: "lookup" } });
    expect(calls.map((call) => call.function.arguments).join("")).toBe('{"query":"x"}');
    expect(dataFrames(frames).at(-1)?.choices?.[0].finish_reason).toBe("tool_calls");
    expect(content(frames)).toBe("Calling tool");
  });
  it("buffers replaceable snapshots until the canonical final answer (#9)", async () => {
    const frames = await probe(
      runtime(),
      [
        { text: internal + "Draft", delta: internal + "Draft", replaceable: true },
        { text: "VISIBLE", delta: "", replace: true },
      ],
      { payloads: [{ text: "VISIBLE" }], meta: {} },
    );
    expect(content(frames)).toBe("VISIBLE");
    expect(dataFrames(frames).some((frame) => frame.error)).toBe(false);
  });
});
describe("OpenClaw SSE patch integrity", () => {
  it("applies once and audits the complete patch (#9)", () => {
    const dist = runtime(false);
    expect(() => patchOpenClawInternalContextSse(dist, true)).toThrow(/not applied/);
    expect(patchOpenClawInternalContextSse(dist)).toBe("patched");
    expect(patchOpenClawInternalContextSse(dist, true)).toBe("already-patched");
    expect(patchOpenClawInternalContextSse(dist)).toBe("already-patched");
  });
  it.each([
    "openai-http-BuR2TEnw.js",
    "internal-runtime-context-UgZVJlox.js",
    "regexp-BZyMFTlj.js",
  ])("rejects drift in %s before mutation (#9)", (name) => {
    const dist = runtime(false);
    const target = path.join(dist, "openai-http-BuR2TEnw.js");
    fs.appendFileSync(path.join(dist, name), "\n// drift");
    const original = fs.readFileSync(target, "utf8");
    expect(() => patchOpenClawInternalContextSse(dist)).toThrow(/differs/);
    expect(fs.readFileSync(target, "utf8")).toBe(original);
  });
  it("rejects a partially edited applied patch (#9)", () => {
    const dist = runtime();
    const target = path.join(dist, "openai-http-BuR2TEnw.js");
    fs.writeFileSync(
      target,
      fs.readFileSync(target, "utf8").replace("cleaned.trimEnd()", "cleaned.trim()"),
    );
    expect(() => patchOpenClawInternalContextSse(dist)).toThrow(/differs|partial/);
  });
  it("rejects an unreviewed runtime version (#9)", () => {
    const dist = runtime(false);
    fs.writeFileSync(path.join(dist, "..", "package.json"), '{"version":"2026.10.8"}');
    expect(() => patchOpenClawInternalContextSse(dist)).toThrow(/not reviewed/);
  });
  it("rejects duplicate HTTP handler targets (#9)", () => {
    const dist = runtime(false);
    fs.copyFileSync(
      path.join(dist, "openai-http-BuR2TEnw.js"),
      path.join(dist, "openai-http-duplicate.js"),
    );
    expect(() => patchOpenClawInternalContextSse(dist)).toThrow(/one reviewed/);
  });
});
