<!-- SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved. -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# OpenClaw Tools 映像 — Fork 設計與使用說明

> **日期**: 2026-10-31
> **Fork**: `derekhsu/NemoClaw`
> **分支**: `codex/issue-16-tools-image`(基於 `feat/image-only-cli`,commit `70ff5c849`)
> **狀態**: 實作中 — Phase 2 映像已在 CI 建置並通過測試,尚未發布
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

目前的 base 是 `docker.io/derekhsu/openshell-openclaw:2026.9.2-r2`,
index digest 為
`sha256:8f951046eaf0de9f2e00fb7ff7d8d33de62e5c5890758289e27ec405fb5c1d02`。
`Dockerfile.tools` 以這個 digest 作為預設 `BASE_IMAGE`。
不使用 `2026.9.2` tag,因為它指向較舊的發布產物。

這是本 fork 的功能,不是 NVIDIA 官方支援的產品。
fork 維護者負責工具清單、相容性、安全更新與重新建置。
既有部署不會自動改用 tools 映像;部署端必須明確選用。

## 2. 實作狀態

| 階段 | 內容 | 狀態 |
|------|------|------|
| Phase 1 | 檢查 base、固定版本、相依性解析、決策 | 完成 |
| Phase 2 | 文件與影音工具、`Dockerfile.tools` | CI 測試通過,待人工確認 |
| Phase 3 | Chromium、Python Playwright、離線前端建置 | 未開始 |
| Phase 4 | 發布 workflow | 未開始 |
| Phase 5 | 文件定稿與審查 | 未開始 |
| #18 | 實際部署環境驗收 | 等 #16 發布第一個 tools 映像 |

第 4 節的安裝位置與使用方式已在 GitHub Actions 原生 amd64 與 arm64 runner 上驗證。
第 5 節的前端與 Chromium、第 7 節的發布流程仍是設計,尚未驗證。

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
| 瀏覽器(Phase 3) | `chromium 156.0.8078.73-1~deb13u1`,固定在 `apt-packages-browser.txt` |
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
| pnpm | 12.16.1 | 從 npm 安裝,以 integrity 校驗 |

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
| 前端模板 | `frontend-template/package.json`、`pnpm-lock.yaml`(419 個套件) | create-vite 9.3.3 `react-ts` 模板,加上 TypeScript、Vite、Tailwind CSS、Radix UI、Parcel、`html-inline` 等 |

`node/package.json` 以 `overrides` 把 `image-size` 升到 2.0.3。
`pptxgenjs` 宣告依賴 `image-size`,但它的 Node.js 版本並不載入這個套件;1.2.1 有兩個 HIGH 弱點。

前端模板的最終內容由 Phase 3 決定。

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

### 4.6 已知限制

- `pptxgenjs` 4.0.1 產生的 PPTX 不符合 OpenXML schema 的元素順序,`officecli validate` 會回報錯誤;PowerPoint 與 LibreOffice 仍可開啟。officecli 自己建立的 PPTX 可以通過驗證。
- `markitdown` 只安裝 `pptx` 支援,不能轉換 DOCX。
- Tesseract 4.1 的中文語言資料可能誤認少數字元。CI 測試以兩行常用字詞驗證,要求相似度不低於 0.8。

## 5. 離線限制

- 一般文件、PDF/OCR、影音、圖表與 workspace 工作不需要下載。
- `imageio-ffmpeg` 使用 wheel 內建的 ffmpeg 7.0.2,執行期間不下載。
- 前端建置使用預先準備的模板、`pnpm-lock.yaml` 與 pnpm store(Phase 3)。
  pnpm 離線安裝同時需要 package store 與 metadata 快取;只有 store 會出現 `ERR_PNPM_NO_OFFLINE_META`。
  lock 中沒有的套件無法離線安裝。
- Chromium 與 Python Playwright 是否共用同一個瀏覽器,待 Phase 3 驗證。
  Debian 提供 Chromium `156.0.8078.73`;Playwright 1.64.1 預期 revision 1248(`156.0.8078.4`)。
  如果不能共用,Phase 3 會另外安裝 Playwright 的 Chromium。
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

## 7. 發布與選用(Phase 4 設計,尚未實作)

### 7.1 發布規則

- 每次只發布一個多架構 tag:`<openclaw-version>-tools.<n>`,例如 `2026.9.2-tools.1`。
- `<openclaw-version>` 取自 base 映像中 `openclaw --version` 的輸出,不取自 checkout 的 pin。
- amd64 與 arm64 映像只以 digest 推送,不加架構 tag。
- tag 已存在時,workflow 在推送前拒絕。
- 標準映像的發布路徑收到含 `-tools.` 的 tag 時拒絕。
- tools 發布不改動標準映像的 `latest` 等 tag。
- 只從 `derekhsu/NemoClaw` 發布,只推送到 fork 擁有的 Docker Hub 位置。
- 部分失敗時,workflow 回報已寫入的 digest;發布不是原子操作。

發布的 Docker Hub repository 名稱待 Phase 4 確定。

### 7.2 部署端選用

部署端以完整 digest 選用 tools 映像。
要回到標準映像,把設定改回標準映像的 digest。
部署系統的實際設定位置與驗收由 [#18](https://github.com/derekhsu/NemoClaw/issues/18) 確認。

## 8. 弱點掃描

- 以 Trivy 掃描映像,保存 JSON 報告。
- 同時掃描 base 映像。tools 層不得新增可修補的 CRITICAL 或 HIGH 弱點,否則 CI 失敗。
- base 映像原有的可修補弱點,以重建標準映像處理,不在 tools 映像中修補。
- 每個無法修補的 CRITICAL 或 HIGH 弱點,由維護者逐一具名簽核。
- base 的受控套件版本必須維持不變,並重跑該 base 版本的安全檢查。

## 9. 驗證方式

維護者決定不在本機建置映像。
fork 上的 GitHub Actions workflow 在原生 runner 上建置 `Dockerfile.tools`:

| 架構 | Runner |
|------|--------|
| amd64 | `ubuntu-24.04` |
| arm64 | `ubuntu-24.04-arm` |

workflow 執行 track `fixtures.md` 中的 fixture、執行 Trivy 掃描並上傳輸出。
這個驗證 workflow 不推送映像。

fixture 的執行條件:

- 以 `sandbox` 使用者執行。
- 使用 `--network none`、唯讀 root、可寫入的 `/tmp` 與 `/sandbox`。
- 不加 capability,啟用 `no-new-privileges`。

OpenShell policy 下的檢查、OpenClaw browser 工具與冷啟動時間由 [#18](https://github.com/derekhsu/NemoClaw/issues/18) 驗收。
