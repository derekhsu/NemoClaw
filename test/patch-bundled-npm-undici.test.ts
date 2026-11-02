// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AFFECTED_UNDICI_VERSION,
  FIXED_UNDICI_VERSION,
  patchBundledNpmUndici,
  patchBundledNpmUndiciFromRegistry,
  REVIEWED_NPM_VERSION,
  verifyBundledNpmUndici,
} from "../scripts/lib/patch-bundled-npm-undici.mts";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-npm-undici-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeJson(file: string, value: object): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function packageManifest(version: string): object {
  return {
    engines: { node: ">=18.17" },
    license: "MIT",
    main: "index.js",
    name: "undici",
    types: "index.d.ts",
    version,
  };
}

function fixture(undiciVersion: string) {
  const root = temporaryDirectory();
  const npmRoot = path.join(root, "npm");
  const replacementRoot = path.join(root, "replacement");
  writeJson(path.join(npmRoot, "package.json"), {
    name: "npm",
    version: REVIEWED_NPM_VERSION,
  });
  writeJson(
    path.join(npmRoot, "node_modules", "undici", "package.json"),
    packageManifest(undiciVersion),
  );
  fs.writeFileSync(path.join(npmRoot, "node_modules", "undici", "old.js"), "old\n");
  const arboristBin = path.join(npmRoot, "node_modules", "@npmcli", "arborist", "bin", "index.js");
  fs.mkdirSync(path.dirname(arboristBin), { recursive: true });
  fs.writeFileSync(arboristBin, "#!/usr/bin/env node\n");
  const npmBin = path.join(npmRoot, "node_modules", ".bin");
  fs.mkdirSync(npmBin);
  fs.symlinkSync("../@npmcli/arborist/bin/index.js", path.join(npmBin, "arborist"));
  writeJson(path.join(replacementRoot, "package.json"), packageManifest(FIXED_UNDICI_VERSION));
  fs.writeFileSync(path.join(replacementRoot, "index.js"), "fixed\n");
  return { npmRoot, replacementRoot };
}

function expectAffectedTreeUnchanged(target: ReturnType<typeof fixture>): void {
  expect(fs.existsSync(path.join(target.npmRoot, "node_modules", "undici", "old.js"))).toBe(true);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe("npm bundled undici remediation", () => {
  it("replaces the complete affected private package tree", () => {
    const target = fixture(AFFECTED_UNDICI_VERSION);

    expect(patchBundledNpmUndici(target)).toMatchObject({
      undiciVersion: FIXED_UNDICI_VERSION,
      npmVersion: REVIEWED_NPM_VERSION,
      state: "fixed",
    });
    expect(fs.existsSync(path.join(target.npmRoot, "node_modules", "undici", "old.js"))).toBe(
      false,
    );
    expect(
      fs.readFileSync(path.join(target.npmRoot, "node_modules", "undici", "index.js"), "utf8"),
    ).toBe("fixed\n");
  });

  it("does not invoke npm or npx until the private package is replaced and verified", () => {
    const target = fixture(AFFECTED_UNDICI_VERSION);
    const commands: string[] = [];
    const postPatchAssertions: Record<string, () => void> = {
      npm: () => expect(verifyBundledNpmUndici(target.npmRoot).state).toBe("fixed"),
      npx: () => expect(verifyBundledNpmUndici(target.npmRoot).state).toBe("fixed"),
    };

    const result = patchBundledNpmUndiciFromRegistry(target.npmRoot, {
      commandRunner(command) {
        commands.push(command);
        postPatchAssertions[command]?.();
      },
      prepareReplacement(commandRunner) {
        commandRunner("curl", []);
        commandRunner("tar", []);
        return {
          cleanup: () => commands.push("cleanup"),
          replacementRoot: target.replacementRoot,
        };
      },
    });

    expect(result.state).toBe("fixed");
    expect(commands).toEqual(["curl", "tar", "npm", "npx", "cleanup"]);
  });

  it("does not download when npm already contains the fixed release", () => {
    const target = fixture(FIXED_UNDICI_VERSION);
    const commands: string[] = [];

    expect(
      patchBundledNpmUndiciFromRegistry(target.npmRoot, {
        commandRunner: (command) => commands.push(command),
        prepareReplacement: () => {
          throw new Error("unexpected download");
        },
      }),
    ).toMatchObject({ state: "fixed" });
    expect(commands).toEqual(["npm", "npx"]);
    expectAffectedTreeUnchanged(target);
  });

  it("restores the original package when the replacement rename fails", () => {
    const target = fixture(AFFECTED_UNDICI_VERSION);
    const originalRenameSync = fs.renameSync.bind(fs);
    const renameSpy = vi
      .spyOn(fs, "renameSync")
      .mockImplementationOnce(() => {
        throw new Error("injected replacement rename failure");
      })
      .mockImplementation(originalRenameSync);
    syncBuiltinESMExports();

    try {
      expect(() => patchBundledNpmUndici(target)).toThrow("injected replacement rename failure");
    } finally {
      renameSpy.mockRestore();
      syncBuiltinESMExports();
    }

    expectAffectedTreeUnchanged(target);
    expect(() => verifyBundledNpmUndici(target.npmRoot)).toThrow(
      `affected undici@${AFFECTED_UNDICI_VERSION}`,
    );
  });

  it("restores the original package when post-swap verification fails", () => {
    const target = fixture(AFFECTED_UNDICI_VERSION);
    const livePath = path.join(target.npmRoot, "node_modules", "undici");
    const originalRenameSync = fs.renameSync.bind(fs);
    const renameSpy = vi
      .spyOn(fs, "renameSync")
      .mockImplementationOnce((oldPath, newPath) => {
        originalRenameSync(oldPath, newPath);
        writeJson(path.join(livePath, "package.json"), {
          ...packageManifest(FIXED_UNDICI_VERSION),
          main: "unexpected.js",
        });
      })
      .mockImplementation(originalRenameSync);
    syncBuiltinESMExports();

    try {
      expect(() => patchBundledNpmUndici(target)).toThrow(
        "npm bundled undici identity or package contract has drifted",
      );
    } finally {
      renameSpy.mockRestore();
      syncBuiltinESMExports();
    }

    expectAffectedTreeUnchanged(target);
    expect(() => verifyBundledNpmUndici(target.npmRoot)).toThrow(
      `affected undici@${AFFECTED_UNDICI_VERSION}`,
    );
  });

  it("keeps the verified replacement when backup cleanup is partial", () => {
    const target = fixture(AFFECTED_UNDICI_VERSION);
    const originalRmSync = fs.rmSync.bind(fs);
    let injectedCleanupFailure = false;
    const rmSpy = vi
      .spyOn(fs, "rmSync")
      .mockImplementationOnce(originalRmSync)
      .mockImplementationOnce((targetPath) => {
        injectedCleanupFailure = true;
        originalRmSync(path.join(String(targetPath), "old.js"), { force: true });
        throw new Error("injected partial backup cleanup failure");
      })
      .mockImplementation(originalRmSync);
    syncBuiltinESMExports();

    try {
      expect(patchBundledNpmUndici(target)).toMatchObject({ state: "fixed" });
    } finally {
      rmSpy.mockRestore();
      syncBuiltinESMExports();
    }

    expect(injectedCleanupFailure).toBe(true);
    expect(verifyBundledNpmUndici(target.npmRoot)).toMatchObject({ state: "fixed" });
    expect(
      fs
        .readdirSync(path.join(target.npmRoot, "node_modules"))
        .some((entry) => entry.startsWith("undici.nemoclaw-backup-")),
    ).toBe(false);
  });

  it("fails closed when the affected backup cannot be removed", () => {
    const target = fixture(AFFECTED_UNDICI_VERSION);
    const originalRmSync = fs.rmSync.bind(fs);
    const rmSpy = vi
      .spyOn(fs, "rmSync")
      .mockImplementationOnce(originalRmSync)
      .mockImplementationOnce(() => {
        throw new Error("injected backup cleanup failure");
      })
      .mockImplementationOnce(() => {
        throw new Error("injected backup cleanup retry failure");
      })
      .mockImplementation(originalRmSync);
    syncBuiltinESMExports();

    let failure: unknown;
    try {
      patchBundledNpmUndici(target);
    } catch (error) {
      failure = error;
    } finally {
      rmSpy.mockRestore();
      syncBuiltinESMExports();
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map(String)).toEqual([
      "Error: injected backup cleanup failure",
      "Error: injected backup cleanup retry failure",
    ]);
    expect(verifyBundledNpmUndici(target.npmRoot)).toMatchObject({ state: "fixed" });
    expect(
      fs
        .readdirSync(path.join(target.npmRoot, "node_modules"))
        .some((entry) => entry.startsWith("undici.nemoclaw-backup-")),
    ).toBe(true);
  });

  it("reports the original patch failure when rollback also fails", () => {
    const target = fixture(AFFECTED_UNDICI_VERSION);
    const livePath = path.join(target.npmRoot, "node_modules", "undici");
    const originalRenameSync = fs.renameSync.bind(fs);
    const renameSpy = vi
      .spyOn(fs, "renameSync")
      .mockImplementationOnce((oldPath, newPath) => {
        originalRenameSync(oldPath, newPath);
        writeJson(path.join(livePath, "package.json"), {
          ...packageManifest(FIXED_UNDICI_VERSION),
          main: "unexpected.js",
        });
      })
      .mockImplementationOnce(() => {
        throw new Error("injected rollback rename failure");
      })
      .mockImplementation(originalRenameSync);
    syncBuiltinESMExports();

    let failure: unknown;
    try {
      patchBundledNpmUndici(target);
    } catch (error) {
      failure = error;
    } finally {
      renameSpy.mockRestore();
      syncBuiltinESMExports();
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors.map(String)).toEqual([
      expect.stringContaining("npm bundled undici identity or package contract has drifted"),
      "Error: injected rollback rename failure",
    ]);
    const backup = fs
      .readdirSync(path.join(target.npmRoot, "node_modules"))
      .find((entry) => entry.startsWith("undici.nemoclaw-backup-"));
    expect(backup).toBeDefined();
    expect(fs.existsSync(path.join(target.npmRoot, "node_modules", String(backup), "old.js"))).toBe(
      true,
    );
  });

  it("rejects a replacement that is not the reviewed undici release (#19)", () => {
    const target = fixture(AFFECTED_UNDICI_VERSION);
    writeJson(
      path.join(target.replacementRoot, "package.json"),
      packageManifest(AFFECTED_UNDICI_VERSION),
    );

    expect(() => patchBundledNpmUndici(target)).toThrow(
      `replacement package must be undici@${FIXED_UNDICI_VERSION}`,
    );
    expectAffectedTreeUnchanged(target);
  });

  it("fails closed on npm layout drift and unsafe package members", () => {
    const drifted = fixture(AFFECTED_UNDICI_VERSION);
    writeJson(path.join(drifted.npmRoot, "package.json"), { name: "npm", version: "12.0.0" });
    expect(() => patchBundledNpmUndici(drifted)).toThrow("npm package identity has drifted");
    expectAffectedTreeUnchanged(drifted);

    const duplicate = fixture(AFFECTED_UNDICI_VERSION);
    writeJson(
      path.join(duplicate.npmRoot, "node_modules", "nested", "undici", "package.json"),
      packageManifest(AFFECTED_UNDICI_VERSION),
    );
    expect(() => patchBundledNpmUndici(duplicate)).toThrow("npm bundled undici layout has drifted");
    expectAffectedTreeUnchanged(duplicate);

    const unsafe = fixture(AFFECTED_UNDICI_VERSION);
    fs.symlinkSync("package.json", path.join(unsafe.replacementRoot, "unsafe-link"));
    expect(() => patchBundledNpmUndici(unsafe)).toThrow("unsafe member");
    expectAffectedTreeUnchanged(unsafe);

    const escapingBinLink = fixture(AFFECTED_UNDICI_VERSION);
    const outsideNodeModules = path.join(path.dirname(escapingBinLink.npmRoot), "outside.js");
    fs.writeFileSync(outsideNodeModules, "outside\n");
    fs.symlinkSync(
      "../../../outside.js",
      path.join(escapingBinLink.npmRoot, "node_modules", ".bin", "escape"),
    );
    expect(() => patchBundledNpmUndici(escapingBinLink)).toThrow(
      "npm package contains an unsafe symlink",
    );
    expectAffectedTreeUnchanged(escapingBinLink);
  });
});
