// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vitest";

const repoRoot = path.join(import.meta.dirname, "..");
const runtimeRoot = "/usr/local/lib/nemoclaw/mcp-tool-discovery-runtime";
const dockerfiles = [
  "Dockerfile",
  "agents/hermes/Dockerfile",
  "agents/langchain-deepagents-code/Dockerfile",
] as const;

function createCacheSeedFixture(): {
  cache: string;
  fixture: string;
  retryHelper: string;
  seed: string;
} {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-npm-cache-seed-"));
  const cache = path.join(fixture, "cache");
  const retryHelper = path.join(fixture, "npm-ci-locked.sh");
  const seedDirectory = path.join(fixture, "npm-cache-seed");
  const seedNames = ["yallist-5.0.0.tgz", "yaml-2.8.3.tgz", "yoctocolors-2.1.2.tgz"];
  const seed = path.join(seedDirectory, seedNames[0]);
  fs.mkdirSync(seedDirectory);
  fs.copyFileSync(
    path.join(repoRoot, "tools", "mcp-tool-discovery-runtime", "npm-ci-locked.sh"),
    retryHelper,
  );
  fs.chmodSync(retryHelper, 0o755);
  for (const seedName of seedNames) {
    fs.copyFileSync(
      path.join(repoRoot, "tools", "mcp-tool-discovery-runtime", "npm-cache-seed", seedName),
      path.join(seedDirectory, seedName),
    );
  }
  const splitSeed = path.join(seedDirectory, "yaml-2.8.3.tgz");
  const splitSeedBytes = fs.readFileSync(splitSeed);
  const splitOffset = Math.ceil(splitSeedBytes.length / 2);
  fs.unlinkSync(splitSeed);
  fs.writeFileSync(`${splitSeed}.part-000`, splitSeedBytes.subarray(0, splitOffset));
  fs.writeFileSync(`${splitSeed}.part-001`, splitSeedBytes.subarray(splitOffset));
  fs.writeFileSync(
    path.join(fixture, "package.json"),
    `${JSON.stringify(
      {
        name: "cache-seed-contract",
        private: true,
        dependencies: { yallist: "5.0.0", yaml: "2.8.3", yoctocolors: "2.1.2" },
      },
      null,
      2,
    )}\n`,
  );
  fs.writeFileSync(
    path.join(fixture, "package-lock.json"),
    `${JSON.stringify(
      {
        name: "cache-seed-contract",
        lockfileVersion: 3,
        packages: {
          "": {
            name: "cache-seed-contract",
            dependencies: {
              yallist: "5.0.0",
              yaml: "2.8.3",
              yoctocolors: "2.1.2",
            },
          },
          "node_modules/yallist": {
            version: "5.0.0",
            resolved: "https://registry.npmjs.org/yallist/-/yallist-5.0.0.tgz",
            integrity:
              "sha512-YgvUTfwqyc7UXVMrB+SImsVYSmTS8X/tSrtdNZMImM+n7+QTriRXyXim0mBrTXNeqzVF0KWGgHPeiyViFFrNDw==",
          },
          "node_modules/yaml": {
            version: "2.8.3",
            resolved: "https://registry.npmjs.org/yaml/-/yaml-2.8.3.tgz",
            integrity:
              "sha512-AvbaCLOO2Otw/lW5bmh9d/WEdcDFdQp2Z2ZUH3pX9U2ihyUY0nvLv7J6TrWowklRGPYbB/IuIMfYgxaCPg5Bpg==",
          },
          "node_modules/yoctocolors": {
            version: "2.1.2",
            resolved: "https://registry.npmjs.org/yoctocolors/-/yoctocolors-2.1.2.tgz",
            integrity:
              "sha512-CzhO+pFNo8ajLM2d2IW/R93ipy99LWjtwblvC1RsoSUMZgyLbYFr221TnSNT7GjGdYui6P459mw9JH/g/zW2ug==",
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  return { cache, fixture, retryHelper, seed };
}

describe("MCP tool discovery image contract", () => {
  // source-shape-contract: security -- Exact package pins and the CI audit mapping protect the shipped runtime graph
  it("pins reviewed packages and audits their lock outside image builds (#8253)", () => {
    const packageRoot = path.join(repoRoot, "tools", "mcp-tool-discovery-runtime");
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    const lock = JSON.parse(fs.readFileSync(path.join(packageRoot, "package-lock.json"), "utf8"));
    const auditConfig = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "ci", "reviewed-npm-audit.json"), "utf8"),
    );
    const review = fs.readFileSync(path.join(packageRoot, "dependency-review.md"), "utf8");
    const installer = fs.readFileSync(
      path.join(packageRoot, "install-reviewed-runtime.sh"),
      "utf8",
    );
    const reviewedSdk = {
      name: "@modelcontextprotocol/sdk",
      version: "1.32.0",
      resolved: "https://registry.npmjs.org/@modelcontextprotocol/sdk/-/sdk-1.32.0.tgz",
      integrity:
        "sha512-8BviX/hK4Gd2eL1KdTwm0gfl4d3wdoErW0Jd00h6nomUAtk6IJk5vwQJc6kfWtJTzN5OEV/lgIiJKI8fiDGAlA==",
    } as const;
    const reviewedPackages = {
      "@hono/node-server": {
        version: "2.0.12",
        resolved: "https://registry.npmjs.org/@hono/node-server/-/node-server-2.0.12.tgz",
        integrity:
          "sha512-eWpQYr67tqJLeaSUl0Q+TquuYfUdTibpOJlUMV2FfUP7+KqCC5TufnwnlXL6mobZBJbGAYRd7ZvEBDCbLInjhg==",
      },
      "body-parser": {
        version: "2.4.0",
        resolved: "https://registry.npmjs.org/body-parser/-/body-parser-2.4.0.tgz",
        integrity:
          "sha512-Ifk1KcLrxaGt1occQagQNFNNOqRt1LFuehEnHHzB8Z6cRgIxRU1TBaiIsUiCdA+gy5PL7Y1IX31DNKkRmxtXjQ==",
      },
      "fast-uri": {
        version: "3.1.7",
        resolved: "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.7.tgz",
        integrity:
          "sha512-dOvZVzjdZdz7phd9v6jCbwxrBW3fK6n8Rc0CtdmM4bumzMnxywBYhuph6J819RRw/ku+rLbelwfMunktuzVVHg==",
      },
      hono: {
        version: "4.12.34",
        resolved: "https://registry.npmjs.org/hono/-/hono-4.12.34.tgz",
        integrity:
          "sha512-GqXJqY/xJkJmuloTrnV1ZEXG3fqte+VjkUqoRNZXcrUidiUOP4fMSIHHY4tsqZBK++kVyWmt/AAfSUuy57/eSA==",
      },
      "ip-address": {
        version: "10.3.1",
        resolved: "https://registry.npmjs.org/ip-address/-/ip-address-10.3.1.tgz",
        integrity:
          "sha512-1e9d3kb97NHJTIJDZW9rKqW2h6+dFa50Dy0fpPSMQp2ADje5gvKsXmdiK6dwY5t76TaTt5+P5N1Y/LoToIxP6g==",
      },
      "proxy-addr": {
        version: "2.0.8",
        resolved: "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz",
        integrity:
          "sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==",
      },
      zod: {
        version: "4.6.6",
        resolved: "https://registry.npmjs.org/zod/-/zod-4.6.6.tgz",
        integrity:
          "sha512-4UmzQUF5fxvfcYHlbjBmejU+w+hbDnWFx4aS8kBx7nPBHcO2SqPbpAG8snbdg+Xse4pRefR98hgjFgIMCI/UhA==",
      },
    } as const;

    expect(manifest.dependencies[reviewedSdk.name]).toBe(reviewedSdk.version);
    expect(lock.packages[`node_modules/${reviewedSdk.name}`]).toMatchObject({
      version: reviewedSdk.version,
      resolved: reviewedSdk.resolved,
      integrity: reviewedSdk.integrity,
    });
    expect(review).toContain(`\`${reviewedSdk.name}@${reviewedSdk.version}\``);
    expect(review).toContain(`\`${reviewedSdk.integrity}\``);
    expect(manifest.overrides).toEqual(
      Object.fromEntries(
        Object.entries(reviewedPackages).map(([packageName, metadata]) => [
          packageName,
          metadata.version,
        ]),
      ),
    );
    for (const [packageName, metadata] of Object.entries(reviewedPackages)) {
      expect(lock.packages[`node_modules/${packageName}`]).toMatchObject(metadata);
      expect(review).toContain(`\`${packageName}@${metadata.version}\``);
      expect(review).toContain(`\`${metadata.integrity}\``);
    }
    expect(installer).not.toContain("npm audit signatures");
    const reviewedAuditDriver = fs.readFileSync(
      path.join(repoRoot, "scripts", "audit-reviewed-npm-graph.mts"),
      "utf8",
    );
    expect(reviewedAuditDriver).toContain('["audit", "signatures", "--omit=dev"]');
    expect(auditConfig.lockedGraphs).toContainEqual({
      id: "mcp-tool-discovery-runtime",
      label: "MCP tool discovery runtime locked production graph",
      packageSpec: `${reviewedSdk.name}@${reviewedSdk.version}`,
      integrity: reviewedSdk.integrity,
      tarballUrl: reviewedSdk.resolved,
      directory: "tools/mcp-tool-discovery-runtime",
      lockSha256: "bc7e34d9eb1f72cf3016c8b88c72d3b7682a4f234903cb93b9476b10d7e954eb",
      replacementLockSha256: "a055cc6630c19809d3b359dc464ca5684fe86e0155fde2be3cd89e3f436ae679",
    });
    expect(installer).toContain(
      'export NODE_OPTIONS="${NODE_OPTIONS:---dns-result-order=ipv4first}"',
    );
    expect(installer).toContain('export NPM_CONFIG_MAXSOCKETS="${NPM_CONFIG_MAXSOCKETS:-4}"');
    const openClawDockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
    expect(openClawDockerfile).toContain("FROM scratch AS mcp-tool-discovery-runtime");
    expect(openClawDockerfile).toContain(
      "COPY tools/mcp-tool-discovery-runtime/npm-cache-seed/ /opt/nemoclaw-build-tools/npm-cache-seed/",
    );
    expect(openClawDockerfile).toContain(
      "COPY tools/mcp-tool-discovery-runtime/npm-cache-seed/ /usr/local/lib/nemoclaw-build-tools/npm-cache-seed/",
    );
    expect(openClawDockerfile).toContain(
      "COPY tools/mcp-tool-discovery-runtime/reviewed-runtime-bundle/mcp-tool-discovery/mcp-tool-discovery.bundle /opt/mcp-tool-discovery-runtime/dist/mcp-tool-discovery.mjs",
    );
    expect(openClawDockerfile).not.toContain("mcp-runtime-npm-cache-seed/");
    expect(openClawDockerfile).not.toContain("install-reviewed-runtime.sh");
  });

  it.skipIf(process.platform === "win32")(
    "installs the complete pinned cache seed offline before registry access",
    async () => {
      const { cache, fixture, retryHelper } = createCacheSeedFixture();

      try {
        const installResult = spawnSync("/bin/sh", [retryHelper, "--ignore-scripts"], {
          encoding: "utf8",
          cwd: fixture,
          env: { ...process.env, NPM_CONFIG_CACHE: cache },
        });

        expect(installResult).toMatchObject({ status: 0 });
        const installedModule = await import(
          pathToFileURL(path.join(fixture, "node_modules", "yoctocolors", "index.js")).href
        );
        const installedYaml = await import(
          pathToFileURL(path.join(fixture, "node_modules", "yaml", "dist", "index.js")).href
        );
        expect(stripVTControlCharacters(installedModule.default.red("offline cache seed"))).toBe(
          "offline cache seed",
        );
        expect(installedYaml.parse("enabled: true")).toEqual({ enabled: true });
        expect(fs.existsSync(path.join(fixture, "node_modules", "yallist", "dist"))).toBe(true);
      } finally {
        fs.rmSync(fixture, { force: true, recursive: true });
      }
    },
  );

  it.each([
    {
      archiveCount: 83,
      label: "NemoClaw CLI",
      lockfile: "nemoclaw/package-lock.json",
      seedDirectory: "tools/mcp-tool-discovery-runtime/npm-cache-seed",
    },
  ])("pins every reachable $label lockfile archive for protected Linux x64 builds", (fixture) => {
    const seedDirectory = path.join(repoRoot, fixture.seedDirectory);
    const manifest = JSON.parse(fs.readFileSync(path.join(seedDirectory, "manifest.json"), "utf8"));
    const seedNames = fs
      .readdirSync(seedDirectory)
      .filter((seedName) => seedName !== "manifest.json")
      .sort();
    const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, fixture.lockfile), "utf8"));

    expect(manifest).toMatchObject({
      archiveCount: fixture.archiveCount,
      kind: "nemoclaw-locked-npm-cache-seed-v1",
      target: { cpu: "x64", libc: "glibc", os: "linux" },
    });
    expect(manifest.archives).toHaveLength(manifest.archiveCount);
    expect(
      seedNames
        .map((seedName) => fs.statSync(path.join(seedDirectory, seedName)).size)
        .every((size) => size <= 2_000_000),
    ).toBe(true);
    for (const archive of manifest.archives) {
      const archiveParts = seedNames.filter(
        (seedName) =>
          seedName === archive.archive || seedName.startsWith(`${archive.archive}.part-`),
      );
      const expectedParts =
        archiveParts.length === 1 && archiveParts[0] === archive.archive
          ? [archive.archive]
          : archiveParts.map(
              (_seedName, index) => `${archive.archive}.part-${String(index).padStart(3, "0")}`,
            );
      const seed = Buffer.concat(
        archiveParts.map((seedName) => fs.readFileSync(path.join(seedDirectory, seedName))),
      );
      const integrity = `sha512-${crypto.createHash("sha512").update(seed).digest("base64")}`;
      const matches = (
        Object.values(lock.packages) as Array<{ integrity?: string; resolved?: string }>
      ).filter(
        (entry) =>
          entry.integrity === integrity &&
          path.basename(new URL(entry.resolved ?? "https://invalid.invalid/").pathname) ===
            archive.archive,
      );

      expect(archiveParts).toEqual(expectedParts);
      expect(seed).toHaveLength(archive.size);
      expect(integrity).toBe(archive.integrity);
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it("does not commit MCP runtime registry archives", () => {
    const seedDirectory = path.join(
      repoRoot,
      "tools/mcp-tool-discovery-runtime/mcp-runtime-npm-cache-seed",
    );
    const trackedSeedFiles = fs.readdirSync(seedDirectory).filter((name) => name !== ".gitkeep");

    expect(trackedSeedFiles).toEqual([]);
  });

  it("pins the reviewed image runtime artifacts exactly", () => {
    const bundleRoot = path.join(
      repoRoot,
      "tools/mcp-tool-discovery-runtime/reviewed-runtime-bundle",
    );
    const expectedHashes = {
      "managed-startup-image-runtime.bundle":
        "7c636c15a60f235a03c09f26649508ee65412ab34db23a4107c9832d638a99b5",
      "mcp-tool-discovery/BUNDLED_PACKAGES.json":
        "e639c9b532e145ffad3486d39f899a63fabcc845fbbd4a19294b2e5c2853e495",
      "mcp-tool-discovery/THIRD_PARTY_LICENSES.txt":
        "3ac4c12b0946565b6f5e2066c77758b7e95f2a3e24c37e56bc82aca6e12feb4a",
      "mcp-tool-discovery/mcp-tool-discovery.bundle":
        "4c25fb1141259135d0857b3cd3942f9fda61726aedc87b6c249d15733a6d0935",
    } as const;

    for (const [relativePath, expectedHash] of Object.entries(expectedHashes)) {
      const actualHash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(bundleRoot, relativePath)))
        .digest("hex");
      expect(actualHash, relativePath).toBe(expectedHash);
    }

    const executableFixture = fs.mkdtempSync(
      path.join(os.tmpdir(), "nemoclaw-reviewed-mcp-runtime-"),
    );
    try {
      const executablePath = path.join(executableFixture, "mcp-tool-discovery.mjs");
      fs.copyFileSync(
        path.join(bundleRoot, "mcp-tool-discovery/mcp-tool-discovery.bundle"),
        executablePath,
      );
      const discoveryResult = spawnSync(process.execPath, [executablePath], { encoding: "utf8" });
      expect(discoveryResult).toMatchObject({ status: 0, stderr: "" });
      expect(JSON.parse(discoveryResult.stdout)).toEqual({
        protocol: 1,
        ok: false,
        count: 0,
        tools: [],
        truncated: false,
        detail: "tool discovery received invalid runtime arguments",
      });
    } finally {
      fs.rmSync(executableFixture, { force: true, recursive: true });
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects a cache seed that does not match the lockfile integrity",
    () => {
      const { cache, fixture, retryHelper, seed } = createCacheSeedFixture();
      fs.chmodSync(seed, 0o644);
      fs.appendFileSync(seed, "tampered");

      try {
        const installResult = spawnSync("/bin/sh", [retryHelper, "--offline"], {
          encoding: "utf8",
          cwd: fixture,
          env: { ...process.env, NPM_CONFIG_CACHE: cache },
        });

        expect(installResult).toMatchObject({ status: 1 });
        expect(installResult.stderr).toContain(
          "refusing an npm cache seed not pinned by package-lock.json",
        );
      } finally {
        fs.rmSync(fixture, { force: true, recursive: true });
      }
    },
  );

  // source-shape-contract: compatibility -- Protected rebuilds must materialize mutable dependency graphs in explicit offline stages
  it("pins dependency-materialization RUN cache identity", () => {
    const openClawDockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
    const managedMessagingRuntimePackage = JSON.parse(
      fs.readFileSync(
        path.join(repoRoot, "agents/openclaw/managed-image-messaging-runtime/package.json"),
        "utf8",
      ),
    ) as { dependencies: Record<string, string> };
    const hermesDockerfile = fs.readFileSync(
      path.join(repoRoot, "agents/hermes/Dockerfile"),
      "utf8",
    );
    const dcodeDockerfile = fs.readFileSync(
      path.join(repoRoot, "agents/langchain-deepagents-code/Dockerfile"),
      "utf8",
    );

    expect(openClawDockerfile.match(/--network=default\b/gu)).toHaveLength(3);
    expect(openClawDockerfile.match(/^RUN --network=none\b/gmu)).toHaveLength(4);
    expect(openClawDockerfile).toContain(
      "RUN --network=none --mount=from=openclaw-optional-plugin-archives,target=/opt/nemoclaw-reviewed-npm-archives,ro",
    );
    expect(openClawDockerfile).toContain("AS wechat-npm-cache");
    expect(openClawDockerfile).toContain("AS codex-acp-runtime");
    expect(managedMessagingRuntimePackage.dependencies).toEqual({
      "@emnapi/core": "1.11.1",
      "@emnapi/runtime": "1.11.3",
      "@openclaw/discord": "2026.9.2",
      "@openclaw/googlechat": "2026.9.2",
      "@openclaw/msteams": "2026.9.2",
      "@openclaw/slack": "2026.9.2",
      "@openclaw/whatsapp": "2026.9.2",
      "@tencent-weixin/openclaw-weixin": "2.4.9",
      "agent-base": "6.0.2",
      axios: "1.19.0",
      "https-proxy-agent": "5.0.1",
      "nemoclaw-openclaw-override-fast-uri": "npm:fast-uri@4.1.4",
      "nemoclaw-openclaw-override-ip-address": "npm:ip-address@10.5.0",
      "nemoclaw-openclaw-override-protobufjs": "npm:protobufjs@8.7.2",
      "nemoclaw-openclaw-override-qs": "npm:qs@6.15.3",
      "nemoclaw-openclaw-override-uuid": "npm:uuid@14.0.2",
      openclaw: "2026.9.2",
      undici: "8.12.2",
      zod: "4.6.6",
      "nemoclaw-openclaw-override-undici7": "npm:undici@7.30.1",
      "nemoclaw-openclaw-override-msal-node": "npm:@azure/msal-node@7.1.0",
    });
    expect(openClawDockerfile).toContain("AS openclaw-managed-messaging-npm-cache-0");
    expect(openClawDockerfile).toContain("AS openclaw-managed-messaging-npm-cache-1");
    expect(openClawDockerfile).toContain(
      "FROM openclaw-managed-messaging-npm-cache-${NEMOCLAW_MANAGED_IMAGE_CAPABILITY_UNION} AS openclaw-managed-messaging-npm-cache",
    );
    expect(openClawDockerfile).toContain(
      "--archive-directory /opt/nemoclaw-build-tools/npm-cache-seed",
    );
    expect(openClawDockerfile).toContain('--os linux --cpu "$npm_target_cpu" --libc glibc');
    expect(openClawDockerfile).toContain("--packuments-only");
    expect(openClawDockerfile).toContain('export NPM_CONFIG_CACHE="$install_cache"');
    expect(openClawDockerfile).toContain("export NPM_CONFIG_OFFLINE=true");
    expect(hermesDockerfile.match(/^RUN --network=default\b/gmu) ?? []).toHaveLength(0);
    expect(dcodeDockerfile.match(/^RUN --network=default\b/gmu) ?? []).toHaveLength(0);
  });

  it.each(
    dockerfiles,
  )("%s copies and probes the bundled runtime at its canonical path (#6901)", (relativePath) => {
    const dockerfile = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

    expect(dockerfile).toContain(
      "COPY tools/mcp-tool-discovery-runtime/reviewed-runtime-bundle/mcp-tool-discovery/mcp-tool-discovery.bundle /opt/mcp-tool-discovery-runtime/dist/mcp-tool-discovery.mjs",
    );
    expect(dockerfile).toContain(
      "COPY tools/mcp-tool-discovery-runtime/reviewed-runtime-bundle/managed-startup-image-runtime.bundle /out/managed-startup-image-runtime.cjs",
    );
    expect(dockerfile).toContain(
      `COPY --from=mcp-tool-discovery-runtime /opt/mcp-tool-discovery-runtime/dist/ ${runtimeRoot}/`,
    );
    expect(dockerfile).not.toContain("mcp-runtime-npm-cache-seed/");
    expect(dockerfile).not.toContain("install-reviewed-runtime.sh");
    expect(dockerfile).toContain(`node ${runtimeRoot}/mcp-tool-discovery.mjs`);
    expect(dockerfile).not.toContain(`${runtimeRoot}/mcp-tool-discovery.ts`);
  });

  it.skipIf(process.platform === "win32")(
    "accepts a complete locked tree after npm's exact internal exit-handler failure",
    () => {
      const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-npm-complete-tree-"));
      const retryHelper = path.join(fixture, "npm-ci-locked.sh");
      const mockBin = path.join(fixture, "bin");
      const invocations = path.join(fixture, "npm-invocations");
      fs.mkdirSync(mockBin);
      fs.copyFileSync(
        path.join(repoRoot, "tools", "mcp-tool-discovery-runtime", "npm-ci-locked.sh"),
        retryHelper,
      );
      fs.chmodSync(retryHelper, 0o755);
      fs.writeFileSync(
        path.join(mockBin, "npm"),
        `#!/bin/sh
set -eu
printf '%s\n' "$*" >>"$NEMOCLAW_TEST_NPM_INVOCATIONS"
case "$1" in
  ci)
    echo 'npm error Exit handler never called!' >&2
    exit 1
    ;;
  ls)
    exit 0
    ;;
  *)
    exit 99
    ;;
esac
`,
        { mode: 0o755 },
      );

      try {
        const result = spawnSync("/bin/sh", [retryHelper, "--omit=dev"], {
          encoding: "utf8",
          cwd: fixture,
          env: {
            ...process.env,
            NEMOCLAW_TEST_NPM_INVOCATIONS: invocations,
            PATH: `${mockBin}:${process.env.PATH ?? ""}`,
          },
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toContain(
          "internal exit-handler failure after completing the locked dependency tree",
        );
        expect(fs.readFileSync(invocations, "utf8").trim().split("\n")).toEqual([
          "ci --omit=dev",
          "ls --all --json --omit=dev",
        ]);
      } finally {
        fs.rmSync(fixture, { force: true, recursive: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "completes npm's exact internal exit-handler failure from locked cache archives",
    () => {
      const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-mcp-install-retry-"));
      const script = path.join(fixture, "install-reviewed-runtime.sh");
      const mockBin = path.join(fixture, "bin");
      const counter = path.join(fixture, "npm-counter");
      const invocations = path.join(fixture, "npm-invocations");
      fs.mkdirSync(mockBin);
      fs.copyFileSync(
        path.join(repoRoot, "tools", "mcp-tool-discovery-runtime", "install-reviewed-runtime.sh"),
        script,
      );
      fs.copyFileSync(
        path.join(repoRoot, "tools", "mcp-tool-discovery-runtime", "package-lock.json"),
        path.join(fixture, "package-lock.json"),
      );
      const retryHelper = path.join(fixture, "npm-ci-locked.sh");
      fs.copyFileSync(
        path.join(repoRoot, "tools", "mcp-tool-discovery-runtime", "npm-ci-locked.sh"),
        retryHelper,
      );
      fs.chmodSync(retryHelper, 0o755);
      fs.writeFileSync(counter, "0\n");
      fs.writeFileSync(
        path.join(mockBin, "npm"),
        `#!/bin/sh
set -eu
invocation=$(cat "$NEMOCLAW_TEST_NPM_COUNTER")
invocation=$((invocation + 1))
printf '%s\n' "$invocation" >"$NEMOCLAW_TEST_NPM_COUNTER"
printf '%s\n' "$*" >>"$NEMOCLAW_TEST_NPM_INVOCATIONS"
case "$invocation" in
  1)
    echo 'npm error Exit handler never called!' >&2
    exit 1
    ;;
  2)
    echo 'npm error code ELSPROBLEMS' >&2
    echo 'npm error missing: reviewed dependency tree is incomplete' >&2
    exit 1
    ;;
  3)
    echo 'npm error code ENOTCACHED' >&2
    echo 'npm error request to https://registry.npmjs.org/@modelcontextprotocol/sdk/-/sdk-1.32.0.tgz failed: cache mode is only-if-cached but no cached response is available.' >&2
    exit 1
    ;;
  4|5)
    echo 'npm error code EAI_AGAIN' >&2
    echo 'npm error syscall getaddrinfo' >&2
    echo 'npm error request failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org' >&2
    exit 1
    ;;
esac
exit 0
`,
        { mode: 0o755 },
      );

      try {
        const result = spawnSync("/bin/sh", [script], {
          encoding: "utf8",
          env: {
            ...process.env,
            NEMOCLAW_TEST_NPM_COUNTER: counter,
            NEMOCLAW_TEST_NPM_INVOCATIONS: invocations,
            PATH: `${mockBin}:${process.env.PATH ?? ""}`,
          },
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toContain(
          "before completing the locked dependency tree; completing it offline from cache",
        );
        expect(result.stderr).toContain("fetching one missing lockfile archive for offline retry");
        expect(result.stderr).toContain(
          "retrying the missing lockfile archive after a transient network failure",
        );
        expect(fs.readFileSync(counter, "utf8").trim()).toBe("10");
        expect(fs.readFileSync(invocations, "utf8").trim().split("\n").slice(0, 7)).toEqual([
          "ci --ignore-scripts --no-audit --no-fund --no-progress",
          "ls --all --json --ignore-scripts --no-audit --no-fund --no-progress",
          "ci --ignore-scripts --no-audit --no-fund --no-progress --offline",
          "cache add https://registry.npmjs.org/@modelcontextprotocol/sdk/-/sdk-1.32.0.tgz",
          "cache add https://registry.npmjs.org/@modelcontextprotocol/sdk/-/sdk-1.32.0.tgz",
          "cache add https://registry.npmjs.org/@modelcontextprotocol/sdk/-/sdk-1.32.0.tgz",
          "ci --ignore-scripts --no-audit --no-fund --no-progress --offline",
        ]);
      } finally {
        fs.rmSync(fixture, { force: true, recursive: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "does not retry a non-internal locked-install failure",
    () => {
      const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-mcp-install-failure-"));
      const script = path.join(fixture, "install-reviewed-runtime.sh");
      const mockBin = path.join(fixture, "bin");
      const counter = path.join(fixture, "npm-counter");
      fs.mkdirSync(mockBin);
      fs.copyFileSync(
        path.join(repoRoot, "tools", "mcp-tool-discovery-runtime", "install-reviewed-runtime.sh"),
        script,
      );
      const retryHelper = path.join(fixture, "npm-ci-locked.sh");
      fs.copyFileSync(
        path.join(repoRoot, "tools", "mcp-tool-discovery-runtime", "npm-ci-locked.sh"),
        retryHelper,
      );
      fs.chmodSync(retryHelper, 0o755);
      fs.writeFileSync(counter, "0\n");
      fs.writeFileSync(
        path.join(mockBin, "npm"),
        `#!/bin/sh
set -eu
invocation=$(cat "$NEMOCLAW_TEST_NPM_COUNTER")
invocation=$((invocation + 1))
printf '%s\n' "$invocation" >"$NEMOCLAW_TEST_NPM_COUNTER"
echo 'npm error lock verification failed' >&2
exit 42
`,
        { mode: 0o755 },
      );

      try {
        const result = spawnSync("/bin/sh", [script], {
          encoding: "utf8",
          env: {
            ...process.env,
            NEMOCLAW_TEST_NPM_COUNTER: counter,
            PATH: `${mockBin}:${process.env.PATH ?? ""}`,
          },
        });

        expect(result.status).toBe(42);
        expect(result.stderr).not.toContain("retrying the locked install once");
        expect(fs.readFileSync(counter, "utf8").trim()).toBe("1");
      } finally {
        fs.rmSync(fixture, { force: true, recursive: true });
      }
    },
  );
});
