// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { execTimeout } from "./helpers/timeouts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(repoRoot, "scripts/hermes-tools-image-release.sh");
const image = "docker.io/derekhsu/openshell-hermes";
const baseTag = "openshell01x-hermes-0.21.3-2026.11.13";
const baseRef = `${image}:${baseTag}@sha256:${"a".repeat(64)}`;
const amd64 = `${image}@sha256:${"1".repeat(64)}`;
const arm64 = `${image}@sha256:${"2".repeat(64)}`;
const indexDigest = `sha256:${"3".repeat(64)}`;
const tempDirs: string[] = [];

// A fake docker that records every call. EXISTING_TAGS lists tags that the
// registry has; INSPECT_ERROR replaces "not found" with another failure.
const fakeDocker = `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >>"$CALLS"
if [ "$1 $2 $3 \${4:-}" = "buildx imagetools inspect --format" ]; then
  echo "${indexDigest}"
  exit 0
fi
if [ "$1 $2 $3" = "buildx imagetools inspect" ]; then
  ref=\${!#}
  for tag in $EXISTING_TAGS; do
    [ "$ref" = "${image}:$tag" ] && { echo "sha256:${"f".repeat(64)}"; exit 0; }
  done
  if [ -n "\${INSPECT_ERROR:-}" ]; then echo "$INSPECT_ERROR" >&2; exit 1; fi
  echo "ERROR: $ref: not found" >&2
  exit 1
fi
if [ "$1 $2 $3" = "buildx imagetools create" ]; then
  exit 0
fi
echo "unexpected docker call: $*" >&2
exit 2
`;

type Run = {
  status: number | null;
  stdout: string;
  stderr: string;
  calls: string[];
  outputs: string;
};

function workspace(base = baseRef, digests = { amd64, arm64 }) {
  const dir = mkdtempSync(path.join(tmpdir(), "nemoclaw-hermes-tools-release-"));
  tempDirs.push(dir);
  writeFileSync(
    path.join(dir, "Dockerfile.tools"),
    `ARG BASE_IMAGE=${base}\nFROM \${BASE_IMAGE}\n`,
  );
  mkdirSync(path.join(dir, "bin"));
  writeFileSync(path.join(dir, "bin/docker"), fakeDocker, { mode: 0o755 });
  mkdirSync(path.join(dir, "digests"));
  writeFileSync(path.join(dir, "digests/amd64.txt"), `${digests.amd64}\n`);
  writeFileSync(path.join(dir, "digests/arm64.txt"), `${digests.arm64}\n`);
  for (const file of ["calls", "outputs"]) writeFileSync(path.join(dir, file), "");
  return dir;
}

function run(args: string[], env: Record<string, string> = {}, dir = workspace()): Run {
  const result = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    timeout: execTimeout(),
    env: {
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      CALLS: path.join(dir, "calls"),
      GITHUB_OUTPUT: path.join(dir, "outputs"),
      DOCKERFILE: path.join(dir, "Dockerfile.tools"),
      DIGEST_DIR: path.join(dir, "digests"),
      REPOSITORY: "derekhsu/NemoClaw",
      REF: "refs/heads/feat/image-only-cli",
      EXISTING_TAGS: "",
      ...env,
    },
  });
  const read = (file: string) => readFileSync(path.join(dir, file), "utf8");
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    calls: read("calls").split("\n").filter(Boolean),
    outputs: read("outputs"),
  };
}

const releaseTags = (tag: string) => [tag, `${tag}-amd64`, `${tag}-arm64`];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("Hermes tools image release planning (#74)", () => {
  it("derives <base tag>-tools.<n> from the digest-pinned base and checks every release tag", () => {
    const result = run(["plan"], { TOOLS_RELEASE: "1" });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.outputs).toBe(`base_image=${baseRef}\ntag=${baseTag}-tools.1\n`);
    expect(result.calls).toEqual(
      releaseTags(`${baseTag}-tools.1`).map((tag) => `buildx imagetools inspect ${image}:${tag}`),
    );
  });

  it.each([
    "0",
    "01",
    "-1",
    "1.1",
    "1 latest",
    "1$(touch /tmp/pwned)",
    "",
    "10000",
  ])("rejects tools release %j before contacting the registry", (release) => {
    const result = run(["plan"], { TOOLS_RELEASE: release });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tools release must be a positive number");
    expect(result.calls).toEqual([]);
    expect(result.outputs).toBe("");
  });

  it.each([
    [{ REPOSITORY: "NVIDIA/NemoClaw" }, "publishing runs only in derekhsu/NemoClaw"],
    [
      { REF: "refs/heads/issue/74-hermes-tools-image" },
      "publishing runs only from refs/heads/feat/image-only-cli",
    ],
    [{ REF: "refs/tags/v1" }, "publishing runs only from refs/heads/feat/image-only-cli"],
  ])("rejects publishing outside the fork's release branch: %j", (env, message) => {
    const result = run(["plan"], { TOOLS_RELEASE: "1", ...env });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(result.calls).toEqual([]);
  });

  it.each([
    `${image}:${baseTag}`,
    `${image}@sha256:${"a".repeat(64)}`,
    `${image}:openshell01x-hermes-0.21.3-2026.11.13-amd64@sha256:${"a".repeat(64)}`,
    `${image}:hermes-2026.11.13@sha256:${"a".repeat(64)}`,
    `docker.io/someone/openshell-hermes:${baseTag}@sha256:${"a".repeat(64)}`,
    `ghcr.io/nvidia/openshell-hermes:${baseTag}@sha256:${"a".repeat(64)}`,
  ])("rejects a base that is not a published 0.1.x Hermes tag pinned by digest: %s", (base) => {
    const result = run(["plan"], { TOOLS_RELEASE: "1" }, workspace(base));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("BASE_IMAGE in");
    expect(result.calls).toEqual([]);
  });

  it.each(
    releaseTags(`${baseTag}-tools.2`),
  )("refuses to overwrite the existing tag %s", (existing) => {
    const result = run(["plan"], { TOOLS_RELEASE: "2", EXISTING_TAGS: existing });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${image}:${existing} already exists`);
    expect(result.outputs).toBe("");
  });

  it("stops on a registry error instead of treating the tag as missing", () => {
    const result = run(["plan"], {
      TOOLS_RELEASE: "1",
      INSPECT_ERROR: "unauthorized: rate limited",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("cannot check");
    expect(result.outputs).toBe("");
  });
});

describe("Hermes tools image release publication (#74)", () => {
  const tag = `${baseTag}-tools.1`;

  it("points the multi-arch tag and both architecture tags at the tested digests", () => {
    const result = run(["publish"], { TAG: tag });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    const creates = result.calls.filter((call) => call.startsWith("buildx imagetools create"));
    expect(creates).toEqual([
      `buildx imagetools create -t ${image}:${tag} ${amd64} ${arm64}`,
      `buildx imagetools create -t ${image}:${tag}-amd64 ${amd64}`,
      `buildx imagetools create -t ${image}:${tag}-arm64 ${arm64}`,
    ]);
    expect(result.stdout).toContain(indexDigest);
  });

  it.each([
    baseTag,
    `${baseTag}-amd64`,
    "latest",
    `${tag}-amd64`,
    `${tag} latest`,
  ])("refuses to write the non-tools tag %j", (badTag) => {
    const result = run(["publish"], { TAG: badTag });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not a tools release tag");
    expect(result.calls).toEqual([]);
  });

  it("refuses a digest reference outside the Hermes repository", () => {
    const dir = workspace(baseRef, {
      amd64: `docker.io/someone/x@sha256:${"1".repeat(64)}`,
      arm64,
    });
    const result = run(["publish"], { TAG: tag }, dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("invalid amd64 digest reference");
    expect(result.calls.filter((call) => call.includes("create"))).toEqual([]);
  });

  it("refuses to overwrite a tag created after planning", () => {
    const result = run(["publish"], { TAG: tag, EXISTING_TAGS: `${tag}-arm64` });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("already exists");
    expect(result.calls.filter((call) => call.includes("create"))).toEqual([]);
  });
});
