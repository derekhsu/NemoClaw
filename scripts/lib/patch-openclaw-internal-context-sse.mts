#!/usr/bin/env -S node --experimental-strip-types
// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TARGET = "openai-http-BuR2TEnw.js";
const CONTEXT = "internal-runtime-context-UgZVJlox.js";
const REVIEWED = {
  [TARGET]: "660dd40f04350a6f0c9bdfcb9ffc522ed922ba2c6a2ce1f5b80f6621fff4ad5f",
  [CONTEXT]: "f54b3e91834820d17439579cd51c2c6a6cac374acbf439f2ffa00170fb2f21b1",
  "regexp-BZyMFTlj.js": "35bc25bc6ec71a81fbd9548a563731c410228d746be3daff57b833ab833632c4",
};
const IMPORT = `import { m as stripInternalRuntimeContext } from "./${CONTEXT}";\n`;
const MARKER = "/* nemoclaw: sanitize internal context before append-only SSE */";

// Keep the canonical 2026.9.2 stripper. Only incomplete delimiter lines need
// withholding before it runs; finalization releases ordinary divergent text.
export const STREAM_HELPER = `${MARKER}
function createNemoClawInternalContextStream() {
\tlet raw = "";
\tlet itemRaw = "";
\tlet itemId;
\tlet committedVisible = "";
\tlet visible = "";
\tconst clean = (text, final) => {
\t\tif (!final) {
\t\t\tconst lineStart = text.lastIndexOf("\\n") + 1;
\t\t\tconst tail = text.slice(lineStart).trim();
\t\t\tif (tail && ["<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>", "<<<END_OPENCLAW_INTERNAL_CONTEXT>>>"].some((marker) => tail.length < marker.length && marker.startsWith(tail))) text = text.slice(0, lineStart).trimEnd();
\t\t}
\t\tconst cleaned = stripInternalRuntimeContext(final ? text : text.trimEnd());
\t\treturn final ? cleaned : cleaned.trimEnd();
\t};
\tconst finishItem = () => {
\t\tcommittedVisible += clean(itemRaw, true);
\t\titemRaw = "";
\t};
\treturn {
\t\tproject(data) {
\t\t\tif (typeof data?.text !== "string" && typeof data?.delta !== "string") return data;
\t\t\tif (data.replaceable === true) return { ...data, text: clean(typeof data.text === "string" ? data.text : data.delta, false), delta: "" };
\t\t\tconst previousVisible = visible;
\t\t\tif (data.itemId !== undefined && itemId !== undefined && data.itemId !== itemId) finishItem();
\t\t\tif (data.itemId !== undefined) itemId = data.itemId;
\t\t\tif (typeof data.text === "string" && (data.replace === true || data.text.startsWith(raw))) {
\t\t\t\tif (data.text.startsWith(raw)) {
\t\t\t\t\titemRaw += data.text.slice(raw.length);
\t\t\t\t} else {
\t\t\t\t\tcommittedVisible = "";
\t\t\t\t\titemRaw = data.text;
\t\t\t\t}
\t\t\t\traw = data.text;
\t\t\t} else if (typeof data.text === "string") {
\t\t\t\tif (itemRaw !== "" && !data.text.startsWith(itemRaw)) finishItem();
\t\t\t\titemRaw = data.text;
\t\t\t\traw += typeof data.delta === "string" ? data.delta : data.text;
\t\t\t} else {
\t\t\t\titemRaw += data.delta;
\t\t\t\traw += data.delta;
\t\t\t}
\t\t\tvisible = committedVisible + clean(itemRaw, false);
\t\t\treturn {
\t\t\t\t...data,
\t\t\t\ttext: visible,
\t\t\t\tdelta: visible.startsWith(previousVisible) ? visible.slice(previousVisible.length) : visible
\t\t\t};
\t\t},
\t\tfinish() {
\t\t\tfinishItem();
\t\t\treturn committedVisible.startsWith(visible) ? committedVisible.slice(visible.length) : "";
\t\t}
\t};
}
`;

const REPLACEMENTS = [
  [
    '\tlet streamedAssistantText = "";',
    '\tconst internalContextStream = createNemoClawInternalContextStream();\n\tlet streamedAssistantText = "";',
  ],
  [
    '\t\tif (evt.stream === "assistant") {',
    '\t\tif (evt.stream === "assistant") {\n\t\t\tevt = { ...evt, data: internalContextStream.project(evt.data) };',
  ],
  [
    '\t\t\tif (stopReason === "tool_calls" && pendingToolCalls && pendingToolCalls.length > 0) {\n\t\t\t\tif (!sawAssistantDelta) {',
    `\t\t\tconst contextTail = internalContextStream.finish();
\t\t\tif (contextTail && !toolChoiceConstraint) {
\t\t\t\tstreamedAssistantText += contextTail;
\t\t\t\tsawAssistantDelta = true;
\t\t\t\twriteAssistantContentChunk(res, { ...streamIdentity, content: contextTail });
\t\t\t}
\t\t\tif (stopReason === "tool_calls" && pendingToolCalls && pendingToolCalls.length > 0) {
\t\t\t\tif (!sawAssistantDelta) {`,
  ],
] as const;

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

export function patchInternalContextSseText(source: string): string {
  let original = source;
  if (source.includes(MARKER)) {
    original = original.replace(IMPORT + STREAM_HELPER, "");
    for (const [before, after] of REPLACEMENTS) original = original.replace(after, before);
  }
  if (sha256(original) !== REVIEWED[TARGET]) {
    throw new Error("OpenClaw SSE handler differs from reviewed 2026.9.2 bytes");
  }
  let patched = original;
  for (const [before, after] of REPLACEMENTS) patched = patched.replace(before, after);
  patched = IMPORT + STREAM_HELPER + patched;
  if (source !== original && source !== patched) throw new Error("OpenClaw SSE patch is partial");
  return patched;
}

export function patchOpenClawInternalContextSse(dist: string, audit = false): string {
  const version = JSON.parse(
    fs.readFileSync(path.join(dist, "..", "package.json"), "utf8"),
  ).version;
  if (version === "2026.3.11" || version === "2026.4.24") return "skipped-legacy-fixture";
  if (version !== "2026.9.2")
    throw new Error(`OpenClaw ${version} is not reviewed for the SSE patch`);
  const targets = fs.readdirSync(dist).filter((file) => /^openai-http-.*\.(?:js|mjs)$/.test(file));
  if (targets.length !== 1 || targets[0] !== TARGET)
    throw new Error("Expected one reviewed OpenClaw SSE handler");
  for (const [file, hash] of Object.entries(REVIEWED)) {
    if (file === TARGET) continue;
    if (sha256(fs.readFileSync(path.join(dist, file), "utf8")) !== hash) {
      throw new Error(`OpenClaw ${file} differs from reviewed 2026.9.2 bytes`);
    }
  }
  const file = path.join(dist, TARGET);
  const source = fs.readFileSync(file, "utf8");
  const patched = patchInternalContextSseText(source);
  if (source === patched) return "already-patched";
  if (audit) throw new Error("OpenClaw internal-context SSE patch is not applied");
  fs.writeFileSync(file, patched);
  return "patched";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const audit = args[0] === "--audit";
  const dist = args[audit ? 1 : 0];
  try {
    if (!dist || args.length !== (audit ? 2 : 1))
      throw new Error(
        "Usage: patch-openclaw-internal-context-sse.mts [--audit] <openclaw-dist-dir>",
      );
    console.log(
      `INFO: OpenClaw internal-context SSE ${patchOpenClawInternalContextSse(dist, audit)}`,
    );
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
