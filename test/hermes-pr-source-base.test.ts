// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve(
  import.meta.dirname,
  "../scripts/checks/resolve-hermes-pr-source-base.sh",
);

function resolveFixture(change = "none", platform?: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-source-base-"));
  const blobs = path.join(directory, "blobs/sha256");
  fs.mkdirSync(blobs, { recursive: true });
  const store = (body: string) => {
    const hex = createHash("sha256").update(body).digest("hex");
    fs.writeFileSync(path.join(blobs, hex), body);
    return `sha256:${hex}`;
  };
  const config = JSON.stringify({
    os: "linux",
    architecture: change === "platform" ? "arm64" : "amd64",
  });
  const configDigest = store(config);
  const manifest = JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    config: { digest: configDigest },
    layers: [],
  });
  const digest = store(manifest);
  const descriptor = { digest, mediaType: "application/vnd.oci.image.manifest.v1+json" };
  fs.writeFileSync(
    path.join(directory, "index.json"),
    JSON.stringify({ manifests: change === "duplicate" ? [descriptor, descriptor] : [descriptor] }),
  );
  if (change === "manifest") fs.appendFileSync(path.join(blobs, digest.slice(7)), " ");
  if (change === "config") fs.appendFileSync(path.join(blobs, configDigest.slice(7)), " ");
  const output = path.join(directory, "output");
  try {
    const result = spawnSync(
      "bash",
      [
        script,
        directory,
        change === "export" ? `sha256:${"f".repeat(64)}` : digest,
        ...(platform ? [platform] : []),
      ],
      {
        encoding: "utf8",
        env: { ...process.env, GITHUB_OUTPUT: output },
        timeout: 5000,
      },
    );
    return {
      ...result,
      output: fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "",
      directory,
      digest,
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

describe("Hermes PR source base resolution", () => {
  it("passes the exact exported amd64 manifest into the final build context", () => {
    const result = resolveFixture();
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("ref=nemoclaw-hermes-pr-base\n");
    expect(result.output).toContain(
      `context=nemoclaw-hermes-pr-base=oci-layout://${result.directory}@${result.digest}\n`,
    );
  });

  it("accepts arm64 only when the caller requests linux/arm64", () => {
    const result = resolveFixture("platform", "linux/arm64");
    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("ref=nemoclaw-hermes-pr-base");
  });

  it.each([
    "linux/arm64",
    "linux/ppc64le",
    "arm64",
  ])("rejects an incompatible or unsupported requested platform %s", (platform) => {
    const result = resolveFixture("none", platform);
    expect(result.status).not.toBe(0);
    expect(result.output).toBe("");
  });

  it.each([
    "platform",
    "duplicate",
    "manifest",
    "config",
    "export",
  ])("rejects %s evidence before emitting a base reference", (change) => {
    const result = resolveFixture(change);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("ERROR:");
    expect(result.output).toBe("");
  });
});
