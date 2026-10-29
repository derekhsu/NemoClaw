// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

export interface AssistantData {
  text?: string;
  delta?: string;
  replace?: boolean;
  replaceable?: boolean;
  itemId?: string;
  stream?: string;
  data?: { phase: string; error?: string };
}
interface ToolCall {
  id?: string;
  index?: number;
  function: { name?: string; arguments: string };
}
export interface SseFrame {
  error?: { message: string; type: string };
  choices?: Array<{
    delta: { content?: string; tool_calls?: ToolCall[] };
    finish_reason: string | null;
  }>;
}
export type NativeFrames = Array<SseFrame | "DONE">;
interface AgentResult {
  payloads: Array<{ text: string }>;
  meta: {
    stopReason?: string;
    pendingToolCalls?: Array<{ id: string; name: string; arguments: string }>;
  };
}

/** The fixture retains complete upstream bytes; execute its native SSE branch. */
function declaration(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const end = source.indexOf("\n}", start);
  if (end < 0) throw new Error(`Native function ${name} has no closing boundary`);
  return source.slice(start, end + 2);
}

export async function probe(
  dist: string,
  events: AssistantData[],
  result: AgentResult | Error = { payloads: [{ text: "VISIBLE" }], meta: {} },
  options: { afterEvent?: (wire: string) => void; toolChoiceConstraint?: string } = {},
): Promise<NativeFrames> {
  const names = fs.readdirSync(dist);
  const httpFile = names.find((name) => /^openai-http-.*\.(?:js|mjs)$/.test(name));
  if (!httpFile) throw new Error("Native OpenClaw HTTP bundle is missing");
  const read = (name: string) => fs.readFileSync(path.join(dist, name), "utf8");
  const http = read(httpFile);
  const helpers = names
    .filter((name) => /^(?:server-chat-state|openai-tool-choice)-/.test(name))
    .map(read)
    .join("\n");
  const needed = [
    "resolveAssistantStreamDeltaText",
    "resolveAssistantStreamSnapshotText",
    "isReplaceableAssistantStreamEvent",
    "resolveAssistantTextInput",
    "mergeAssistantText",
    "mergePendingAssistantText",
    "resolveAssistantTextStreamDelta",
    "resolveAssistantTextCompletion",
    "createAssistantTextStream",
    "resolveAssistantResultText",
  ];
  const writers = [
    "writeSse",
    "writeChatCompletionChunk",
    "writeChatCompletionChoice",
    "writeAssistantRoleChunk",
    "writeAssistantContentChunk",
    "writeAssistantFinishChunk",
    "writeUsageChunk",
    "splitArgumentsForStreaming",
    "writeAssistantToolCallsIncrementalChunks",
    "resolveStopReasonAndPendingToolCalls",
    "resolveAgentResponseText",
    "resolveAgentResponseCommentary",
  ];
  let listener: (event: object) => void = () => {
    throw new Error("Agent listener not installed");
  };
  const frames: string[] = [];
  let finish: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  class Response extends EventEmitter {
    write(chunk: string) {
      frames.push(chunk);
    }
    end() {
      this.emit("finish");
      finish();
    }
  }
  const res = new Response();
  const run = async () => {
    for (const data of events) {
      listener(
        data.stream ? { runId: "probe", ...data } : { runId: "probe", stream: "assistant", data },
      );
      options.afterEvent?.(frames.join(""));
    }
    if (result instanceof Error) throw result;
    return result;
  };
  const globals = {
    res,
    req: new EventEmitter(),
    queueMicrotask,
    runId: "probe",
    streamIdentity: { runId: "probe", created: 0, model: "fixture" },
    streamIncludeUsage: false,
    toolChoiceConstraint: options.toolChoiceConstraint,
    toolChoice: { constraint: options.toolChoiceConstraint },
    abortController: new AbortController(),
    gatewayCommandInput: {},
    defaultRuntime: {},
    deps: {},
    setSseHeaders() {},
    writeDone: (response: Response) => response.write("data: [DONE]\n\n"),
    onAgentEventForRun: (_id: string, callback: typeof listener) => {
      listener = callback;
      return () => {};
    },
    watchClientDisconnect: () => () => {},
    retainGatewayRootWorkAdmissionContinuation: () => () => {},
    retainGatewayHttpResponseWork: () => () => {},
    emitAgentEvent: (event: object) => listener(event),
    logWarn() {},
    agentCommandFromGatewayIngress: run,
    runAgentCommand: run,
    readAgentRunTerminalOutcome: () => "success",
    readOpenAiHttpRunTerminal: (value: AgentResult) => ({ runFailed: false, ...value.meta }),
    resolveChatCompletionUsage: () => ({ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }),
    resolveToolChoiceConstraintError: () => undefined,
    isToolChoiceConstraintSatisfied: () => true,
    resolveUnsatisfiedToolChoiceMessage: () => "tool choice error",
    normalizeOptionalString: (value: unknown) =>
      typeof value === "string" ? value.trim() || undefined : undefined,
    asOptionalObjectRecord: (value: unknown) =>
      value && typeof value === "object" && !Array.isArray(value) ? value : undefined,
    isClientToolNameConflictError: () => false,
    resolveOpenAiCompatError: () => undefined,
    resolveOpenAiCompatibleAgentError: (error: unknown) => ({
      error: { message: String(error), type: "api_error" },
    }),
    avoidTrailingHighSurrogateBreak: (value: string, start: number, end: number) =>
      end > start && end < value.length && /[\uD800-\uDBFF]/u.test(value[end - 1]) ? end - 1 : end,
  };
  const start = http.indexOf("\tsetSseHeaders(res);");
  const end = http.indexOf("\n}\n//#endregion", start);
  if (start < 0 || end < start) throw new Error("Native SSE branch boundaries changed");
  let context = "";
  let escape = "";
  if (http.includes("function createNemoClawInternalContextStream(")) {
    const contextFile = names.find((name) =>
      /^internal-runtime-context-.*\.(?:js|mjs)$/.test(name),
    );
    const regexp = names.find((name) => /^regexp-.*\.(?:js|mjs)$/.test(name));
    if (!contextFile || !regexp)
      throw new Error("Native context stripper dependencies are missing");
    context = read(contextFile)
      .replace(/^import .*\n/gm, "")
      .replace(/^export .*\n/gm, "");
    escape = declaration(read(regexp), "escapeRegExp");
  }
  const code = [
    escape,
    context,
    declaration(http, "createNemoClawInternalContextStream"),
    ...needed.map((name) => declaration(helpers, name)),
    ...writers.map((name) => declaration(http, name)),
    `(async () => { let onDisconnect;\n${http.slice(start, end)}\n})();`,
  ].join("\n");
  const task = vm.runInNewContext(code, globals, { timeout: 3000 });
  await task;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      finished,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Native SSE handler did not finish")), 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  return frames
    .join("")
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => (frame === "data: [DONE]" ? "DONE" : JSON.parse(frame.slice(6))));
}
