<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Hermes Tools 映像 — Fork 設計與使用說明

> **日期**: 2026-11-17
> **Fork**: `derekhsu/NemoClaw`
> **Issue**: [#74](https://github.com/derekhsu/NemoClaw/issues/74)、[#79](https://github.com/derekhsu/NemoClaw/issues/79)、[#83](https://github.com/derekhsu/NemoClaw/issues/83)
> **狀態**: `tools.1` 已發布並在 OpenShell 0.1.7 sandbox 驗收。第二階段(`tools.2` 起)開啟 Hermes browser 工具。`tools.2` 的 Dashboard 拿不到模型設定,`tools.3` 修正(#79)。`tools.4`(尚未發布)讓沒有 `config.yaml` 的具名 profile 也使用內建 browser 工具(#83)。

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
| 瀏覽器工具設定 | 0.1.x 映像在 `openclaw.json` 開啟 browser 工具 | `config.yaml` 設 `browser.backend: "off"`,Chromium 參數放在 `/etc/chromium.d`(見 3.3 節) |

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
從 `tools.2` 起,Hermes 的 browser 工具(`browser_navigate`、`browser_snapshot`、`browser_click` 等)透過 base 映像中鎖定版本的 `agent-browser` 操作這個 Chromium,執行期間不下載任何套件。

| 設定 | 位置 | 原因 |
|------|------|------|
| `browser.backend: "off"` | `/sandbox/.hermes/config.yaml`;`tools.3` 起也寫進 managed policy `/usr/local/share/nemoclaw/hermes-managed-policy.json`,並列入受管路徑;`tools.4` 起 Hermes 原始碼的預設值也是 `off`(見下方說明) | 沒有設定時,只要 `PATH` 上有 `uvx`,Hermes 就改用 Browser Use CLI:模型只拿到 `browser_exec`,第一次使用時以 `uvx browser-use` 從 PyPI 下載未鎖版本的套件。`off` 讓 Hermes 使用內建的 browser 工具 |
| `--no-sandbox --no-zygote --disable-gpu` | `/etc/chromium.d/nemoclaw-openshell` | agent-browser 啟動 `/usr/bin/chromium`,這個 Debian 包裝腳本會讀 `/etc/chromium.d` 的參數再執行 `/usr/lib/chromium/chromium`。OpenShell 的 seccomp 不允許 Chromium 自己的 sandbox 與 zygote 建立 user namespace,沒有這些參數時 Chromium 會立刻結束(`CDP response channel closed`)。Hermes Agent v0.21.3 只在 root 或 Docker 下才會自己加 `--no-sandbox`(`tools/browser_tool_session.py`) |

Dashboard 使用自己的 profile `dashboard-home`。sandbox 每次啟動時,`start.sh` 會以 `seed-hermes-dashboard-config.py` 把 gateway `config.yaml` 的模型設定與受管路徑複製到這個 profile;gateway 設定中每個受管區段必須與 managed policy 完全相同,否則整份不複製。`tools.2` 只改了 `config.yaml`,`browser` 區段因此與 policy 不同,Dashboard 的 CHAT 與 Models 頁沒有模型(`No inference provider configured`)。`tools.3` 同時更新 policy,Dashboard 也拿到模型與 `browser.backend: "off"`。

修改 `config.yaml` 後,建置步驟以 base 映像相同的方式重算 `/etc/nemoclaw/hermes.config-hash`(與 `/sandbox/.hermes/.config-hash`),Hermes 啟動時的設定完整性檢查因此仍會通過。MCP 設定沒有改變,MCP digest 維持原值。接著以 sandbox 使用者重跑 base 映像建置時的 dashboard policy 檢查:同步腳本必須接受 gateway 設定,產生的 Dashboard 設定要有 `model:`,每個受管路徑(包含 `browser.backend`)都要與 policy 相同。

具名 profile(`hermes profile create` 建立)沒有 `config.yaml`。Hermes 的 `get_browser_backend()`(`tools/browser_use_cli.py`)直接讀 profile 的 `config.yaml`,不合併 `DEFAULT_CONFIG`,所以 `tools.2` 與 `tools.3` 的這類 profile 讀到空值,又因 `PATH` 上有 `uvx` 而改用 Browser Use CLI。`tools.4` 起,`configure-tools-browser.py` 多接收 Hermes 原始碼目錄(`/opt/hermes`),並修改兩個檔案:

- `tools/browser_use_cli.py`:沒有 `browser.backend` 時讀成 `off`。
- `hermes_cli/config_defaults.py`:`DEFAULT_CONFIG` 的 `browser.backend` 預設值改為 `off`。合併 `DEFAULT_CONFIG` 的程式(例如 `load_config_readonly()` 與 `profile-policy` 檢查)因此也讀到 `off`。web backend 的預設值不變。

每項修改只取代一行完全相符的內容;該行不存在或已被修改時,腳本失敗。腳本先檢查所有檔案,再寫入任何檔案。profile 自己設定了 `browser.backend` 時(包含明確設成 `""` 或 `browser-use`),保留該值。

建置步驟在執行腳本前以 `sha256sum -c` 比對這兩個檔案與 `Dockerfile.tools` 記錄的 hash(`BASE_IMAGE` 中這兩個檔案的 hash),不符時建置失敗;執行後以 `py_compile` 重新產生這兩個 module 的 bytecode。Dashboard policy 檢查之後,建置步驟建立具名 profile `nemoclaw-policy-probe`,確認它沒有 `config.yaml`,接著執行 base 映像的 `profile-policy` 檢查(每個受管路徑,包含 `browser.backend`),並確認 `get_browser_backend()` 為 `off`、不是 Browser Use CLI 模式。

Hermes Agent v0.21.3 以本機 Chromium 執行時不做私有位址檢查(`tools/browser_tool.py` 的 `_url_policy_error`),所以 OpenShell policy DNS 回傳的 `198.18.0.0/15` 合成 IP 不會被擋;雲端 metadata 位址(例如 `169.254.169.254`)仍一律拒絕。這點與 OpenClaw 不同,不需要設定 SSRF 例外。

要讓瀏覽器開網站,sandbox 的 network policy(由 ClawShell 管理)需要一條規則:

- binary:`/usr/lib/chromium/chromium`(Python Playwright 另需 `/usr/local/share/nemoclaw-tools/ms-playwright/*/*/chrome-headless-shell`)。
- endpoint:要開的網站,例如 `example.com` 的 443,設 `tls: skip`。OpenShell 檢查 TLS 時會用自己的 CA 重新簽發憑證,Chromium 不信任,會出現 `ERR_CERT_AUTHORITY_INVALID`。

沒有規則的網站會得到 `net::ERR_NETWORK_ACCESS_DENIED`。

關閉 Chromium 自己的 sandbox 代表:網頁的 renderer 被攻破時,攻擊者取得的是 sandbox 使用者(uid 998)在這個 sandbox 內的權限。外層仍由 OpenShell 的 seccomp、Landlock、`no_new_privs` 與 network policy 隔離,API profile 也一律拒絕 browser 工具。

`tools.1` 沒有這兩項設定:映像有 `uvx`,Hermes 因此走 Browser Use CLI,模型拿到的是 `browser_exec`,第一次使用時要以 `uvx browser-use` 從 PyPI 下載套件;即使改用內建 browser 工具,Chromium 沒有上述參數也無法啟動。需要 browser 工具時請改用 `tools.2` 以後的版本。

## 4. 驗證

`Images / Hermes Tools Verify`(`.github/workflows/hermes-tools-image-verify.yaml`)在 amd64 與 arm64 原生 runner 上執行,不推送映像:

| 步驟 | 內容 |
|------|------|
| `check-image.sh ... hermes` | 執行設定、`hermes --version` 與 base 相同;新增的 setuid、setgid 或 file capability 檔案必須列在 `tools/openclaw-tools-image/privileged-files-added.txt` |
| `check-tools-start.sh` | base 與 tools 映像以相同限制啟動(無網路、`--cap-drop ALL`、`no-new-privileges`),容器狀態、啟動輸出、`/tmp/nemoclaw-start.log` 與 process 清單必須相同 |
| `run-fixtures.sh ... hermes` | 以 sandbox 使用者、唯讀 root、無 capability、無網路執行共用 fixture;OpenClaw 專屬的 `himalaya_skill_override` 與 `browser_config` 記為 `SKIP`,`himalaya_journey` 略過 skill 檢查。`hermes_browser_backend` 確認 `browser.backend` 為 `off`、設定 hash 相符、Hermes 提供內建 browser 工具;`hermes_dashboard_seed` 以映像內的 policy 與 `config.yaml` 執行 Dashboard 設定同步,產生的設定要有模型,`browser.backend` 為 `off`;`agent_browser` 不帶任何 agent-browser 設定開頁,並確認 Chromium 帶著 `/etc/chromium.d` 的參數執行;`hermes_profile_browser` 建立沒有 `config.yaml` 的具名 profile,並把記錄呼叫的 `uvx` 放在 `PATH` 最前面,確認 `browser.backend` 為 `off`、不是 Browser Use CLI 模式、browser 工具組有 `browser_navigate` 與 `browser_snapshot` 而沒有 `browser_exec`,再以 `browser_navigate` 開啟本機檔案頁面並檢查 snapshot;`uvx` 被呼叫時失敗 |
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

更新 base:Hermes 映像發布新版後,把新的 tag 與 index digest 寫進 `Dockerfile.tools` 的 `BASE_IMAGE`,合併後再發布 tools 映像,`n` 從 1 開始。更新 `BASE_IMAGE` 時,維護者必須先確認 `configure-tools-browser.py` 的兩項修改仍適用於新 base 的 `tools/browser_use_cli.py` 與 `hermes_cli/config_defaults.py`,再更新 `Dockerfile.tools` 中這兩個檔案的 hash。hash 不符時建置失敗。

部署端(例如 ClawShell)要以 digest 選用 tools 映像。

## 6. 安全考量與尚未完成的驗收

- **新增的特權檔案**:LibreOffice 的相依套件帶入 `dbus-daemon-launch-helper`(setuid)與 `gst-ptp-helper`(file capability)。process 設定 `no_new_privs` 時兩者都不會取得額外權限;fixture 與啟動比對都在這個條件下執行,OpenShell sandbox 內的 process 也實測為 `NoNewPrivs: 1`(見下方實機驗收)。其他新增的特權檔案會讓 `check-image.sh` 失敗。
- **API profile 不受影響**:API profile 的政策拒絕 terminal 與 browser 工具,Landlock 也只開放部分路徑,新工具只在預設 profile 使用。API profile 的 `config.yaml` 由 managed policy 的受管區段產生,`tools.3` 起 `browser` 區段也帶有 `backend: "off"`,但 browser 工具仍被拒絕。
- **沒有 `config.yaml` 的具名 profile**:`tools.2` 與 `tools.3` 中,這類 profile 的 `browser.backend` 是未設定,Hermes 改用 Browser Use CLI;base 映像的 `profile-policy` 檢查若在這兩版重跑,會因此不通過。`tools.4` 起,Hermes 原始碼的預設值是 `off`(見 3.3 節),建置步驟在 tools 映像重跑 `profile-policy` 檢查,fixture 的 `hermes_profile_browser` 也確認不會呼叫 `uvx`。profile 自己設定的 `browser.backend` 仍然優先,設成 `""` 或 `browser-use` 時 Hermes 仍會改用 Browser Use CLI。base 映像(`openshell-hermes`)沒有這項修改。
- **base 的安全檢查**:Hermes base 沒有 tmux,受控的 expat 版本(`libexpat1=2.8.3-1`)也與 OpenClaw base(2.9.0)不同,所以 `base_security_checks` 只對 OpenClaw 檢查這兩項;Hermes 的 expat 版本由 `controlled_packages` 依 base 的 `security-packages.txt` 檢查。
- **實機驗收**(`tools.1`,OpenShell 0.1.7、Podman、arm64,經 ClawShell 建立):sandbox 到 `running`,API 對話與 `upload_file` 上傳下載正常;`nemoclaw-start`、Hermes gateway、API runtime 與 MCP supervisor 的 `NoNewPrivs` 皆為 1;4 個 LibreOffice 同時轉檔時 sandbox 內 process 峰值 31(#32 的上限 512)。
