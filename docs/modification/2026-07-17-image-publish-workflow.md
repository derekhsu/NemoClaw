<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# NemoClaw Image Publish Workflow — Fork 實際發布流程

> **日期**: 2026-07-17
> **Fork**: `derekhsu/NemoClaw`(本地 `/Volumes/extension_data/Project/NemoClaw-fork/`)
> **分支**: `feat/image-only-cli`(領先 `v0.0.83` 共 22 個 commit)
> **狀態**: 已執行 — OpenClaw 2026.6.10 runtime image 已推到 Docker Hub
> **前置文件**: [`2026-06-29-image-build-pipeline.md`](./2026-06-29-image-build-pipeline.md)(原始設計草案)、[`2026-06-29-image-only-cli-design.md`](../superpowers/specs/2026-06-29-image-only-cli-design.md)(CLI 設計)

## 1. 摘要

本文件記錄本 fork 實際使用的 image 發布流程:從 `nemoclaw image build` CLI
建置單一架構映像、推到 Docker Hub 架構特定 tag、用 `docker buildx imagetools`
合併成 multi-arch manifest,到下游 `clawshell-gateway` 透過完整 image ref 載入。

原始設計草案(2026-06-29)規劃用 shell 腳本 `scripts/build-sandbox-image.sh`
呼叫 `docker build`,但後來實作了 `nemoclaw image build` CLI(見
`feat/image-only-cli` 分支),提供 staged build context、JSON metadata、
`--platform`、`--build-arg`、`--base-image` 等支援,比 shell 腳本更完整。
本文件取代原始草案的 §5-§7。

## 2. 前置條件

| 項目 | 需求 | 驗證指令 |
|------|------|----------|
| Docker daemon | 執行中(BuildKit 支援) | `docker version --format '{{.Server.Os}}/{{.Server.Arch}}'` |
| Base image | `ghcr.io/nvidia/nemoclaw/sandbox-base:latest` 在本地 | `docker images ghcr.io/nvidia/nemoclaw/sandbox-base` |
| nemoclaw CLI | 已 `npm link`、`dist/` 已建置 | `nemoclaw --version`(應顯示 `v0.0.83-XX-gXXXXX`) |
| Docker Hub 登入 | 對 `docker.io` 有 auth | `docker login -u derekhsu`(或已存在 `~/.docker/config.json`) |
| 工作目錄 | NemoClaw-fork 根目錄 | `cd /Volumes/extension_data/Project/NemoClaw-fork` |

### 取得 base image

若本地沒有 base image,擇一:

```bash
# 路 A:從 GHCR pull(需公開映像可達)
docker pull ghcr.io/nvidia/nemoclaw/sandbox-base:latest

# 路 B:本地 build base(Dockerfile.base 預設 OPENCLAW_VERSION=2026.6.10)
docker build -f Dockerfile.base -t ghcr.io/nvidia/nemoclaw/sandbox-base:latest .
```

## 3. 建置 CLI(若 dist/ 過時)

`nemoclaw` 經 `npm link` 指向專案根目錄,載入 `dist/` 編譯產物。
若 `src/` 有改動未編譯,需重新建置:

```bash
cd /Volumes/extension_data/Project/NemoClaw-fork
npm run build:cli
```

驗證 image 命令已編譯:

```bash
ls dist/commands/image/build.js dist/lib/image/build.js
```

## 4. Stage Build Context(可選,用於檢查)

正式 build 前可先 stage build context 檢查內容,不跑 docker build:

```bash
nemoclaw image stage \
  --agent openclaw \
  --output /tmp/nemoclaw-image-stage-check \
  --json
```

輸出 JSON metadata 含 `contextPath`、`contentHash`、`sourceCommit`。
檢查重點:

- `Dockerfile`、`Dockerfile.base`、`nemoclaw-blueprint/`、`agents/openclaw/`、`scripts/` 完整存在
- `node_modules/`、`.git/` 已排除
- 無敏感檔案(`.env`、`.npmrc`、`*.key` 等)
- Dockerfile 所有 `COPY` 指令來源都存在

## 5. 建置單一架構映像

`nemoclaw image build` 每次只 build 一個 `--platform` 架構。
為支援 multi-arch,分別 build amd64 和 arm64 到獨立 tag。

### 5.1 Build amd64(在 ARM Mac 上用 QEMU emulation,較慢)

```bash
cd /Volumes/extension_data/Project/NemoClaw-fork
nemoclaw image build \
  --agent openclaw \
  --tag local/openclaw-runtime:2026.6.10-amd64 \
  --platform linux/amd64 \
  --json
```

### 5.2 Build arm64(在 ARM Mac 上 native,較快)

```bash
nemoclaw image build \
  --agent openclaw \
  --tag local/openclaw-runtime:2026.6.10-arm64 \
  --platform linux/arm64 \
  --json
```

### 5.3 驗證架構

```bash
docker image inspect local/openclaw-runtime:2026.6.10-amd64 --format '{{.Architecture}} | {{.Os}}'
docker image inspect local/openclaw-runtime:2026.6.10-arm64 --format '{{.Architecture}} | {{.Os}}'
```

應分別輸出 `amd64 | linux` 和 `arm64 | linux`。

### 5.4 關於 hadolint 警告

build 過程可能出現 `SecretsUsedInArgOrEnv` 警告(如 `NEMOCLAW_PROVIDER_KEY`、
`NEMOCLAW_DISABLE_DEVICE_AUTH`),這些是上游 Dockerfile 已知的非敏感佔位符
(build-time placeholder,非真 secret),可忽略,不影響 build 結果。

## 6. 推到 Docker Hub

### 6.1 Tag 映像為 Docker Hub repo 名稱

```bash
docker tag local/openclaw-runtime:2026.6.10-amd64 derekhsu/openshell-openclaw:2026.6.10-amd64
docker tag local/openclaw-runtime:2026.6.10-arm64 derekhsu/openshell-openclaw:2026.6.10-arm64
```

### 6.2 Push 架構特定 tag

```bash
docker push derekhsu/openshell-openclaw:2026.6.10-amd64
docker push derekhsu/openshell-openclaw:2026.6.10-arm64
```

### 6.3 合併 multi-arch manifest

`docker manifest create` 不接受 buildx 產生的 manifest list 作為來源
(buildx image 已含 amd64 + unknown attestation),改用 `docker buildx imagetools`:

```bash
# 建立 2026.6.10 multi-arch manifest
docker buildx imagetools create -t derekhsu/openshell-openclaw:2026.6.10 \
  derekhsu/openshell-openclaw:2026.6.10-amd64 \
  derekhsu/openshell-openclaw:2026.6.10-arm64

# 同樣做 latest
docker buildx imagetools create -t derekhsu/openshell-openclaw:latest \
  derekhsu/openshell-openclaw:2026.6.10-amd64 \
  derekhsu/openshell-openclaw:2026.6.10-arm64
```

### 6.4 驗證 multi-arch manifest

```bash
docker manifest inspect derekhsu/openshell-openclaw:2026.6.10
```

應看到 `manifests` 陣列含 `linux/amd64` 和 `linux/arm64` entry
(另含兩個 `unknown/unknown` attestation entry,可忽略)。

## 7. 在 clawshell-gateway 載入

clawshell-gateway 透過 OpenShell SDK 建立 sandbox,image 來源由
`blueprint.sandbox_source` 欄位決定。`clawshell_lib/lib.py` 的
`_resolve_image_source` 邏輯:source 含 `/`、`:`、`.` 視為完整 image ref,
不拼 community registry 前綴。

### 7.1 設定 blueprint

```python
# 完整 image ref(推薦)
sandbox_source = "derekhsu/openshell-openclaw:2026.6.10"
# 或
sandbox_source = "derekhsu/openshell-openclaw:latest"
```

x86 server 自動 pull amd64,ARM 主機(M4 Mac、Graviton)自動 pull arm64,
不需指定架構。

### 7.2 ENTRYPOINT 衝突注意事項

NemoClaw 映像 ENTRYPOINT 為 `/usr/local/bin/nemoclaw-start`(啟動 gateway)。
clawshell-gateway 的 `create_openclaw_sandbox` 在 sandbox ready 後再跑
`openclaw gateway run`,可能重複啟動 gateway。需確認 OpenShell 是否覆寫
ENTRYPOINT,或調整啟動流程。這是待驗證的整合議題。

## 8. 與原始設計草案的差異

| 項目 | 原始草案(2026-06-29) | 實際流程(本文件) |
|------|----------------------|-------------------|
| Build 方式 | shell 腳本 `scripts/build-sandbox-image.sh` | `nemoclaw image build` CLI |
| Build context | shell `cp -R` 精選 | CLI `stageImageBuildContext` + `copyBuildContextDir` |
| 平台支援 | 單一架構(host arch) | `--platform` flag 支援 amd64/arm64 |
| Multi-arch | 無 | `docker buildx imagetools create` |
| Metadata | 無 | JSON output(contentHash、sourceCommit、digest) |
| Base image 解析 | 手動複刻 `resolveSandboxBaseImage` | CLI 內建 `defaultResolveBaseImage` |
| 發布目標 | 內部 registry(未決定) | Docker Hub `derekhsu/openshell-openclaw` |

原始草案的 §5(shell 腳本 skeleton)、§7(不安裝 nemoclaw CLI 的理由)
已被本文件取代。§2(架構分界)、§3(既有檔案)、§4(build context 精選)、
§9(上游對應原始碼)、§10(環境變數對照)仍具參考價值。

## 9. 已發布的映像

截至 2026-07-17,Docker Hub `derekhsu/openshell-openclaw` 含以下 tag:

| Tag | 類型 | 內容 |
|-----|------|------|
| `2026.6.10` | multi-arch manifest | linux/amd64 + linux/arm64 |
| `latest` | multi-arch manifest | 同 `2026.6.10` |
| `2026.6.10-amd64` | 單架構 | linux/amd64 |
| `2026.6.10-arm64` | 單架構 | linux/arm64 |

映像內容:OpenClaw 2026.6.10 + NemoClaw plugin + gateway-control +
sandbox-init + network policies,ENTRYPOINT `/usr/local/bin/nemoclaw-start`,
USER `sandbox`,WORKDIR `/sandbox`。

## 10. 修訂歷史

| 版本 | 日期 | 摘要 |
|------|------|------|
| 0.1 | 2026-07-17 | 初版,記錄 OpenClaw 2026.6.10 multi-arch 發布流程 |
