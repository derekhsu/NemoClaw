// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPackageFixtures,
  createPackageFixture,
  managedPatchRegion,
  MANAGED_STUB_PREAMBLE,
  patchFixture,
  runPython,
} from "./helpers/langchain-deepagents-code-patch-fixture";

function patchedRegion(root: string): string {
  return managedPatchRegion(
    root,
    "client/non_interactive.py",
    "import asyncio as _nemoclaw_asyncio",
  );
}

function execRegion(root: string, script: string) {
  const region = patchedRegion(root);
  return runPython(
    root,
    `${MANAGED_STUB_PREAMBLE}
import logging

def _write_text(text):
    pass

def _write_newline():
    pass

def generate_thread_id():
    return "thread-1"

async def _run_agent_loop(*args, **kwargs):
    return 0

async def run_non_interactive(*args, **kwargs):
    return 0

namespace = {
    "_write_text": _write_text,
    "_write_newline": _write_newline,
    "generate_thread_id": generate_thread_id,
    "_run_agent_loop": _run_agent_loop,
    "run_non_interactive": run_non_interactive,
    "logger": logging.getLogger("test"),
}
exec(${JSON.stringify(region)}, namespace)
${script}`,
  );
}

const RUN_SCRIPT = `
import io, json
sink = io.StringIO()
run = namespace["_NemoClawJsonRun"](sink)
run.phase = "agent"
run.thread_id = "thread-1"
run.append_response("hello world")
status, code = namespace["_nemoclaw_json_status"](0, run)
result = namespace["_nemoclaw_write_json_envelope"](run, status, code)
print(json.dumps({"result": result, "envelope": json.loads(sink.getvalue())}))
`;

afterEach(() => {
  cleanupPackageFixtures();
});

describe("managed DCode non-interactive JSON output", () => {
  it("emits one versioned success envelope with exact assistant text (#7773)", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const result = execRegion(root, RUN_SCRIPT);
    expect(result.status, result.stderr).toBe(0);
    const out = JSON.parse(result.stdout);
    const envelope = out.envelope;
    expect(envelope.schema_version).toBe(1);
    expect(envelope.command).toBe("non-interactive");
    expect(envelope.data.status).toBe("success");
    expect(envelope.data.exit_code).toBe(0);
    expect(envelope.data.response).toBe("hello world");
    expect(envelope.data.completion.thread_id).toBe("thread-1");
  });

  it("classifies cancellation, timeout, and failure exit codes independently (#7773)", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const result = execRegion(
      root,
      `
import io, json
out = {}
for code, phase in [(0, "agent"), (124, "agent"), (130, "agent"), (2, "agent"), (3, "process")]:
    run = namespace["_NemoClawJsonRun"](io.StringIO())
    run.phase = phase
    out[f"{phase}:{code}"] = namespace["_nemoclaw_json_status"](code, run)
run = namespace["_NemoClawJsonRun"](io.StringIO())
run.output_limit = True
out["limited"] = namespace["_nemoclaw_json_status"](0, run)
print(json.dumps(out))
`,
    );
    expect(result.status, result.stderr).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out["agent:0"]).toEqual(["success", 0]);
    expect(out["agent:124"]).toEqual(["turn_limit", 124]);
    expect(out["agent:130"]).toEqual(["cancelled", 130]);
    expect(out["agent:2"]).toEqual(["agent_failure", 2]);
    expect(out["process:3"]).toEqual(["process_failure", 3]);
    expect(out.limited).toEqual(["output_limit", 1]);
  });

  it("returns a bounded output-limit envelope instead of partial text (#7773)", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const result = execRegion(
      root,
      `
import io, json
sink = io.StringIO()
run = namespace["_NemoClawJsonRun"](sink)
run.output_limit = True
namespace["_nemoclaw_write_json_envelope"](run, "output_limit", 1)
print(sink.getvalue())
`,
    );
    expect(result.status, result.stderr).toBe(0);
    const envelope = JSON.parse(result.stdout.trim());
    expect(envelope.data.status).toBe("output_limit");
    expect(envelope.data.response).toBeNull();
    expect(envelope.data.completion.response_bytes).toBe(0);
  });

  it("wires the public --json flag through the managed non-interactive path (#7773)", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const mainSource = JSON.stringify(managedPatchRegion(root, "main.py"));
    expect(mainSource).toContain("output_format");
    expect(mainSource).toContain("json");
    const nonInteractive = managedPatchRegion(
      root,
      "client/non_interactive.py",
      "import asyncio as _nemoclaw_asyncio",
    );
    expect(nonInteractive).toContain("_nemoclaw_json_status");
    expect(nonInteractive).toContain("_NemoClawJsonRun");
    expect(nonInteractive).toContain("schema_version");
  });
});
