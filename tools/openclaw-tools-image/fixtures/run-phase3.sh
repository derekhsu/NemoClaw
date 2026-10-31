#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Phase 3 fixtures for the OpenClaw tools image (issue #16): Chromium,
# Python Playwright, offline frontend builds, and p5.js.
# Run the same way as run-phase2.sh, with no network. Any attempt to
# download a browser or package fails the check.

# Checks are called indirectly through check().
# shellcheck disable=SC2329

set -uo pipefail

# shellcheck source=tools/openclaw-tools-image/fixtures/lib.sh
source "$(dirname "$0")/lib.sh"

TOOLS=/usr/local/share/nemoclaw-tools

write_page() {
  cat >page.html <<'HTML'
<!doctype html>
<html>
<body>
  <input id="name">
  <button id="greet" onclick="document.getElementById('greeting').textContent = 'Hello, ' + document.getElementById('name').value">Greet</button>
  <p id="greeting"></p>
</body>
</html>
HTML
}

# Fill the name, click the button, check the greeting, save a screenshot.
# Usage: browser_journey URL SCREENSHOT [EXECUTABLE]
browser_journey() {
  # HOME=/sandbox exercises the default Playwright browser lookup.
  HOME=${PW_HOME:-/sandbox} python3 - "$@" <<'PY'
import sys
from playwright.sync_api import sync_playwright
url, shot = sys.argv[1], sys.argv[2]
executable = sys.argv[3] if len(sys.argv) > 3 else None
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=executable)
    print("browser", browser.version)
    page = browser.new_page()
    page.goto(url)
    page.fill("#name", "Claw")
    page.click("#greet")
    page.wait_for_function("document.querySelector('#greeting').textContent === 'Hello, Claw'")
    page.screenshot(path=shot)
    browser.close()
PY
  test -s "$2"
  cp "$2" "$OUT/files/"
}

chromium_cli() {
  write_page
  chromium --version | grep -F 156.0.8078.73
  chromium --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --user-data-dir="$WORK/chromium-profile" --window-size=800,600 \
    --screenshot="$WORK/chromium-cli.png" "file://$WORK/page.html"
  test -s chromium-cli.png
}

playwright_default() {
  write_page
  test -f /sandbox/.cache/ms-playwright/chromium_headless_shell-1248/INSTALLATION_COMPLETE
  browser_journey "file://$WORK/page.html" "$WORK/playwright-default.png"
}

playwright_shared() {
  # Evidence for sharing Debian Chromium with Playwright. Debian Chromium's
  # crash handler needs a writable home directory.
  write_page
  PW_HOME=$HOME browser_journey "file://$WORK/page.html" "$WORK/playwright-shared.png" /usr/lib/chromium/chromium
}

frontend_offline() {
  pnpm --version | grep -Fx 12.16.1
  cp -a "$TOOLS/frontend-template" app
  cd app || return
  test -d node_modules/.pnpm
  pnpm run build
  pnpm exec parcel build index.html --dist-dir bundle --no-source-maps
  pnpm exec html-inline bundle/index.html >bundle.html
  test -s bundle.html
  if grep -Eq '<script[^>]+src=' bundle.html; then
    echo "bundle.html still loads an external script"
    return 1
  fi
  cp bundle.html "$OUT/files/frontend-bundle.html"
  cd "$WORK" || return
  browser_journey "file://$WORK/app/bundle.html" "$WORK/frontend-bundle.png"
}

p5js() {
  cat >sketch.html <<HTML
<!doctype html>
<html>
<body>
<script src="file://$TOOLS/p5/p5.min.js"></script>
<script>
function setup() { createCanvas(200, 100); background(255, 0, 0); noLoop(); }
</script>
</body>
</html>
HTML
  HOME=/sandbox python3 - "$WORK/sketch.html" "$WORK/p5.png" <<'PY'
import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("file://" + sys.argv[1])
    page.wait_for_selector("canvas")
    pixel = page.evaluate("Array.from(document.querySelector('canvas').getContext('2d').getImageData(10, 10, 1, 1).data)")
    print("pixel", pixel)
    assert pixel[:3] == [255, 0, 0], pixel
    page.screenshot(path=sys.argv[2])
    browser.close()
PY
  cp p5.png "$OUT/files/"
}

check chromium_cli chromium_cli
check playwright_default playwright_default
check playwright_shared playwright_shared
check frontend_offline frontend_offline
check p5js p5js

finish
