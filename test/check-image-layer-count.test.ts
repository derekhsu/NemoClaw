// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { execTimeout } from "./helpers/timeouts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(repoRoot, "scripts/check-image-layer-count.sh");
const repo = "docker.io/derekhsu/openshell-hermes";
const digest = (c: string) => `sha256:${c.repeat(64)}`;
const tempDirs: string[] = [];

function manifest(layers: number) {
  return {
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    layers: Array.from({ length: layers }, (_, i) => ({ digest: `sha256:${i}` })),
  };
}

function index(entries: { digest: string; os: string; architecture: string }[]) {
  return {
    mediaType: "application/vnd.oci.image.index.v1+json",
    manifests: entries.map(({ digest, os, architecture }) => ({
      digest,
      platform: { os, architecture },
    })),
  };
}

// Fake docker: `buildx imagetools inspect --raw REF` prints the file named
// after the digest in REF from the manifests directory.
function run(manifests: Record<string, unknown>, refs: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), "nemoclaw-layer-count-"));
  tempDirs.push(dir);
  mkdirSync(path.join(dir, "bin"));
  mkdirSync(path.join(dir, "manifests"));
  for (const [ref, body] of Object.entries(manifests)) {
    writeFileSync(path.join(dir, "manifests", ref.replace("sha256:", "")), JSON.stringify(body));
  }
  writeFileSync(
    path.join(dir, "bin/docker"),
    `#!/usr/bin/env bash
set -eu
[ "$1 $2 $3 $4" = "buildx imagetools inspect --raw" ] || { echo "unexpected: $*" >&2; exit 2; }
cat "${dir}/manifests/\${5##*@sha256:}"
`,
    { mode: 0o755 },
  );
  return spawnSync("bash", [script, ...refs], {
    encoding: "utf8",
    timeout: execTimeout(),
    env: { ...process.env, PATH: `${path.join(dir, "bin")}:${process.env.PATH}` },
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("check-image-layer-count.sh", () => {
  it("accepts a platform image at the 115-layer limit", () => {
    const result = run({ [digest("1")]: manifest(115) }, [`${repo}@${digest("1")}`]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("115 layers (limit 115)");
  });

  it("rejects a 130-layer platform image above the 115-layer limit (#70)", () => {
    const result = run({ [digest("1")]: manifest(130) }, [`${repo}@${digest("1")}`]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("has 130 layers; the limit is 115");
  });

  it("checks every platform image of an index and skips attestation manifests", () => {
    const result = run(
      {
        [digest("a")]: index([
          { digest: digest("1"), os: "linux", architecture: "amd64" },
          { digest: digest("2"), os: "linux", architecture: "arm64" },
          { digest: digest("3"), os: "unknown", architecture: "unknown" },
        ]),
        [digest("1")]: manifest(57),
        [digest("2")]: manifest(116),
      },
      [`${repo}@${digest("a")}`],
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("(linux/amd64): 57 layers");
    expect(result.stderr).toContain("(linux/arm64) has 116 layers");
    expect(result.stdout + result.stderr).not.toContain("unknown");
  });

  it("checks every reference and reports each failure", () => {
    const result = run({ [digest("1")]: manifest(120), [digest("2")]: manifest(119) }, [
      `${repo}@${digest("1")}`,
      `${repo}@${digest("2")}`,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("has 120 layers");
    expect(result.stderr).toContain("has 119 layers");
  });

  it("refuses a reference that is not pinned by digest", () => {
    const result = run({}, [`${repo}:latest`]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("expected IMAGE@sha256:DIGEST");
  });
});
