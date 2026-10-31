#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Phase 2 fixtures for the OpenClaw tools image (issue #16).
# Run inside the image as the sandbox user with no network:
#   docker run --rm --user sandbox --network none --read-only \
#     --tmpfs /tmp:rw,exec,size=2g --cap-drop ALL \
#     --security-opt no-new-privileges --entrypoint /bin/bash \
#     -v "$PWD/tools/openclaw-tools-image/fixtures:/fixtures:ro" \
#     -v "$OUT:/out" IMAGE /fixtures/run-phase2.sh
# Writes one log per check to /out/logs and a summary to /out/summary.tsv.
# Exits non-zero when any check fails.

# Checks are called indirectly through check().
# shellcheck disable=SC2329

set -uo pipefail

OUT=${OUT:-/out}
WORK=$(mktemp -d /tmp/fixtures.XXXXXX)
export HOME=$WORK/home MPLCONFIGDIR=$WORK/mpl SAL_USE_VCLPLUGIN=svp
mkdir -p "$HOME" "$MPLCONFIGDIR" "$OUT/logs" "$OUT/files"
: >"$OUT/summary.tsv"
failures=0

check() {
  local name=$1
  shift
  local rc
  # A standalone subshell keeps errexit active inside the check.
  (
    set -euo pipefail
    cd "$WORK"
    "$@"
  ) >"$OUT/logs/$name.log" 2>&1
  rc=$?
  if [ "$rc" -eq 0 ]; then
    printf 'PASS\t%s\n' "$name" | tee -a "$OUT/summary.tsv"
  else
    printf 'FAIL\t%s\n' "$name" | tee -a "$OUT/summary.tsv"
    failures=$((failures + 1))
  fi
}

soffice_pdf() {
  local input=$1 profile
  profile=$(mktemp -d "$WORK/lo-profile.XXXXXX")
  soffice "-env:UserInstallation=file://$profile" --headless \
    --convert-to pdf --outdir "$WORK/pdf" "$input"
}

# --- Runtime boundaries -------------------------------------------------

runtime_identity() {
  test "$(id -un)" = sandbox
  if command -v gcc || command -v cc || command -v make; then
    echo "compiler present in final image"
    return 1
  fi
}

controlled_packages() {
  local inventory=/usr/local/share/nemoclaw/security-packages.txt pkg version actual
  while IFS='=' read -r pkg version; do
    [ "$pkg" = architecture ] && continue
    actual=$(dpkg-query -W -f='${Version}' "$pkg")
    echo "$pkg expected=$version actual=$actual"
    test "$actual" = "$version"
  done <"$inventory"
}

base_security_checks() {
  test "$(perl -e 'print $^V')" = v5.44.0
  ldd /usr/bin/jq | grep -Eq 'libonig[.]so[.]5'
  test "$(tmux -V)" = "tmux 3.5a"
  test "$(jq --version)" = jq-1.8.2
  PATH=/usr/bin:/bin python3 -c "import pyexpat; assert pyexpat.EXPAT_VERSION == 'expat_2.8.3', pyexpat.EXPAT_VERSION"
  printf '%s  %s\n' 4ff43a8578bda2f14686c67911b64c18e869841973722b1c623b5727491bdaf7 \
    /usr/lib/python3.13/html/parser.py | sha256sum -c -
  PATH=/usr/bin:/bin python3 -c "import ctypes, sys; lib=ctypes.CDLL('libssh2.so.1'); lib.libssh2_version.restype=ctypes.c_char_p; lib.libssh2_version(0) == b'1.11.1' or sys.exit('unexpected libssh2')"
  vim.tiny --version | head -n 1 | grep -Eq '^VIM - Vi IMproved 9[.]2 '
  vim.tiny --version | grep -Fx 'Included patches: 1-858'
  test -z "$(dpkg --audit)"
}

fontconfig_cache() {
  ls /usr/local/share/nemoclaw-tools/fontconfig-cache/*.cache-* >/dev/null
  fc-match 'Noto Sans CJK TC' | grep -q 'Noto Sans CJK'
  fc-match 'Liberation Serif' | grep -q Liberation
  fc-match 'DejaVu Sans' | grep -q DejaVu
  # The baked cache must cover every font, so no per-user cache is written.
  test -z "$(find "$HOME/.cache/fontconfig" -type f 2>/dev/null)"
}

# --- Office, PDF, OCR ---------------------------------------------------

office_create() {
  cat >"$WORK/make-office.cjs" <<'JS'
const fs = require("fs");
const { Document, Packer, Paragraph, HeadingLevel } = require("docx");
const PptxGenJS = require("pptxgenjs");
(async () => {
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: "Fixture Heading", heading: HeadingLevel.HEADING_1 }),
    new Paragraph("中文測試 Latin Test"),
  ] }] });
  fs.writeFileSync("doc.docx", await Packer.toBuffer(doc));
  const pptx = new PptxGenJS();
  pptx.addSlide().addText("中文測試 Latin Test", { x: 1, y: 1, w: 8, h: 1 });
  fs.writeFileSync("slides.pptx", await pptx.write({ outputType: "nodebuffer" }));
})();
JS
  node make-office.cjs
  python3 - <<'PY'
from openpyxl import Workbook
wb = Workbook()
ws = wb.active
ws["A1"] = 21
ws["A2"] = "=A1*2"
ws["B1"] = "中文測試 Latin Test"
wb.save("sheet.xlsx")
PY
  test -s doc.docx && test -s slides.pptx && test -s sheet.xlsx
}

officecli_journey() {
  export OFFICECLI_RESIDENT_FLUSH=each
  officecli --version | grep -Fx 1.0.160
  officecli add doc.docx /body --type paragraph --prop text="officecli 新增段落"
  for f in doc.docx sheet.xlsx slides.pptx; do officecli validate "$f"; done
  officecli view doc.docx text | grep -q "officecli 新增段落"
  officecli get sheet.xlsx /Sheet1/A2 --json | grep -q 'A1\*2'
}

office_to_pdf() {
  mkdir -p pdf
  # Two conversions at once, each with its own LibreOffice profile.
  soffice_pdf doc.docx &
  local first=$!
  soffice_pdf slides.pptx &
  local second=$!
  wait "$first"
  wait "$second"
  soffice_pdf sheet.xlsx
  for f in doc.docx slides.pptx sheet.xlsx; do
    local pdf=pdf/${f%.*}.pdf
    pdftotext "$pdf" - | tr -d '[:space:]' | grep -q '中文測試'
    pdffonts "$pdf" | grep -q 'NotoSansCJK'
  done
  cp pdf/*.pdf "$OUT/files/"
}

spreadsheet_recalc() {
  local profile
  profile=$(mktemp -d "$WORK/lo-profile.XXXXXX")
  mkdir -p recalc
  soffice "-env:UserInstallation=file://$profile" --headless \
    --convert-to 'xlsx:Calc MS Excel 2007 XML' --outdir recalc sheet.xlsx
  python3 - <<'PY'
from openpyxl import load_workbook
value = load_workbook("recalc/sheet.xlsx", data_only=True).active["A2"].value
print("A2 =", value)
assert value == 42, value
PY
}

pdf_tools() {
  local pdf=pdf/doc.pdf
  pdftoppm -png -r 72 -f 1 -l 1 "$pdf" page
  test -s page-1.png
  pdfimages -list "$pdf"
  qpdf --check "$pdf"
  python3 - "$pdf" <<'PY'
import sys, pdfplumber, pypdf
path = sys.argv[1]
a = "".join(p.extract_text() or "" for p in pypdf.PdfReader(path).pages)
with pdfplumber.open(path) as pdf:
    b = "".join(p.extract_text() or "" for p in pdf.pages)
for text in (a, b):
    assert "Latin Test" in text, text
PY
}

ghostscript_eps() {
  cat >fixture.eps <<'EPS'
%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 200 100
/Helvetica findfont 20 scalefont setfont
20 40 moveto (EPS fixture) show
showpage
EPS
  gs -q -dSAFER -dBATCH -dNOPAUSE -dEPSCrop -sDEVICE=pdfwrite -o eps.pdf fixture.eps
  qpdf --check eps.pdf
  pdftotext eps.pdf - | grep -q 'EPS fixture'
  printf '(/etc/passwd) (r) file\n' >read.ps
  if gs -q -dSAFER -dBATCH -dNOPAUSE -sDEVICE=nullpage read.ps >gs-read.log 2>&1; then
    echo "SAFER allowed a file read"
    return 1
  fi
  grep -q invalidfileaccess gs-read.log
}

ocr() {
  python3 - <<'PY'
import subprocess
from PIL import Image, ImageDraw, ImageFont
font_path = subprocess.check_output(["fc-match", "-f", "%{file}", "Noto Sans CJK TC"], text=True)
cases = {"eng": "Hello OCR 2026", "chi_tra": "繁體中文測試", "chi_sim": "简体中文测试"}
for lang, text in cases.items():
    img = Image.new("RGB", (900, 160), "white")
    ImageDraw.Draw(img).text((30, 30), text, fill="black", font=ImageFont.truetype(font_path, 72, index=0))
    img.save(f"ocr-{lang}.png")
PY
  grep -q 'Hello OCR 2026' <(tesseract ocr-eng.png - -l eng)
  tesseract ocr-chi_tra.png - -l chi_tra | tr -d '[:space:]' | grep -q '繁體中文測試'
  tesseract ocr-chi_sim.png - -l chi_sim | tr -d '[:space:]' | grep -q '简体中文测试'
  python3 - <<'PY'
import pytesseract
from pdf2image import convert_from_path
page = convert_from_path("eps.pdf", dpi=200)[0]
text = pytesseract.image_to_string(page, lang="eng")
print(text)
assert "EPS fixture" in text
PY
}

pandoc_roundtrip() {
  printf '# Fixture Heading\n\n## 中文小節\n\nBody text.\n' >doc.md
  pandoc doc.md -o pandoc.docx
  pandoc pandoc.docx -t markdown -o back.md
  grep -q 'Fixture Heading' back.md
  grep -q '中文小節' back.md
}

# --- Images, metadata, media, charts -------------------------------------

images() {
  magick -version | head -n 1 | grep -q 'ImageMagick 7'
  magick -size 320x240 xc:steelblue image.png
  magick image.png -resize 160x120 image.webp
  test "$(magick identify -format '%m %wx%h' image.webp)" = 'WEBP 160x120'
}

metadata() {
  magick -size 64x64 xc:white photo.jpg
  exiftool -q -overwrite_original -Artist='Fixture Artist' photo.jpg
  test "$(exiftool -s3 -Artist photo.jpg)" = 'Fixture Artist'
  cp eps.pdf meta.pdf
  exiftool -q -overwrite_original -Title='Fixture Title' meta.pdf
  test "$(exiftool -s3 -Title meta.pdf)" = 'Fixture Title'
}

media() {
  ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc=duration=2:size=320x240:rate=10 \
    -f lavfi -i sine=frequency=440:duration=2 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest clip.mp4
  ffmpeg -hide_banner -loglevel error -i clip.mp4 -c:v libvpx-vp9 -b:v 200k -c:a libopus clip.webm
  ffprobe -v error -of json -show_streams -show_format clip.webm >probe.json
  python3 - <<'PY'
import json
d = json.load(open("probe.json"))
video = next(s for s in d["streams"] if s["codec_type"] == "video")
audio = next(s for s in d["streams"] if s["codec_type"] == "audio")
assert video["codec_name"] == "vp9", video["codec_name"]
assert (video["width"], video["height"]) == (320, 240)
assert audio["codec_name"] == "opus", audio["codec_name"]
assert 1.5 < float(d["format"]["duration"]) < 2.5, d["format"]["duration"]
PY
  python3 - <<'PY'
import os
import imageio.v2 as imageio
import imageio_ffmpeg
import numpy as np
exe = imageio_ffmpeg.get_ffmpeg_exe()
assert os.path.isfile(exe), exe
frames = [np.full((32, 32, 3), i * 40, dtype=np.uint8) for i in range(5)]
imageio.mimsave("anim.gif", frames, duration=0.1)
assert len(imageio.mimread("anim.gif")) == 5
PY
}

charts() {
  python3 -W error::UserWarning - <<'PY'
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.rcParams["font.family"] = ["Noto Sans CJK TC", "DejaVu Sans"]
fig, ax = plt.subplots()
ax.bar(["一月", "February", "三月"], [-3, 5, -1])
ax.set_title("中文圖表 Chart −5")
ax.set_ylabel("數值")
fig.savefig("chart.png")
PY
  test -s chart.png
  cp chart.png "$OUT/files/"
}

# --- Workspace and libraries --------------------------------------------

workspace() {
  mkdir -p zipdir && printf 'zip fixture\n' >zipdir/a.txt
  zip -qr fixture.zip zipdir
  mkdir unzipped && unzip -q fixture.zip -d unzipped
  cmp zipdir/a.txt unzipped/zipdir/a.txt
  rg -q 'zip fixture' unzipped
  printf 'name: fixture\nitems:\n  - a\n' >valid.yaml
  yq --version | grep -q 'mikefarah'
  yq -i '.items += ["b"]' valid.yaml
  test "$(yq '.items | length' valid.yaml)" = 2
  yamllint -d relaxed valid.yaml
  printf 'key: [unclosed\n' >invalid.yaml
  if yamllint -d relaxed invalid.yaml; then return 1; fi
  sqlite3 data.db 'create table t(v text); insert into t values ("ok");'
  test "$(sqlite3 data.db 'select v from t;')" = ok
  if sqlite3 -readonly data.db 'insert into t values ("no");'; then return 1; fi
}

python_libraries() {
  python3 - <<'PY'
import importlib
for name in ["anthropic", "mcp", "yaml", "playwright", "markitdown", "pptx",
             "lxml", "defusedxml", "pandas", "numpy", "reportlab"]:
    importlib.import_module(name)
print("ok")
PY
  python3 -m markitdown doc.docx | grep -q 'Latin Test'
}

node_resolution() {
  # CommonJS from an arbitrary directory uses the global folder.
  node -e 'for (const m of ["docx", "pptxgenjs", "react", "react-dom/server", "react-icons/fa", "sharp"]) require(m); console.log("cjs ok")'
  # ESM import resolves from the agent workspace.
  (cd /sandbox && node --input-type=module -e 'import { Document } from "docx"; import sharp from "sharp"; await sharp({ create: { width: 2, height: 2, channels: 3, background: "#000" } }).png().toBuffer(); console.log(typeof Document)')
}

check runtime_identity runtime_identity
check controlled_packages controlled_packages
check base_security_checks base_security_checks
check fontconfig_cache fontconfig_cache
check office_create office_create
check officecli_journey officecli_journey
check office_to_pdf office_to_pdf
check spreadsheet_recalc spreadsheet_recalc
check pdf_tools pdf_tools
check ghostscript_eps ghostscript_eps
check ocr ocr
check pandoc_roundtrip pandoc_roundtrip
check images images
check metadata metadata
check media media
check charts charts
check workspace workspace
check python_libraries python_libraries
check node_resolution node_resolution

printf '%s checks failed\n' "$failures"
exit $((failures > 0))
