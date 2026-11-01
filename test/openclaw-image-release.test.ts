// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { execTimeout } from "./helpers/timeouts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(repoRoot, "scripts/openclaw-image-release.sh");
const image = "docker.io/derekhsu/openshell-openclaw";
const baseDigest = `${image}@sha256:${"a".repeat(64)}`;
const amd64 = `${image}@sha256:${"1".repeat(64)}`;
const arm64 = `${image}@sha256:${"2".repeat(64)}`;
const indexDigest = `sha256:${"3".repeat(64)}`;
const tempDirs: string[] = [];

// A fake docker that records every call. EXISTING_TAGS lists tags that the
// registry has; INSPECT_ERROR replaces "not found" with another failure;
// FAIL_CREATE_TAG makes the create call for that tag fail; FAIL_INDEX_DIGEST
// makes the index digest lookup after publication fail.
const fakeDocker = `#!/usr/bin/env bash
set -eu
printf '%s\\n' "$*" >>"$CALLS"
if [ "$1 $2 $3 \${4:-}" = "buildx imagetools inspect --format" ]; then
  [ -z "\${FAIL_INDEX_DIGEST:-}" ] || { echo "registry unavailable" >&2; exit 17; }
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
  case " $* " in *" ${image}:\${FAIL_CREATE_TAG:-none} "*) echo "push failed" >&2; exit 1 ;; esac
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
  summary: string;
};

function workspace(base = baseDigest) {
  const dir = mkdtempSync(path.join(tmpdir(), "nemoclaw-image-release-"));
  tempDirs.push(dir);
  writeFileSync(path.join(dir, "Dockerfile"), "FROM x\nARG OPENCLAW_VERSION=2026.9.2\n");
  writeFileSync(
    path.join(dir, "Dockerfile.tools"),
    `ARG BASE_IMAGE=${base}\nFROM \${BASE_IMAGE}\n`,
  );
  mkdirSync(path.join(dir, "bin"));
  writeFileSync(path.join(dir, "bin/docker"), fakeDocker, { mode: 0o755 });
  mkdirSync(path.join(dir, "digests"));
  writeFileSync(path.join(dir, "digests/amd64.txt"), `${amd64}\n`);
  writeFileSync(path.join(dir, "digests/arm64.txt"), `${arm64}\n`);
  for (const file of ["calls", "outputs", "summary"]) writeFileSync(path.join(dir, file), "");
  return dir;
}

function run(args: string[], env: Record<string, string> = {}, dir = workspace()): Run {
  const result = spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    timeout: execTimeout(),
    env: {
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      ROOT: dir,
      CALLS: path.join(dir, "calls"),
      GITHUB_OUTPUT: path.join(dir, "outputs"),
      GITHUB_STEP_SUMMARY: path.join(dir, "summary"),
      DIGEST_DIR: path.join(dir, "digests"),
      REPOSITORY: "derekhsu/NemoClaw",
      REF: "refs/heads/feat/image-only-cli",
      IMAGE_NAME: image,
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
    summary: read("summary"),
  };
}

const creates = (calls: string[]) =>
  calls.filter((call) => call.startsWith("buildx imagetools create"));

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("OpenClaw image release planning (#16)", () => {
  it("plans a tools release from the digest-pinned base without moving standard aliases", () => {
    const result = run(["plan"], { VARIANT: "tools", TAG: "2026.9.2-tools.1" });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.outputs).toContain("version=2026.9.2\n");
    expect(result.outputs).toContain(`base_image=${baseDigest}\n`);
    expect(result.calls).toEqual([`buildx imagetools inspect ${image}:2026.9.2-tools.1`]);
    expect(result.summary).not.toContain("Moving alias");
  });

  it("plans a standard release with architecture tags and moving aliases", () => {
    const result = run(["plan"], { VARIANT: "standard", TAG: "2026.9.2-r3" });

    expect(result.status).toBe(0);
    expect(result.calls).toEqual(
      ["2026.9.2-r3", "2026.9.2-r3-amd64", "2026.9.2-r3-arm64"].map(
        (tag) => `buildx imagetools inspect ${image}:${tag}`,
      ),
    );
    expect(result.summary).toContain(`Moving alias: \`${image}:latest\``);
    expect(result.summary).toContain(`Moving alias: \`${image}:openclaw-2026.9.2\``);
  });

  it.each([
    ["standard", "2026.9.2-tools.1", "standard tag must be"],
    ["standard", "2026.9.2-amd64", "standard tag must be"],
    ["standard", "latest", "standard tag must be"],
    ["tools", "2026.9.2", "tools tag must be"],
    ["tools", "2026.9.2-r3", "tools tag must be"],
    ["tools", "2026.9.2-tools.0", "tools tag must be"],
    ["tools", "2026.9.2-tools.1-amd64", "tools tag must be"],
    ["tools", "2026.9.2-tools.1$(touch /tmp/pwned)", "tools tag must be"],
    ["tools", "2026.9.2-tools.1\nlatest", "tools tag must be"],
    ["tools", "2026.9.2-tools.1 latest", "tools tag must be"],
    ["slim", "2026.9.2-tools.1", "variant must be standard or tools"],
  ])("rejects %s tag %j before contacting the registry", (variant, tag, message) => {
    const result = run(["plan"], { VARIANT: variant, TAG: tag });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(result.calls).toEqual([]);
    expect(result.outputs).toBe("");
  });

  it.each([
    [{ REPOSITORY: "NVIDIA/NemoClaw" }, "publication runs only in derekhsu/NemoClaw"],
    [{ REPOSITORY: "someone/NemoClaw" }, "publication runs only in derekhsu/NemoClaw"],
    [
      { REF: "refs/heads/codex/issue-16-tools" },
      "publication runs only from refs/heads/feat/image-only-cli",
    ],
    [{ REF: "refs/tags/v1" }, "publication runs only from refs/heads/feat/image-only-cli"],
    [
      { IMAGE_NAME: "ghcr.io/nvidia/openshell-openclaw" },
      "publication targets only docker.io/derekhsu",
    ],
  ])("rejects publication outside the fork's release branch and repository: %j", (env, message) => {
    const result = run(["plan"], { VARIANT: "tools", TAG: "2026.9.2-tools.1", ...env });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(result.calls).toEqual([]);
  });

  it("rejects a standard tag whose version differs from the Dockerfile OpenClaw pin", () => {
    const result = run(["plan"], { VARIANT: "standard", TAG: "2026.9.3" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("does not match Dockerfile OPENCLAW_VERSION 2026.9.2");
  });

  it.each([
    "docker.io/derekhsu/openshell-openclaw:2026.9.2-r2",
    `docker.io/someone/openshell-openclaw@sha256:${"a".repeat(64)}`,
    `docker.io/derekhsu/openclaw-sandbox-base@sha256:${"a".repeat(64)}`,
  ])("rejects a tools base that is not the published standard image by digest: %s", (base) => {
    const result = run(["plan"], { VARIANT: "tools", TAG: "2026.9.2-tools.1" }, workspace(base));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "BASE_IMAGE must be docker.io/derekhsu/openshell-openclaw pinned by digest",
    );
  });

  it.each([
    ["tools", "2026.9.2-tools.1", "2026.9.2-tools.1"],
    ["standard", "2026.9.2-r2", "2026.9.2-r2"],
    ["standard", "2026.9.2-r3", "2026.9.2-r3-arm64"],
  ])("rejects %s tag %s when %s already exists", (variant, tag, existing) => {
    const result = run(["plan"], { VARIANT: variant, TAG: tag, EXISTING_TAGS: existing });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`${image}:${existing} already exists`);
    expect(creates(result.calls)).toEqual([]);
  });

  it("stops when the registry check fails for a reason other than a missing tag", () => {
    const result = run(["plan"], {
      VARIANT: "tools",
      TAG: "2026.9.2-tools.1",
      INSPECT_ERROR: "toomanyrequests: rate limit",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("cannot check");
    expect(result.outputs).toBe("");
  });
});

describe("OpenClaw tools version identity (#16)", () => {
  it("accepts a tools tag that matches the image's OpenClaw version", () => {
    const result = run(["check-tools-version", "2026.9.2-tools.4", "OpenClaw 2026.9.2"]);

    expect(result.status).toBe(0);
  });

  it.each([
    "OpenClaw 2026.9.3",
    "OpenClaw 2026.9.20",
    "openclaw: command not found",
    "",
  ])("rejects a tools tag when the image reports %j", (reported) => {
    const result = run(["check-tools-version", "2026.9.2-tools.4", reported]);

    expect(result.status).not.toBe(0);
  });
});

describe("OpenClaw image publication (#16)", () => {
  it("publishes a tools release as one multi-architecture tag", () => {
    const result = run(["publish"], { VARIANT: "tools", TAG: "2026.9.2-tools.1" });

    expect(result.status).toBe(0);
    expect(creates(result.calls)).toEqual([
      `buildx imagetools create -t ${image}:2026.9.2-tools.1 ${amd64} ${arm64}`,
    ]);
    expect(result.summary).toContain(`Index digest: \`${indexDigest}\``);
  });

  it("fails after writing tags when the index digest cannot be read", () => {
    const result = run(["publish"], {
      VARIANT: "tools",
      TAG: "2026.9.2-tools.1",
      FAIL_INDEX_DIGEST: "1",
    });

    expect(result.status).not.toBe(0);
    expect(creates(result.calls)).toHaveLength(1);
    expect(result.summary).toContain("Published without an index digest");
    expect(result.summary).toContain(`Tag: \`${image}:2026.9.2-tools.1\``);
    expect(result.summary).not.toContain("Index digest:");
    expect(result.stderr).toContain("cannot read the index digest");
  });

  it("writes standard release tags before moving latest and openclaw-<version>", () => {
    const result = run(["publish"], { VARIANT: "standard", TAG: "2026.9.2-r3" });

    expect(result.status).toBe(0);
    expect(creates(result.calls)).toEqual([
      `buildx imagetools create -t ${image}:2026.9.2-r3 ${amd64} ${arm64}`,
      `buildx imagetools create -t ${image}:2026.9.2-r3-amd64 ${amd64}`,
      `buildx imagetools create -t ${image}:2026.9.2-r3-arm64 ${arm64}`,
      `buildx imagetools create -t ${image}:latest -t ${image}:openclaw-2026.9.2 ${amd64} ${arm64}`,
    ]);
  });

  it("rechecks release tags before writing and leaves aliases untouched", () => {
    const result = run(["publish"], {
      VARIANT: "standard",
      TAG: "2026.9.2-r3",
      EXISTING_TAGS: "2026.9.2-r3",
    });

    expect(result.status).not.toBe(0);
    expect(creates(result.calls)).toEqual([]);
  });

  it("refuses to publish when one architecture has no digest", () => {
    const dir = workspace();
    rmSync(path.join(dir, "digests/arm64.txt"));
    const result = run(["publish"], { VARIANT: "tools", TAG: "2026.9.2-tools.1" }, dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing arm64 digest");
    expect(creates(result.calls)).toEqual([]);
  });

  it("refuses a digest reference outside the release image", () => {
    const dir = workspace();
    writeFileSync(
      path.join(dir, "digests/amd64.txt"),
      `docker.io/derekhsu/other@sha256:${"1".repeat(64)}\n`,
    );
    const result = run(["publish"], { VARIANT: "tools", TAG: "2026.9.2-tools.1" }, dir);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("invalid amd64 digest reference");
  });

  it("reports the tags and digests already written when a later write fails", () => {
    const result = run(["publish"], {
      VARIANT: "standard",
      TAG: "2026.9.2-r3",
      FAIL_CREATE_TAG: "2026.9.2-r3-arm64",
    });

    expect(result.status).not.toBe(0);
    expect(result.summary).toContain("Publication incomplete");
    expect(result.summary).toContain(`Tag: \`${image}:2026.9.2-r3\``);
    expect(result.summary).toContain(`Tag: \`${image}:2026.9.2-r3-amd64\``);
    expect(result.summary).not.toContain(`Tag: \`${image}:2026.9.2-r3-arm64\``);
    expect(result.summary).toContain(amd64);
    expect(result.summary).toContain(arm64);
    expect(creates(result.calls).some((call) => call.includes(":latest"))).toBe(false);
  });

  it("reports the pushed digests when the first tag write fails", () => {
    const result = run(["publish"], {
      VARIANT: "tools",
      TAG: "2026.9.2-tools.1",
      FAIL_CREATE_TAG: "2026.9.2-tools.1",
    });

    expect(result.status).not.toBe(0);
    expect(result.summary).toContain("Publication incomplete");
    expect(result.summary).toContain(amd64);
    expect(result.summary).not.toContain("- Tag:");
  });
});
