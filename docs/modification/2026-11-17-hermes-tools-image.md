<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Hermes Tools 映像 — Fork 設計與使用說明

> **日期**: 2026-11-17
> **Fork**: `derekhsu/NemoClaw`
> **Issue**: [#74](https://github.com/derekhsu/NemoClaw/issues/74)
> **狀態**: 第一階段(映像、驗證與發布流程)。Hermes browser 工具的啟用與網路政策是下一階段。

## 1. 摘要

Hermes tools 映像是從已發布的 Hermes 映像(OpenShell 0.1.x)衍生的映像。
它預先安裝與 OpenClaw tools 映像相同的文件、PDF/OCR、影音、瀏覽器與 workspace 工具。
agent 在 sandbox 內處理這些工作時,不需要在執行期間下載套件。

| 項目 | Hermes 映像 | Hermes tools 映像 |
|------|-------------|-------------------|
| 來源 | `agents/hermes-01x/Dockerfile.base` + `Dockerfile` | `agents/hermes-01x/Dockerfile.tools`,以 Hermes 映像為 base |
| Hermes 版本 | 由建置時的 pin 決定 | 與 base 相同,不升級 |
| 執行設定 | — | `User`、`Entrypoint`、`Cmd`、`WorkingDir`、`Env`、`Healthcheck` 與 base 完全相同 |
| 額外工具 | 無 | 與 OpenClaw tools 映像相同,清單見 [OpenClaw tools 映像說明](2026-10-31-openclaw-tools-image.md) 第 3 節 |
| layer 數 | base 的 layer 數 | base 加 8;發布前上限 115 |

目前的 base 是 `docker.io/derekhsu/openshell-hermes:openshell01x-hermes-0.21.3-2026.11.13`,
index digest 為 `sha256:1b0f2030fec36118c9124c0f28a5e435f61bfb4f502f39e942e365873e8c8265`。
`agents/hermes-01x/Dockerfile.tools` 的 `BASE_IMAGE` 同時寫出 tag 與 digest;建置以 digest 為準,tag 用來產生發布 tag。

只提供 OpenShell 0.1.x 版本。OpenShell 0.0.x 的 Hermes 映像(`agents/hermes/`)預定淘汰,不提供 tools 映像。

這是本 fork 的功能,不是 NVIDIA 官方支援的產品。
既有部署不會自動改用 tools 映像;部署端必須明確選用。

## 2. 與 OpenClaw tools 映像的差異

套件清單、下載檔案與 fixture 都與 OpenClaw tools 映像共用,放在 `tools/openclaw-tools-image/`。
修改那裡的清單會同時影響兩個映像,兩個 verify workflow 都會執行。

| 項目 | OpenClaw tools 映像 | Hermes tools 映像 |
|------|---------------------|-------------------|
| Python 套件 | 系統 Python,`python3` 即可使用 | 系統 Python,要用 `/usr/bin/python3`(見 3.1 節) |
| himalaya | 執行檔與 v2 skill | 只有執行檔,沒有 skill |
| 瀏覽器工具設定 | 0.1.x 映像在 `openclaw.json` 開啟 browser 工具 | 不設定(下一階段) |

## 3. 使用方式

### 3.1 Python

映像的 `PATH` 把 `/opt/hermes/.venv/bin` 放在 `/usr/bin` 前面,Hermes terminal 也保留這個順序。
所以 `python3` 是 Hermes 自己的 virtual environment,看不到 tools 的 Python 套件。

tools 的 Python 套件裝在系統 Python,請用完整路徑執行:

```bash
/usr/bin/python3 -c 'import openpyxl, pdfplumber, pytesseract'
/usr/bin/python3 -m markitdown file.pptx
```

這樣設計的原因:

- 改 `PATH` 會讓映像的 `Env` 與 base 不同,也會讓 Hermes 本身改用系統 Python。
- 把套件裝進 Hermes 的 virtual environment,會與 Hermes 鎖定的 `anthropic`、`mcp`、`pyyaml` 等版本衝突。

fixture 的 `hermes_python` 檢查會確認 `python3` 仍是 Hermes 的 virtual environment,而且 tools 套件沒有裝進去。

### 3.2 其他工具

Node.js 套件、LibreOffice、officecli、OCR、pandoc、ImageMagick、ffmpeg、pnpm、p5.js 的位置與用法,
與 [OpenClaw tools 映像說明](2026-10-31-openclaw-tools-image.md) 第 4 節相同。

### 3.3 瀏覽器

映像包含 Debian Chromium(`/usr/lib/chromium/chromium`)與 Playwright 的 headless shell。
Hermes 的 browser 工具透過 base 映像中的 `agent-browser` 操作瀏覽器。
fixture 的 `agent_browser` 檢查確認它能用這個 Chromium 開頁並讀取內容。

這個階段沒有設定 Hermes browser 工具,也沒有開放瀏覽器的網路政策。
下一階段會比照 OpenClaw,以 `--no-sandbox --no-zygote` 等參數啟動 Chromium:
OpenShell 的 seccomp 不允許 Chromium 自己的 sandbox 建立 user namespace。
外層仍由 OpenShell 的 seccomp、Landlock 與 network policy 隔離。

## 4. 驗證

`Images / Hermes Tools Verify`(`.github/workflows/hermes-tools-image-verify.yaml`)在 amd64 與 arm64 原生 runner 上執行,不推送映像:

| 步驟 | 內容 |
|------|------|
| `check-image.sh ... hermes` | 執行設定、`hermes --version` 與 base 相同;新增的 setuid、setgid 或 file capability 檔案必須列在 `tools/openclaw-tools-image/privileged-files-added.txt` |
| `check-tools-start.sh` | base 與 tools 映像以相同限制啟動(無網路、`--cap-drop ALL`、`no-new-privileges`),容器狀態、啟動輸出、`/tmp/nemoclaw-start.log` 與 process 清單必須相同 |
| `run-fixtures.sh ... hermes` | 以 sandbox 使用者、唯讀 root、無 capability、無網路執行共用 fixture;OpenClaw 專屬的 `himalaya_skill_override` 與 `browser_config` 記為 `SKIP`,`himalaya_journey` 略過 skill 檢查 |
| Trivy | tools layer 不得新增可修正的 CRITICAL 或 HIGH 弱點 |

`check-tools-start.sh` 用一般 Docker 執行,只涵蓋映像自己的啟動設定。
gateway 與 API runtime 由 OpenShell 啟動,要在 OpenShell 0.1.7 sandbox 中驗收(見第 6 節)。

## 5. 發布與選用

在 GitHub Actions 手動執行 `Images / Hermes Tools OpenShell 0.1.x`(`.github/workflows/hermes-01x-tools-image.yaml`),
從 `feat/image-only-cli` 分支執行,輸入 tools 發布編號 `n`。

- tag 是 `<base tag>-tools.<n>`,例如 `openshell01x-hermes-0.21.3-2026.11.13-tools.1`,另有 `-amd64` 與 `-arm64` tag。
- 推送到 `docker.io/derekhsu/openshell-hermes`,不寫入 base 映像的 tag。
- 每個架構通過第 4 節的檢查後,才以 digest 推送該架構的映像。兩個架構都通過後才寫入 tag。
- 任一架構失敗時不寫入 tag;已推送但沒有 tag 的 digest 會列在 workflow summary。
- 發布前檢查 layer 數不超過 115(#70)。

`scripts/hermes-tools-image-release.sh` 檢查發布規則,`test/hermes-tools-image-release.test.ts` 測試這些規則:

- 只在 `derekhsu/NemoClaw` 的 `feat/image-only-cli` 分支執行。
- `BASE_IMAGE` 必須是 `docker.io/derekhsu/openshell-hermes` 的 `openshell01x-hermes-*` tag,並以 digest 固定。
- tag 已存在時拒絕,不覆寫。

更新 base:Hermes 映像發布新版後,把新的 tag 與 index digest 寫進 `Dockerfile.tools` 的 `BASE_IMAGE`,合併後再發布 tools 映像,`n` 從 1 開始。

部署端(例如 ClawShell)要以 digest 選用 tools 映像。

## 6. 安全考量與尚未完成的驗收

- **新增的特權檔案**:LibreOffice 的相依套件帶入 `dbus-daemon-launch-helper`(setuid)與 `gst-ptp-helper`(file capability)。process 設定 `no_new_privs` 時兩者都不會取得額外權限,fixture 與啟動比對都在這個條件下執行;OpenShell sandbox 內的設定要在實機驗收時確認。其他新增的特權檔案會讓 `check-image.sh` 失敗。
- **API profile 不受影響**:API profile 的政策拒絕 terminal 與 browser 工具,Landlock 也只開放部分路徑,新工具只在預設 profile 使用。
- **base 的安全檢查**:Hermes base 沒有 tmux,受控的 expat 版本(`libexpat1=2.8.3-1`)也與 OpenClaw base(2.9.0)不同,所以 `base_security_checks` 只對 OpenClaw 檢查這兩項;Hermes 的 expat 版本由 `controlled_packages` 依 base 的 `security-packages.txt` 檢查。
- **尚未完成**:在 OpenShell 0.1.7 sandbox 以 tools 映像建立 sandbox,確認到 `running`、managed startup 與 API runtime 與標準映像相同,確認 sandbox process 的 `NoNewPrivs` 為 1(`/proc/self/status`),並記錄 LibreOffice 同時轉檔時的 process 峰值(#32)。
