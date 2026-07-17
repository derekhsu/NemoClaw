<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# NemoClaw Image Build Pipeline — Fork 整合設計

> **日期**: 2026-06-29
> **Fork**: `derekhsu/NemoClaw`(本地 `/Volumes/extension_data/Project/NemoClaw-fork/`)
> **對應 NVIDIA upstream commit**: `c6113be1 fix(onboard): support reasoning-compatible endpoints (#5948)`
> **狀態**: 草案 — fork 與 NVIDIA upstream 完全同步,尚未 commit fork-specific 修改

## 1. 動機

NVIDIA 停止維護 [`OpenShell-Community`](https://github.com/NVIDIA/OpenShell-Community),由 NemoClaw 接手。本 fork
搭配另一個 fork `derekhsu/OpenShell-Community`(本地 `/Volumes/extension_data/Project/OpenShell/`),
形成以下分工:

| 角色 | 負責 | 路徑 |
|---|---|---|
| Image source(原始碼) | NemoClaw 的 `Dockerfile` + plugin | `/Volumes/extension_data/Project/NemoClaw-fork/` |
| Image builder | 一個 shell 腳本(只呼叫 `docker build`) | `scripts/build-sandbox-image.sh`(待建立,§5) |
| Image registry | 內部 Docker registry | 視部署環境 |
| Sandbox runtime / lifecycle / policy | `derekhsu/OpenShell-Community` | `/Volumes/extension_data/Project/OpenShell/` |

**這份文件的目的**:讓未來看這份 fork 的人(包含三個月後的我自己)能理解「為什麼這裡
會有一個 shell 腳本,而不是 `nemoclaw onboard`」,不會誤以為它要取代 nemoclaw CLI。

## 2. 架構分界

`Dockerfile` 的 `ENTRYPOINT`:

```dockerfile
ENTRYPOINT ["/usr/local/bin/nemoclaw-start"]
```

也就是說 image **只包含 agent runtime 本身**(OpenClaw CLI + NemoClaw plugin + 啟動腳本),
**不包含**:

- OpenShell daemon 或 CLI
- Network policy / firewall 規則
- Sandbox lifecycle 邏輯
- Port forward 規則

這些歸 OpenShell 管。Image 在 NemoClaw 設計裡是「可以交給 OpenShell 管的 agent runtime
artifact」,純粹是個把 agent 程式碼 + 設定打包成可開機容器的東西。

## 3. 既有檔案(本 fork 直接重用)

| 檔案 | 用途 | 本 fork 用法 |
|---|---|---|
| `Dockerfile` (1136 行) | Sandbox runtime image(3-stage:plugin build → messaging-preload build → final) | ✅ 直接使用 |
| `Dockerfile.base` (309 行) | Base layer(apt/gosu/users/OpenClaw CLI),推到 `ghcr.io/nvidia/nemoclaw/sandbox-base:<tag>` | ✅ 透過 `ARG BASE_IMAGE` 引用 |
| `nemoclaw/`、`nemoclaw-blueprint/`、`scripts/`、`src/lib/messaging/` | build context 精選來源 | ✅ 全部需要 |
| `agents/hermes/Dockerfile` + `.base` | Hermes agent 專用 image | ❌ 本 fork 不需要 |
| `agents/langchain-deepagents-code/Dockerfile` + `.base` | LangChain deepagents 專用 image | ❌ 本 fork 不需要 |

## 4. Build context 精選(對齊 NemoClaw 的 `stageOptimizedSandboxBuildContext`)

直接送 `docker build .` 會把整個 repo(含 `node_modules`、`.git`、`coverage/` 等)
送進 daemon,context 動輒數百 MB,build 慢又吃磁碟。應仿照
`src/lib/sandbox/build-context.ts:71` 的 `stageOptimizedSandboxBuildContext`,只送以下子集到一個 temp build 目錄:

```
Dockerfile                              # 根目錄
tsconfig.runtime-preloads.json          # 根目錄
nemoclaw/
  package.json, package-lock.json, tsconfig.json, openclaw.plugin.json
  src/                                   # plugin 原始碼全部
nemoclaw-blueprint/
  blueprint.yaml
  policies/                              # 全部
  scripts/                               # 全部
  openclaw-plugins/                      # 全部
  model-specific-setup/                  # 全部
scripts/
  nemoclaw-start.sh
  generate-openclaw-config.mts
  codex-acp-wrapper.sh
  patch-openclaw-tool-catalog.js
  patch-openclaw-chat-send.js
scripts/lib/
  sandbox-init.sh
  sandbox-rlimits.sh
  openclaw_device_approval_policy.py
  clean_runtime_shell_env_shim.py
src/lib/messaging/                       # 整個 channel 編譯/渲染模組
```

> **刻意排除**:`nemoclaw-blueprint/scripts/` 的其他 Python 構建 helper、
> `scripts/` 的其他 shell scripts、`node_modules/`、`.git/`、`coverage/`、
> `.codegraph/`、`.agents/`、`.claude/`、CI metadata。

## 5. 整合腳本 `scripts/build-sandbox-image.sh`(待建立)

預定位置:`scripts/build-sandbox-image.sh`。skeleton:

```bash
#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Build the default NemoClaw sandbox image from this fork.
#  - Staged build context (avoids pushing node_modules / .git to Docker).
#  - All Dockerfile ARGs use their defaults (model / provider / etc. are
#    injected by OpenShell at runtime via env, not baked here).
#  - Output: $1 or "nemoclaw-sandbox:latest".

set -euo pipefail

build_nemoclaw_sandbox_image() {
  local tag="${1:-nemoclaw-sandbox:latest}"
  local repo_root="${NEMOCLAW_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
  local build_ctx
  build_ctx="$(mktemp -d -t nemoclaw-build-XXXXXX)"
  trap 'rm -rf "$build_ctx"' EXIT

  # -- Stage build context (參考 §4 對照 stageOptimizedSandboxBuildContext) --
  cp "$repo_root/Dockerfile" \
     "$repo_root/tsconfig.runtime-preloads.json" "$build_ctx/"
  mkdir -p "$build_ctx/nemoclaw" "$build_ctx/nemoclaw-blueprint" \
           "$build_ctx/scripts/lib" "$build_ctx/src/lib/messaging"

  for f in package.json package-lock.json tsconfig.json openclaw.plugin.json; do
    cp "$repo_root/nemoclaw/$f" "$build_ctx/nemoclaw/"
  done
  cp -R "$repo_root/nemoclaw/src" "$build_ctx/nemoclaw/"

  cp "$repo_root/nemoclaw-blueprint/blueprint.yaml" "$build_ctx/nemoclaw-blueprint/"
  for d in policies scripts openclaw-plugins model-specific-setup; do
    [ -d "$repo_root/nemoclaw-blueprint/$d" ] && \
      cp -R "$repo_root/nemoclaw-blueprint/$d" "$build_ctx/nemoclaw-blueprint/"
  done

  for f in nemoclaw-start.sh generate-openclaw-config.mts codex-acp-wrapper.sh \
           patch-openclaw-tool-catalog.js patch-openclaw-chat-send.js; do
    [ -f "$repo_root/scripts/$f" ] && cp "$repo_root/scripts/$f" "$build_ctx/scripts/"
  done
  for f in sandbox-init.sh sandbox-rlimits.sh openclaw_device_approval_policy.py \
           clean_runtime_shell_env_shim.py; do
    [ -f "$repo_root/scripts/lib/$f" ] && cp "$repo_root/scripts/lib/$f" "$build_ctx/scripts/lib/"
  done

  cp -R "$repo_root/src/lib/messaging" "$build_ctx/src/lib/"

  # -- Build --
  # Dockerfile 內部所有 ARG(含 BASE_IMAGE)用預設值;
  # 唯一顯式傳的是 NEMOCLAW_BUILD_ID(用於 image tag 後綴/快取辨識)。
  DOCKER_BUILDKIT=1 docker build \
    --build-arg NEMOCLAW_BUILD_ID="$(date +%s)" \
    -f "$build_ctx/Dockerfile" \
    -t "$tag" \
    "$build_ctx"

  printf '%s\n' "$tag"
}

build_nemoclaw_sandbox_image "$@"
```

### 為什麼不呼叫 `patchStagedDockerfile`

`OpenShell-Community` fork 走「image-as-artifact + runtime config via env」模式。
所有進階 `ARG`(見 §A `NEMOCLAW_*` 對照表)都用 Dockerfile 預設值即可,OpenShell
在 `sandbox create` 時餵 env override。

所以本 fork **刻意跳過** NemoClaw CLI 的 `prepareSandboxDockerfilePatch` /
`patchStagedDockerfile`(那兩個 primitive 是給 `nemoclaw onboard` 完整流程用的,
會自動 build image **並** 註冊到 OpenShell gateway,我們只需要前半段)。

## 6. 端到端流程

```bash
# 1. 在 NemoClaw side 建 image
cd /Volumes/extension_data/Project/NemoClaw-fork
./scripts/build-sandbox-image.sh registry.example.com/nemoclaw-sandbox:v0.1.0

# 2. 推到 registry
docker push registry.example.com/nemoclaw-sandbox:v0.1.0

# 3. OpenShell fork 拿去 wrap
cd /Volumes/extension_data/Project/OpenShell
openshell sandbox create \
  --from registry.example.com/nemoclaw-sandbox:v0.1.0 \
  --name my-agent-1
# 後續的 policy / 網路 / lifecycle 都是 OpenShell 既有功能,歸 OpenShell 管
```

## 7. 為什麼不安裝 `nemoclaw` CLI

NemoClaw CLI 是 host-side operator console,~50+ 子命令,設計給「完整 lifecycle」用。
本 fork 用不到:

| nemoclaw CLI 提供 | 本 fork 需求 |
|---|---|
| `onboard`(唯一會 build image 的路徑) | **不需要** — shell 腳本跳過 |
| `sandbox <name> rebuild`(也會 build image) | **不需要** — sandbox lifecycle 由 OpenShell fork 管 |
| `agents / credentials / inference / channels / tunnel / gc` | **不需要** — OpenShell fork 自己有對應 CLI |
| image generation 本身 | **shell 腳本直接 `docker build` 就夠** |

原始 CLI 的 `onboard` / `sandbox rebuild` 內部是 transactional:
patch Dockerfile → `docker build` → `openshell sandbox create --from <ref>` 一氣呵成,
「image build」被刻意設計成不可分割的 step。本 fork 從外部 split 出 image-only
路徑(透過自己寫的 shell 腳本呼叫 `docker build`,而不是透過 CLI),比硬塞
nemoclaw CLI 乾淨。

## 8. 進階:reproducible build / pinned version(目前不需要,留作未來)

若日後要讓 build 完全 reproducible:

```bash
# 用 pinned tag(搭配 Dockerfile 內 ARG BASE_IMAGE 預設)而非 latest
export NEMOCLAW_SANDBOX_BASE_VERSION_TAG="v0.1.0"

# 或用 digest pinning(透過 docker inspect 抽 digest)
local pinned_digest
pinned_digest="$(docker inspect --format='{{index .RepoDigests 0}}' \
  ghcr.io/nvidia/nemoclaw/sandbox-base:latest 2>/dev/null || true)"
[[ -n "$pinned_digest" ]] && docker build --build-arg "BASE_IMAGE=$pinned_digest" ...

# 加 DOCKER_CONTENT_TRUST=1 對最終 image 做 signature 驗證
export DOCKER_CONTENT_TRUST=1
```

> 上述機制在 NemoClaw 上游是 `resolveSandboxBaseImage()` 的 fallback chain
> (`src/lib/sandbox-base-image.ts:430`)。因為本 fork 跳過 CLI,得手動複刻這層邏輯。

## 9. 上游對應原始碼(供日後查找)

| 主題 | 上游檔案 | 符號 / 行 |
|---|---|---|
| Image build pipeline 整體 | `src/lib/onboard/sandbox-dockerfile-patch-flow.ts` | `prepareSandboxDockerfilePatch` |
| 改 staged Dockerfile 的方法 | `src/lib/onboard/dockerfile-patch.ts` | `patchStagedDockerfile` (line 90) |
| Base image 解析 fallback chain | `src/lib/sandbox-base-image.ts` | `resolveSandboxBaseImage` (line 430) |
| `pullAndResolveBaseImageDigest` 包裝 | `src/lib/onboard/base-image.ts` | line 19 |
| 直接呼叫 `docker build` | `src/lib/adapters/docker/image.ts` | `dockerBuild` (line 15) |
| Build context 精選 | `src/lib/sandbox/build-context.ts` | `stageOptimizedSandboxBuildContext` (line 71) |
| Custom Dockerfile 入口 | `src/lib/onboard/build-context-stage.ts` | `stageCreateSandboxBuildContext` |
| OpenShell CLI `--from` 接 image ref | `nemoclaw/src/blueprint/runner.ts` | `actionApply` (line 690) |
| 舊 OpenShell-Community(無 NemoClaw) | `nemoclaw/src/index.ts` | `OpenClawPluginApi` / `PluginService` |

> 本 fork 不用 `patchStagedDockerfile` 跟 NemoClaw CLI 的理由見 §5 / §7。

## 10. 環境變數對照(本 fork 不內建,僅供日後參考)

全部可選,沒設就不替換(`patchStagedDockerfile` 行為);**本 fork 全部用 Dockerfile 預設**。

| 環境變數 | 對應 Dockerfile `ARG` | 用途 |
|---|---|---|
| `NEMOCLAW_SANDBOX_BASE_IMAGE_REF` | `ARG BASE_IMAGE` | 直接覆寫 base image ref(含 digest pinning) |
| `NEMOCLAW_PROVIDER` / CLI flag | `ARG NEMOCLAW_PROVIDER_KEY` | inference provider routing key |
| `NEMOCLAW_MODEL` | `ARG NEMOCLAW_MODEL` | 烘進 image 的主要 model |
| `NEMOCLAW_INFERENCE_BASE_URL` | `ARG NEMOCLAW_INFERENCE_BASE_URL` | 自定 inference endpoint |
| `CHAT_UI_URL` | `ARG CHAT_UI_URL` | 對外 dashboard URL |
| `NEMOCLAW_WEB_SEARCH_*` | `ARG NEMOCLAW_WEB_SEARCH_*` | web search 啟用 / provider |
| `NEMOCLAW_CONTEXT_WINDOW` / `_MAX_TOKENS` / `_REASONING` / `_INFERENCE_INPUTS` | 對應 ARGs | model metadata |
| `NEMOCLAW_OPENCLAW_OTEL*` | OpenTelemetry ARGs | 遙測設定 |
| `NEMOCLAW_EXTRA_AGENTS_JSON` | `ARG NEMOCLAW_EXTRA_AGENTS_JSON_B64` | 多 agent 設定 |
| `NEMOCLAW_HERMES_*` | Hermes 專用 ARGs | Hermes agent 工具 gateway |
| `NEMOCLAW_PROXY_HOST` / `_PORT` | `ARG NEMOCLAW_PROXY_*` | HTTP proxy |
| `NEMOCLAW_AGENT_TIMEOUT` / `_HEARTBEAT_EVERY` | 對應 ARGs | agent timeout / heartbeat |

## 11. TODO / 開放問題

- [ ] 建立 `scripts/build-sandbox-image.sh`(§5 提供 skeleton,待 commit)
- [ ] 確認要推到哪個 registry(內部 registry? GHCR personal namespace?)
- [ ] 替 OpenShell fork 那邊的 CI/Codespace 串接這個 build 步驟(可選)
- [ ] 決定是否要啟用 pinned version / digest pinning(§8)
- [ ] 決定是否要把 `agents/hermes/`、`agents/langchain-deepagents-code/` 的
      Dockerfile 一起帶進這份 fork(目前不需要,但若未來加 agent 就有用)
- [ ] **branding 議題**:`Dockerfile` 內的 `OPENCLAW_VERSION=2026.5.27` 是 hardcode,
      上游會更新;本 fork 跟 upstream 同步策略是 rebase 還是 cherry-pick?
- [ ] **security**:本 fork 用硬寫的 shell `cp -R`,沒有驗證 build context 大小;
      若日後 build context 變大要加 `du` warning 或改用 NemoClaw 的
      `stageOptimizedSandboxBuildContext`(但那要把 TS 跑起來,脫離 shell-only
      的初衷)

## 12. 修訂歷史

| 版本 | 日期 | 摘要 |
|---|---|---|
| 0.1 | 2026-06-29 | 初版, fork 剛建立且與 NVIDIA/NemoClaw `c6113be1` 完全同步 |
