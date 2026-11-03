<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# OpenClaw Tools 映像 — Fork 設計與使用說明

> **日期**: 2026-10-31
> **Fork**: `derekhsu/NemoClaw`
> **分支**: `codex/issue-16-tools-image`(基於 `feat/image-only-cli`,commit `70ff5c849`)
> **狀態**: #16 範圍內的 Phase 1–5 完成,維護者已於 2026-11-01 確認文件與交接;Task 3.4、5.3 移交 #18,部署驗收尚未完成;尚未發布映像
> **Issue**: [#16](https://github.com/derekhsu/NemoClaw/issues/16)(映像與發布)、[#18](https://github.com/derekhsu/NemoClaw/issues/18)(部署驗收)
> **Track**: `conductor/tracks/openclaw_tools_image_20261030/`

## 1. 摘要

OpenClaw tools 映像是從已發布的標準映像衍生的映像。
它預先安裝文件、PDF/OCR、影音、workspace、瀏覽器與 skill 需要的套件。
agent 在 sandbox 內處理這些工作時,不需要在執行期間下載套件。

| 項目 | 標準映像 | Tools 映像 |
|------|----------|------------|
| 來源 | `Dockerfile.base` + `Dockerfile` | `Dockerfile.tools`,以標準映像為 base |
| OpenClaw 與 Node.js 版本 | 由建置時的 pin 決定 | 與 base 標準映像相同,不升級 |
| 執行設定 | — | `User`、`Entrypoint`、`Cmd`、`WorkingDir`、`Env`、`Healthcheck` 與 base 完全相同 |
| 額外工具 | 無 | 第 3 節列出的套件 |
| 映像大小 | 約 2.3 GB | 約 5.6 GB(amd64 增加 3.36 GB,arm64 增加 3.26 GB) |

目前的 base 是 `docker.io/derekhsu/openshell-openclaw:2026.9.2-r4`,
index digest 為
`sha256:e654a0695522944ec43c7eeabb6aca9472f385c117a206e5000f8a61b1b96056`。
`Dockerfile.tools` 以這個 digest 作為預設 `BASE_IMAGE`。
不使用 `2026.9.2` tag,因為它指向較舊的發布產物。

這是本 fork 的功能,不是 NVIDIA 官方支援的產品。
fork 維護者負責工具清單、相容性、安全更新與重新建置。
既有部署不會自動改用 tools 映像;部署端必須明確選用。

## 2. 實作狀態

| 階段 | 內容 | 狀態 |
|------|------|------|
| Phase 1 | 檢查 base、固定版本、相依性解析、決策 | 完成 |
| Phase 2 | 文件與影音工具、`Dockerfile.tools` | 完成 |
| Phase 3 | Chromium、Python Playwright、離線前端建置 | 完成 |
| Phase 4 | 發布 workflow | 完成 |
| Phase 5 | 文件定稿、審查與交接 | 完成,維護者已於 2026-11-01 人工確認 |
| #18 | 實際部署環境驗收 | 等 #16 發布第一個 tools 映像 |

第 4、5 節的安裝位置、使用方式與離線行為已在 GitHub Actions 原生 amd64 與 arm64 runner 上驗證。
第 7 節的發布規則已由單元測試與 CI 驗證,但尚未實際推送映像。OpenClaw 瀏覽器工具與實際 sandbox policy 由 #18 驗證。

維護者已審閱文件與驗證證據,並[確認 Phase 5 文件與交接完成](https://github.com/derekhsu/NemoClaw/pull/20#issuecomment-6555856173)。
實際部署、網路政策驗收與冷啟動預算仍由 #18 追蹤。

## 3. 工具清單

所有固定版本都在 `tools/openclaw-tools-image/`。
Debian 套件在 amd64 與 arm64 上的版本相同。

### 3.1 Debian 套件(`apt-packages.txt`、`apt-packages-browser.txt`)

以 `--no-install-recommends` 安裝。
`jq=1.8.2-1` 與 `libsqlite3-0=3.46.1-7+deb13u2` 沿用 base 的受控版本。

| 類別 | 套件與版本 |
|------|------------|
| Office | `libreoffice-core`、`libreoffice-writer`、`libreoffice-calc`、`libreoffice-impress` `4:25.2.3-2+deb13u8` |
| PDF 與轉檔 | `pandoc 3.1.11.1+ds-2`、`poppler-utils 25.03.0-5+deb13u4`、`qpdf 12.2.0-1`、`ghostscript 10.05.1~dfsg-1+deb13u3` |
| OCR | `tesseract-ocr 5.5.0-1+b1`;語言資料 `eng`、`chi-tra`、`chi-sim` `1:4.1.0-2` |
| 圖片與影音 | `imagemagick 8:7.1.1.43+dfsg1-1+deb13u13`(提供 `magick`)、`ffmpeg 7:7.1.5-0+deb13u1`(含 `ffprobe`)、`libimage-exiftool-perl 13.25+dfsg-1` |
| 瀏覽器 | `chromium 156.0.8078.79-1~deb13u1`,固定在 `apt-packages-browser.txt` |
| 字型 | `fontconfig 2.15.0-2.3`、`fonts-noto-cjk 1:20240730+repack1-1`、`fonts-liberation 1:2.1.5-3`、`fonts-dejavu-core 2.37-8` |
| Workspace | `zip 3.0-15+deb13u1`、`unzip 6.0-29+deb13u1`、`ripgrep 14.1.1-1+b4`、`sqlite3 3.46.1-7+deb13u2` |
| 執行期函式庫 | `libicu76 76.1-4`(officecli 需要) |

### 3.2 下載的檔案(`artifacts.lock`)

每個檔案都以 SHA-256 校驗。校驗不符時建置失敗。

| 名稱 | 版本 | 架構 |
|------|------|------|
| officecli | 1.0.160 | amd64、arm64 |
| yq(Mike Farah) | 4.54.1 | amd64、arm64;以 Go 1.27.3 與 `golang.org/x/net` 0.60.0 從原始碼建置 |
| p5.js(`p5.min.js`) | 1.7.0 | 不分架構 |
| Text-CharWidth 原始碼 | 0.04 | 建置階段重新編譯,見 6.3 節 |
| pnpm | 12.16.1 | 不分架構 |
| Chrome Headless Shell | 156.0.8078.4(Playwright revision 1248) | amd64、arm64 |
| shadcn 元件 | `anthropics/skills` 固定 revision 的 `web-artifacts-builder` | 不分架構;Apache-2.0,授權檔在模板內 |

### 3.3 Python 套件(`python/requirements.in`)

20 個直接相依套件,另將 `packaging` 固定為 25.0。`python/requirements.lock` 是含 hash 的 lock,只用 wheel。
基底映像的 Debian `python3-packaging` 是 25.0,pip 無法取代 Debian 安裝的套件,所以 lock 沿用相同版本。

| 類別 | 套件 |
|------|------|
| 文件 | `pypdf 6.21.4`、`pdfplumber 0.11.10`、`reportlab 5.1.0`、`pytesseract 0.3.13`、`pdf2image 1.17.0`、`openpyxl 3.1.5`、`pandas 3.1.0`、`markitdown[pptx] 0.1.9`、`pillow 13.0.0`、`defusedxml 0.7.1`、`lxml 6.1.3` |
| 影音與圖表 | `imageio 2.38.1`、`imageio-ffmpeg 0.7.0`(內建 ffmpeg 7.0.2)、`numpy 2.5.4`、`matplotlib 3.11.2` |
| 自動化 | `playwright 1.64.1`、`pyyaml 6.0.3`、`anthropic 2.3.0`、`mcp 2.3.0` |
| Workspace | `yamllint 1.38.0` |

### 3.4 Node.js 套件

| 用途 | 檔案 | 套件 |
|------|------|------|
| 文件 | `node/package.json` | `docx 9.15.0`、`pptxgenjs 4.0.1`、`react 19.3.1`、`react-dom 19.3.1`、`react-icons 5.7.0`、`sharp 0.35.5` |
| 前端模板 | `frontend-template/package.json`、`pnpm-lock.yaml` | create-vite 9.3.3 `react-ts` 模板,套用 `web-artifacts-builder` 的設定與 shadcn 元件,加上 TypeScript 6.0.3、Vite、Tailwind CSS 3.4.1、Radix UI、Parcel、`html-inline` 等 |

`node/package.json` 以 `overrides` 把 `image-size` 升到 2.0.3。
`pptxgenjs` 宣告依賴 `image-size`,但它的 Node.js 版本並不載入這個套件;1.2.1 有兩個 HIGH 弱點。

前端模板與 skill 原本的設定有這些差異,原因是 skill 未固定版本,照原樣用目前的最新套件無法建置:

- 不設 `baseUrl`:TypeScript 7 已移除這個選項,`paths` 不需要它。
- TypeScript 改用 6.0.3:7.0.2 內含的 Go 執行檔有可修補的 HIGH 弱點。
- `react-day-picker` 用 9.x、`react-resizable-panels` 用 2.x:shadcn 元件是照這兩個主版本寫的。
- 移除 Vite 範本的 `favicon.svg` 連結:Parcel 打包時找不到這個檔案。
- `tailwind.config.js` 改為 `tailwind.config.ts`,`postcss.config.js` 改為 `.postcssrc.json`:本 repository 不接受新增 JavaScript 檔案。
- `pnpm-workspace.yaml` 以 `overrides` 把 `minimist` 升到 1.2.8(CVE-2021-44906),並設定 `verifyDepsBeforeRun: false`。

## 4. 安裝位置與使用方式

### 4.1 Python

- `pip` 以 `--break-system-packages --require-hashes` 把套件裝進系統 Python。
- 安裝位置是 `/usr/local/lib/python3.13/dist-packages`。
- agent 直接用 `python3` 執行,不需要啟用 virtualenv。

### 4.2 Node.js

- 文件套件裝在 `/usr/local/lib/node`。
- `require` 在任何工作目錄都能找到這些套件。
- 實際安裝目錄是 `/usr/local/lib/nemoclaw-tools-node/node_modules`,`/usr/local/lib/node` 是指向它的連結。
- `/sandbox/node_modules` 也指向同一個目錄,讓 `/sandbox` 下的 ESM `import` 能解析這些套件。
- ESM `import` 只在 `/sandbox` 之下可用;其他目錄請用 `require` 或 `createRequire`。

### 4.3 字型

建置時先在預設位置 `/var/cache/fontconfig` 產生 fontconfig 快取,再複製到 `/usr/local/share/nemoclaw-tools/fontconfig-cache`。
`/etc/fonts/conf.d/99-nemoclaw-tools-cachedir.conf` 把這份複本列為快取目錄。
`nemoclaw-blueprint/policies/openclaw-sandbox.yaml` 把 `/usr` 列為唯讀路徑,但沒有列出 `/var/cache`,所以 sandbox 讀的是 `/usr` 底下的複本。
CI 測試確認執行期間不會在使用者目錄重建字型快取。

fontconfig 只在字型目錄的修改時間與快取記錄完全相同(含奈秒)時使用快取。
BuildKit 匯出映像時會捨去奈秒,也會丟掉只改目錄修改時間的變更。
因此建置時先把每個字型目錄(含 symlink 指向的目錄)的修改時間截成整秒,再產生快取。
新增字型目錄或改變建置方式時,`fontconfig_cache` fixture 會檢查快取是否仍然有效。

### 4.4 LibreOffice

每次轉檔都必須在 `/tmp` 下指定唯一的 profile 目錄。
這樣多個轉檔可以同時執行,不共用同一個 profile:

```bash
profile_dir="$(mktemp -d /tmp/lo-profile.XXXXXX)"
soffice -env:UserInstallation="file://${profile_dir}" \
  --headless --convert-to pdf input.docx --outdir /tmp/out
```

Phase 1 在 OpenShell sandbox(OpenShell 0.0.101、Docker compute driver)中確認 `AF_UNIX` socket 可用。
因此 `soffice.py` 不需要 `LD_PRELOAD` shim,映像也不含編譯器。
[#18](https://github.com/derekhsu/NemoClaw/issues/18) 會在實際部署環境重測。如果那裡的 `AF_UNIX` 被擋,這個決定要重新評估。

### 4.5 officecli

officecli 在沒有 ICU 的環境會中止,所以映像額外安裝 `libicu76`。
Phase 2 在 tools 映像中以 officecli 編輯、驗證並讀回 DOCX、XLSX、PPTX。

### 4.6 瀏覽器與 Playwright

- Debian Chromium 給 CLI 與 OpenClaw 使用,執行時需要可寫入的 `HOME`;`HOME` 唯讀時,它的 crash handler 會中止。
- Python Playwright 預設使用 Chrome Headless Shell revision 1248,安裝在 `/usr/local/share/nemoclaw-tools/ms-playwright`。
- `/sandbox/.cache/ms-playwright` 指向這個目錄。sandbox 使用者的 `HOME` 是 `/sandbox`,所以 `p.chromium.launch()` 不需要指定路徑。
- 也可以用 `executable_path="/usr/lib/chromium/chromium"` 讓 Playwright 使用 Debian Chromium;CI 已在 `HOME` 可寫入時驗證。
- 在其他 `HOME` 執行時,請設定 `PLAYWRIGHT_BROWSERS_PATH=/usr/local/share/nemoclaw-tools/ms-playwright`。

### 4.7 前端專案

模板在 `/usr/local/share/nemoclaw-tools/frontend-template`,`node_modules` 已安裝好,不含 pnpm store。

```bash
cp -a /usr/local/share/nemoclaw-tools/frontend-template /sandbox/app
cd /sandbox/app
pnpm run build
pnpm exec parcel build index.html --dist-dir bundle --no-source-maps
pnpm exec html-inline bundle/index.html > bundle.html
```

- 必須用 `cp -a` 複製,保留 pnpm 的相對連結。
- 不要執行 `pnpm install` 或 `pnpm add`:pnpm 12 的 store 使用 SQLite 索引,無法放在唯讀的 `/usr` 下,映像也不含 store。新增套件需要網路。
- skill 的 `init-artifact.sh` 會執行 `pnpm create vite` 與 `pnpm install`,離線時無法使用;離線專案從這份模板開始。
- p5.js 1.7.0 在 `/usr/local/share/nemoclaw-tools/p5/p5.min.js`。

### 4.8 已知限制

- `pptxgenjs` 4.0.1 產生的 PPTX 不符合 OpenXML schema 的元素順序,`officecli validate` 會回報錯誤;PowerPoint 與 LibreOffice 仍可開啟。officecli 自己建立的 PPTX 可以通過驗證。
- `markitdown` 只安裝 `pptx` 支援,不能轉換 DOCX。
- Tesseract 4.1 的中文語言資料可能誤認少數字元。CI 測試以兩行常用字詞驗證,要求相似度不低於 0.8。

## 5. 離線限制

- 一般文件、PDF/OCR、影音、圖表與 workspace 工作不需要下載。
- `imageio-ffmpeg` 使用 wheel 內建的 ffmpeg 7.0.2,執行期間不下載。
- 前端建置使用預先安裝好的模板,見 4.7 節。模板以外的套件無法離線安裝。
- Playwright 使用映像內的 Chrome Headless Shell,執行期間不下載瀏覽器。
- 外部 API 與登入仍需要部署端授權。tools 映像不放寬網路政策。

## 6. 版本更新與維護

### 6.1 Debian 套件

Debian 在後續安全更新後,會從 `deb.debian.org` 移除舊版本。
維護者決定每次發布 tools 版本時都重新解析 `apt-packages.txt`:

1. 以新的 base digest 鎖住所有受控套件。
2. 重新解析 `apt-packages.txt` 與 `apt-packages-browser.txt` 中每個套件的版本。
3. 提交新的版本。

舊的 tools 版本可能在 Debian 移除對應版本後無法重新建置。
如果某個版本已不存在,建置會失敗並列出該套件。

### 6.2 Python lock

修改 `python/requirements.in` 後,執行以下指令重新產生 `requirements.lock`:

```bash
tools/openclaw-tools-image/python/lock-python.sh
```

這個指令用 `uv pip compile` 產生 Python 3.13、Linux amd64 與 arm64 通用、只含 wheel 並帶 hash 的 lock。

### 6.3 Text::CharWidth 重新編譯

base 映像含受控的 `perl-base=5.44.0-1nemoclaw1`。
`libreoffice-calc` 經由 `ucf` 需要 `libtext-charwidth-perl`,而 Debian 的版本需要 `perlapi-5.40.0`。
在保留受控 Perl 的情況下,apt 無法解析這條相依,兩個架構都失敗。

因此建置時在獨立 stage 中,以 Perl 5.44 從原始碼重新編譯 Text::CharWidth 0.04。
Debian `0.04-11` 沒有原始碼修補,只多了 hardening 旗標、`dh_perl -d` 與 `Multi-Arch: same`。
重新編譯使用 `dpkg-buildflags` 的 hardening 設定。
最終映像只複製編譯好的套件,不含編譯器。

更新 base 的 Perl 版本時,必須重新檢查這個步驟。

## 7. 發布與選用

### 7.1 發布方式

在 GitHub Actions 手動執行 `Images / OpenClaw Sandbox`(`.github/workflows/openclaw-sandbox-image.yaml`),
從 `feat/image-only-cli` 分支執行,並填入兩個輸入:

| 輸入 | `standard` | `tools` |
|------|------------|---------|
| 建置來源 | `Dockerfile.base` + `Dockerfile` | `Dockerfile.tools`,base 為檔案中以 digest 固定的標準映像 |
| tag 格式 | `<version>` 或 `<version>-r<n>`,例如 `2026.9.2-r3` | `<version>-tools.<n>`,例如 `2026.9.2-tools.1` |
| `<version>` 必須等於 | `Dockerfile` 的 `OPENCLAW_VERSION` | 建好的映像中 `openclaw --version` 的版本 |
| 寫入的 tag | `<tag>`、`<tag>-amd64`、`<tag>-arm64`、`latest`、`openclaw-<version>` | 只有 `<tag>` |

兩種映像都推送到 `docker.io/derekhsu/openshell-openclaw`。

### 7.2 發布規則

`scripts/openclaw-image-release.sh` 檢查以下規則,`test/openclaw-image-release.test.ts` 測試這些規則:

- 只在 `derekhsu/NemoClaw` 的 `feat/image-only-cli` 分支執行,只推送到上述 repository。
- tag 不符合所選映像的格式時拒絕。
  因此標準映像不能使用 `-tools.` tag,tools 映像也不能使用標準映像的 tag。
- 發布 tag(標準映像含兩個架構 tag)已存在時拒絕,不覆寫。
  規劃階段檢查一次,寫入 tag 前再檢查一次。
- 只有標準映像的發布會移動 `latest` 與 `openclaw-<version>`,而且在發布 tag 寫入之後才移動。
- workflow 輸入只透過環境變數傳給 shell,不直接寫進指令。

每個架構的映像以 digest 推送前,必須先通過該架構的以下檢查;兩個架構都成功後,workflow 才寫入 tag:

- 與 base 比較執行設定。
- 檢查 tag 版本。
- 離線 fixture。
- Trivy 新增弱點檢查。

workflow 在這些檢查之後才登入 Docker Hub。
tools 映像不使用 GitHub Actions 的建置快取,以免擠掉標準映像的快取。

### 7.3 失敗與重試

Docker Hub 無法一次原子寫入多個 tag。

- 某個架構失敗時,不寫入任何 tag。
  `Report untagged digests` job 會列出已以 digest 推送、但沒有 tag 的映像。
- 寫入 tag 時失敗,摘要會列出兩個架構的 digest 與已寫入的 tag。
- tag 寫入後若讀不到 index digest,或讀到的值格式不對,workflow 會失敗;摘要會列出兩個架構的 digest、已寫入的 tag 與查詢指令。
  tag 本身有效，不需重試。
- workflow 不刪除任何已推送的內容。
  重試時改用新的 `<n>` 或 `-r<n>`;要移除已寫入的 tag,由維護者手動處理。

### 7.4 部署端選用

部署端以完整 digest 選用 tools 映像。
發布 workflow 的摘要會列出 index digest;也可以用以下指令查詢:

```bash
docker buildx imagetools inspect docker.io/derekhsu/openshell-openclaw:2026.9.2-tools.1 \
  --format '{{.Manifest.Digest}}'
```

要回到標準映像,把設定改回標準映像的 digest。
部署系統的實際設定位置與驗收由 [#18](https://github.com/derekhsu/NemoClaw/issues/18) 確認。

## 8. 弱點掃描

- 以 Trivy 掃描映像,保存 JSON 報告。
- 同時掃描 base 映像。tools 層不得新增可修補的 CRITICAL 或 HIGH 弱點,否則 CI 失敗。
- base 映像原有的可修補弱點,以重建標準映像處理,不在 tools 映像中修補。
- 每個無法修補的 CRITICAL 或 HIGH 弱點,由維護者逐一具名簽核。簽核完成前,維護者不得發布 tools 映像。CI 不檢查這項簽核。
- `Dockerfile.tools` 以 apt hold 鎖住 base 的受控套件,安裝後再確認版本。
- `base_security_checks` fixture 在 tools 映像中重跑 base 的安全檢查。

`2026.9.2-tools.1`(base `2026.9.2-r2`)的掃描結果(兩個架構相同):

- tools 層沒有新增可修補的 CRITICAL 或 HIGH 弱點。
- base 原有 11 個可修補的弱點。[#19](https://github.com/derekhsu/NemoClaw/issues/19) 重建的 `2026.9.2-r3` 已修補這 11 個弱點,r3 沒有可修補的 CRITICAL 或 HIGH 弱點。
- tools 層新增 67 個尚無修補的 CVE,其中 1 個是 CRITICAL(`libxml2` CVE-2026-6653)。
  主要來自 Chromium、FFmpeg、libxml2 與 Tesseract。
  維護者已於 2026-11-01 逐一具名簽核這 67 個 CVE,清單在 track 的 `phase5-review.md`。

`2026.9.2-r4` 加入 Homebrew 7.0.12 與 Homebrew 的 portable Ruby。
其中的 json 2.18.0 有一個可修補的 CRITICAL 弱點 CVE-2026-33210。標準映像把它判定為不受影響(Homebrew 不使用受影響的參數),並設了到 2026-12-03 為止的例外。
tools 驗證把它算成 base 原有的弱點,不算 tools 層新增。

以 `2026.9.2-r4` 為 base 的 tools 映像,發布前以驗證 workflow 的掃描結果重新比對。
tools 層新增的尚無修補 CVE 如果不在上述簽核清單中,維護者要先簽核才能發布。

## 9. 驗證方式

維護者決定不在本機建置映像。
fork 上的 GitHub Actions workflow 在原生 runner 上建置 `Dockerfile.tools`:

| 架構 | Runner |
|------|--------|
| amd64 | `ubuntu-24.04` |
| arm64 | `ubuntu-24.04-arm` |

workflow 以 `run-fixtures.sh` 執行 track `fixtures.md` 中的 fixture、執行 Trivy 掃描並上傳輸出。
這個驗證 workflow 不推送映像。它使用與發布 workflow 相同的 Dockerfile、平台與 fixture。

fixture 的執行條件:

- 以 `sandbox` 使用者執行。
- 使用 `--network none` 與唯讀 root,只有 `/tmp` 與輸出目錄 `/out` 可寫入。
- 不加 capability,啟用 `no-new-privileges`。

OpenShell policy 下的檢查、OpenClaw browser 工具與冷啟動時間由 [#18](https://github.com/derekhsu/NemoClaw/issues/18) 驗收。
