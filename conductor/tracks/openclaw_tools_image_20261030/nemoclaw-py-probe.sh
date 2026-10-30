#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail
python3 -m venv /tmp/venv 2>&1 | tail -2 || {
  echo VENV_FAIL
  exit 1
}
/tmp/venv/bin/pip install -q --disable-pip-version-check --no-cache-dir --require-hashes --only-binary :all: -r /in/requirements.lock
/tmp/venv/bin/pip check
/tmp/venv/bin/python - <<'PY'
import importlib, json, os
mods = "anthropic defusedxml imageio imageio_ffmpeg lxml markitdown matplotlib mcp numpy openpyxl pandas pdf2image pdfplumber PIL playwright pypdf pytesseract yaml reportlab yamllint pptx".split()
for m in mods: importlib.import_module(m)
print("imports-ok", len(mods))
import imageio_ffmpeg
exe = imageio_ffmpeg.get_ffmpeg_exe(); print("imageio-ffmpeg-exe", exe, os.path.getsize(exe))
import playwright, pathlib
bj = pathlib.Path(playwright.__file__).parent / "driver/package/browsers.json"
for b in json.loads(bj.read_text())["browsers"]:
    if b["name"] in ("chromium", "chromium-headless-shell"): print("playwright-browser", b["name"], b["revision"], b.get("browserVersion"))
PY
