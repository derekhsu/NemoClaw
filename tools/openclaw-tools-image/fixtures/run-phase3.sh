#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# Phase 3 fixtures for the OpenClaw tools image (issue #16) and the Hermes
# tools image (issue #74): Chromium, Python Playwright, offline frontend
# builds, p5.js, and for Hermes the agent-browser CLI.
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
  HOME=${PW_HOME:-/sandbox} "$PY" - "$@" <<'PY'
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
  chromium --version | grep -F 156.0.8078.108
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
  HOME=/sandbox "$PY" - "$WORK/sketch.html" "$WORK/p5.png" <<'PY'
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

# The Hermes browser tool drives Chromium through the base image's
# agent-browser with no browser settings of its own. agent-browser starts the
# Debian /usr/bin/chromium wrapper, and /etc/chromium.d/nemoclaw-openshell adds
# the flags that OpenShell's seccomp requires (#27, #74).
agent_browser() {
  local ab=/opt/hermes/node_modules/.bin/agent-browser flags=/etc/chromium.d/nemoclaw-openshell out procs rc=0
  test "$(stat -c '%U:%G %a' "$flags")" = "root:root 644"
  # The line is shell code for the wrapper, matched literally.
  # shellcheck disable=SC2016
  grep -Fx 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox --no-zygote --disable-gpu"' "$flags"
  printf '<!doctype html><title>fixture</title><h1>agent-browser fixture</h1>\n' >agent-browser.html
  unset AGENT_BROWSER_EXECUTABLE_PATH AGENT_BROWSER_ARGS AGENT_BROWSER_CHROME_FLAGS
  export AGENT_BROWSER_SOCKET_DIR=$WORK/agent-browser
  mkdir -p "$AGENT_BROWSER_SOCKET_DIR"
  "$ab" --version
  timeout 90 "$ab" open "file://$WORK/agent-browser.html" || rc=1
  out=$(timeout 60 "$ab" get text h1) || rc=1
  # The browser process runs /usr/lib/chromium/chromium with the wrapper's flags.
  procs=$(pgrep -cf '^/usr/lib/chromium/chromium .*--no-sandbox.*--no-zygote' || true)
  "$ab" close --all || true
  echo "$out"
  echo "chromium processes with the OpenShell flags: $procs"
  [ "$rc" -eq 0 ] && [ "$procs" -gt 0 ] && grep -q 'agent-browser fixture' <<<"$out"
}

check chromium_cli chromium_cli
check playwright_default playwright_default
check playwright_shared playwright_shared
check frontend_offline frontend_offline
check p5js p5js
if [ "$AGENT" = hermes ]; then
  check agent_browser agent_browser
fi

finish
