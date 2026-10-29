// SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// SPDX-License-Identifier: Apache-2.0

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { addDarwinFcntlSealConstants } from "./darwin-fcntl-seal-fixture";

export const agentDir = path.join(process.cwd(), "agents", "langchain-deepagents-code");
export const patcher = path.join(agentDir, "patch-managed-deepagents-code.py");
export const packageFixtureRoot = path.join(
  process.cwd(),
  "test",
  "fixtures",
  "langchain-deepagents-code",
  "dcode-0.1.71",
);
export const expectedPackageVersion = "0.1.71";
const packageFixtureDirs = new Set<string>();

export function managedAutoApprovalPath(root: string): string {
  return path.join(root, "managed-auto-approval");
}

export function writeManagedAutoApproval(root: string, content: string, mode = 0o444): string {
  const capabilityPath = managedAutoApprovalPath(root);
  fs.rmSync(capabilityPath, { force: true });
  fs.writeFileSync(capabilityPath, content, { mode });
  fs.chmodSync(capabilityPath, mode);
  return capabilityPath;
}

export function managedUpstreamProviderPath(root: string): string {
  return path.join(root, "managed-upstream-provider");
}

export function managedProxyHostPath(root: string): string {
  return path.join(root, "managed-proxy-host");
}

export function managedProxyPortPath(root: string): string {
  return path.join(root, "managed-proxy-port");
}

export function managedCaBundlePath(root: string): string {
  return path.join(root, "managed-ca-bundle.pem");
}

export function managedReasoningEffortPath(root: string): string {
  return path.join(root, "managed-reasoning-effort");
}

export function writeManagedReasoningEffort(root: string, content: string, mode = 0o444): string {
  const capabilityPath = managedReasoningEffortPath(root);
  fs.rmSync(capabilityPath, { force: true });
  fs.writeFileSync(capabilityPath, content, { mode });
  fs.chmodSync(capabilityPath, mode);
  return capabilityPath;
}

export function linkManagedReasoningEffort(root: string, content: string, mode = 0o444): string {
  const targetPath = path.join(root, "managed-reasoning-effort-target");
  fs.writeFileSync(targetPath, content, { mode });
  fs.chmodSync(targetPath, mode);
  const capabilityPath = managedReasoningEffortPath(root);
  fs.symlinkSync(targetPath, capabilityPath);
  return capabilityPath;
}

export function writeFixtureFile(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${content.trim()}\n`, "utf8");
}

function copyFixtureTree(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyFixtureTree(sourcePath, destinationPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

export function createPackageFixture(version = expectedPackageVersion): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-dcode-patch-"));
  packageFixtureDirs.add(tempDir);
  copyFixtureTree(packageFixtureRoot, tempDir);
  if (version !== expectedPackageVersion) {
    for (const entry of fs.readdirSync(tempDir)) {
      if (entry.endsWith(".dist-info")) {
        fs.renameSync(
          path.join(tempDir, entry),
          path.join(tempDir, `deepagents_code-${version}.dist-info`),
        );
      }
    }
    writeFixtureFile(
      tempDir,
      `deepagents_code-${version}.dist-info/METADATA`,
      `Metadata-Version: 2.1\nName: deepagents-code\nVersion: ${version}`,
    );
  }
  const managedBaseUrlFile = path.join(tempDir, "managed-inference-base-url");
  fs.writeFileSync(managedBaseUrlFile, "https://inference.local/v1\n", "utf8");
  fs.chmodSync(managedBaseUrlFile, 0o444);
  const upstreamProviderFile = managedUpstreamProviderPath(tempDir);
  fs.writeFileSync(upstreamProviderFile, "nvidia\n", "utf8");
  fs.chmodSync(upstreamProviderFile, 0o444);
  return tempDir;
}

export function cleanupPackageFixtures(): void {
  for (const tempDir of packageFixtureDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  packageFixtureDirs.clear();
}

export function patchFixture(tempDir: string): void {
  execFileSync("python3", [patcher], {
    env: { PATH: process.env.PATH, PYTHONPATH: tempDir },
  });
  const managedBaseUrlFile = path.join(tempDir, "managed-inference-base-url");
  const helperPath = path.join(tempDir, "deepagents_code", "_nemoclaw_managed.py");
  const helper = addDarwinFcntlSealConstants(fs.readFileSync(helperPath, "utf8"))
    .replace(
      '"/usr/local/share/nemoclaw/dcode-inference-base-url"',
      JSON.stringify(managedBaseUrlFile),
    )
    .replace(
      '"/usr/local/share/nemoclaw/dcode-upstream-provider"',
      JSON.stringify(managedUpstreamProviderPath(tempDir)),
    )
    .replace(
      '"/usr/local/share/nemoclaw/dcode-proxy-host"',
      JSON.stringify(managedProxyHostPath(tempDir)),
    )
    .replace(
      '"/usr/local/share/nemoclaw/dcode-proxy-port"',
      JSON.stringify(managedProxyPortPath(tempDir)),
    )
    .replace('"/etc/openshell-tls/ca-bundle.pem"', JSON.stringify(managedCaBundlePath(tempDir)))
    .replace(
      '"/usr/local/share/nemoclaw/dcode-auto-approval"',
      JSON.stringify(managedAutoApprovalPath(tempDir)),
    )
    .replace(
      '"/usr/local/share/nemoclaw/dcode-reasoning-effort"',
      JSON.stringify(managedReasoningEffortPath(tempDir)),
    )
    .replace("_MANAGED_FILE_OWNER_UID = 0", `_MANAGED_FILE_OWNER_UID = ${process.getuid?.() ?? 0}`);
  fs.writeFileSync(helperPath, helper, "utf8");
}

export function runPython(
  root: string,
  script: string,
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("python3", ["-c", script], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, PYTHONPATH: root, ...env },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function managedPatchRegion(
  root: string,
  relativePath: string,
  startAnchor?: string,
): string {
  const text = fs.readFileSync(path.join(root, "deepagents_code", relativePath), "utf8");
  const marker = "# NemoClaw-managed Deep Agents Code hardening v2.";
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`managed patch region missing in ${relativePath}`);
  }
  if (startAnchor !== undefined) {
    const anchorIndex = text.lastIndexOf(startAnchor, markerIndex);
    if (anchorIndex === -1) {
      throw new Error(`managed patch anchor missing in ${relativePath}`);
    }
    return text.slice(anchorIndex);
  }
  return text.slice(markerIndex);
}

export const MANAGED_STUB_PREAMBLE = `
import sys
import types

class _HTTPError(Exception):
    pass

class _RequestError(_HTTPError):
    pass

class _TransportError(_RequestError):
    pass

class _TimeoutException(_TransportError):
    pass

class _ConnectTimeout(_TimeoutException):
    pass

class _ReadTimeout(_TimeoutException):
    pass

class _WriteTimeout(_TimeoutException):
    pass

class _PoolTimeout(_TimeoutException):
    pass

class _NetworkError(_TransportError):
    pass

class _ConnectError(_NetworkError):
    pass

class _ReadError(_NetworkError):
    pass

class _WriteError(_NetworkError):
    pass

class _CloseError(_NetworkError):
    pass

class _ProxyError(_TransportError):
    pass

_httpx = types.ModuleType("httpx")
for _name in ("HTTPError", "RequestError", "TransportError", "TimeoutException",
              "ConnectTimeout", "ReadTimeout", "WriteTimeout", "PoolTimeout",
              "NetworkError", "ConnectError", "ReadError", "WriteError",
              "CloseError", "ProxyError"):
    setattr(_httpx, _name, globals()["_" + _name])
sys.modules.setdefault("httpx", _httpx)

class _LangGraphError(Exception):
    pass

class _APIError(_LangGraphError):
    pass

class _APIStatusError(_APIError):
    pass

class _APIConnectionError(_APIError):
    pass

class _APITimeoutError(_APIConnectionError):
    pass

class _AuthenticationError(_APIStatusError):
    pass

class _PermissionDeniedError(_APIStatusError):
    pass

class _NotFoundError(_APIStatusError):
    pass

class _RateLimitError(_APIStatusError):
    pass

class _InternalServerError(_APIStatusError):
    pass

_lg_errors = types.ModuleType("langgraph_sdk.errors")
for _name in ("LangGraphError", "APIError", "APIStatusError", "APIConnectionError",
              "APITimeoutError", "AuthenticationError", "PermissionDeniedError",
              "NotFoundError", "RateLimitError", "InternalServerError"):
    setattr(_lg_errors, _name, globals()["_" + _name])
_lg_sdk = types.ModuleType("langgraph_sdk")
_lg_sdk.errors = _lg_errors
sys.modules.setdefault("langgraph_sdk", _lg_sdk)
sys.modules.setdefault("langgraph_sdk.errors", _lg_errors)

class _RemoteException(Exception):
    pass

_lg_remote = types.ModuleType("langgraph.pregel.remote")
_lg_remote.RemoteException = _RemoteException
_lg_pregel = types.ModuleType("langgraph.pregel")
_lg_pregel.remote = _lg_remote
_langgraph = types.ModuleType("langgraph")
_langgraph.pregel = _lg_pregel
sys.modules.setdefault("langgraph", _langgraph)
sys.modules.setdefault("langgraph.pregel", _lg_pregel)
sys.modules.setdefault("langgraph.pregel.remote", _lg_remote)

class _ModelConfigError(Exception):
    pass

class _NoCredentialsConfiguredError(_ModelConfigError):
    pass

class _UnknownProviderError(_ModelConfigError):
    pass

class _MissingCredentialsError(_ModelConfigError):
    pass

class _MissingProviderPackageError(_ModelConfigError):
    pass

_model_config = types.ModuleType("deepagents_code.model_config")
for _name in ("ModelConfigError", "NoCredentialsConfiguredError",
              "UnknownProviderError", "MissingCredentialsError",
              "MissingProviderPackageError"):
    setattr(_model_config, _name, globals()["_" + _name])
class _ModelConfig:
    @classmethod
    def load(cls):
        return cls()
_model_config.ModelConfig = _ModelConfig
_dc_pkg = types.ModuleType("deepagents_code")
_dc_pkg.__path__ = []
_dc_pkg.model_config = _model_config
sys.modules.setdefault("deepagents_code", _dc_pkg)
sys.modules.setdefault("deepagents_code.model_config", _model_config)
`;

export const REAL_HELPER_PREAMBLE = `
import importlib.util as _ilu
import os as _os

_helper = _os.path.join(_os.environ["PYTHONPATH"], "deepagents_code", "_nemoclaw_managed.py")
_spec = _ilu.spec_from_file_location("deepagents_code._nemoclaw_managed", _helper)
_managed = _ilu.module_from_spec(_spec)
sys.modules["deepagents_code._nemoclaw_managed"] = _managed
_dc_pkg._nemoclaw_managed = _managed
_spec.loader.exec_module(_managed)
`;
