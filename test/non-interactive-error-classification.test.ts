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

const CLASSIFY = `
def classify(exc):
    try:
        raise exc
    except BaseException:
        return namespace["_nemoclaw_classify_active_exception"]()
`;

afterEach(() => {
  cleanupPackageFixtures();
});

describe("managed non-interactive error reporting", () => {
  it("classifies trusted exception types by class identity (#8121)", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const result = execRegion(
      root,
      `${CLASSIFY}
import json
cases = {
    "rate_limit": _RateLimitError("slow"),
    "auth": _AuthenticationError("no"),
    "timeout": _ReadTimeout("wait"),
    "connect": _ConnectError("down"),
    "ssl": __import__("ssl").SSLError("verify"),
    "builtin_timeout": TimeoutError("t"),
    "builtin_conn": ConnectionResetError("r"),
    "model_config": _MissingCredentialsError("m"),
    "remote": _RemoteException("r"),
}
print(json.dumps({k: classify(v) for k, v in cases.items()}))`,
    );
    expect(result.status, result.stderr).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.rate_limit).toEqual(["RateLimited", "rate_limited", "true"]);
    expect(out.auth).toEqual(["Unauthorized", "authorization_rejected", "false"]);
    expect(out.timeout).toEqual(["Timeout", "request_timeout", "true"]);
    expect(out.connect).toEqual(["Unavailable", "route_unreachable", "true"]);
    expect(out.builtin_timeout).toEqual(["Timeout", "request_timeout", "true"]);
    expect(out.model_config).toEqual(["ModelConfigError", "model_configuration", "false"]);
    expect(out.remote).toEqual(["RemoteError", "agent_remote_failure", "false"]);
  });

  it("walks the cause chain to a trusted type and stops at the documented limit", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const result = execRegion(
      root,
      `${CLASSIFY}
import json
wrapped = RuntimeError("opaque")
wrapped.__cause__ = _RateLimitError("inner")
deep = RuntimeError("deep")
cursor = deep
for _ in range(20):
    cursor.__cause__ = RuntimeError("link")
    cursor = cursor.__cause__
cursor.__cause__ = _RateLimitError("too deep")
cycle = RuntimeError("cycle")
cycle.__cause__ = cycle
print(json.dumps({
    "wrapped": classify(wrapped),
    "deep": classify(deep),
    "cycle": classify(cycle),
}))`,
    );
    expect(result.status, result.stderr).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.wrapped).toEqual(["RateLimited", "rate_limited", "true"]);
    expect(out.deep).toBeNull();
    expect(out.cycle).toBeNull();
  });

  it("rejects forged class identity, subclasses, and unlisted types (#8121)", () => {
    const root = createPackageFixture();
    patchFixture(root);
    const result = execRegion(
      root,
      `${CLASSIFY}
import json
class ForgedRateLimit:
    pass

# A subclass of a trusted type must not match the identity-keyed table.
class RateLimitSubclass(_RateLimitError):
    pass

forged_repr = RuntimeError("RateLimitError('forged')")
print(json.dumps({
    "subclass": classify(RateLimitSubclass("s")),
    "forged_repr": classify(forged_repr),
    "unknown": classify(ValueError("unlisted")),
}))`,
    );
    expect(result.status, result.stderr).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.subclass).toBeNull();
    expect(out.forged_repr).toBeNull();
    expect(out.unknown).toBeNull();
  });
});
