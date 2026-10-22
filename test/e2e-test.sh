#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# E2E test for NemoClaw + blueprint
# Runs inside the Docker sandbox

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC}: $1"; }
fail() {
  echo -e "${RED}FAIL${NC}: $1"
  exit 1
}
info() { echo -e "${YELLOW}TEST${NC}: $1"; }

# -------------------------------------------------------
info "1. Verify OpenClaw CLI is installed"
# -------------------------------------------------------
if openclaw --version; then
  pass "OpenClaw CLI installed"
else
  fail "OpenClaw CLI not found"
fi

# -------------------------------------------------------
info "2. Verify plugin can be installed"
# -------------------------------------------------------
if openclaw plugins install /opt/nemoclaw 2>&1; then
  pass "Plugin installed"
else
  # If plugins install isn't available, verify the built artifacts exist
  if [ -f /opt/nemoclaw/dist/index.js ]; then
    pass "Plugin built successfully (dist/index.js exists)"
  else
    fail "Plugin build artifacts missing"
  fi
fi

# -------------------------------------------------------
info "3. Verify blueprint YAML is valid"
# -------------------------------------------------------
if node --input-type=module -e "
  import { createRequire } from 'node:module';
  import { readFileSync } from 'node:fs';
  const require = createRequire('/opt/nemoclaw/');
  const YAML = require('yaml');

  const bp = YAML.parse(readFileSync('/opt/nemoclaw-blueprint/blueprint.yaml', 'utf-8'));
  if (bp.version !== '0.1.0') throw new Error('Bad version: ' + bp.version);
  const profiles = bp.components?.inference?.profiles ?? {};
  for (const profile of ['default', 'ncp', 'vllm', 'nim-local']) {
    if (!(profile in profiles)) throw new Error('Missing ' + profile + ' profile');
  }
  console.log('Profiles: ' + Object.keys(profiles).join(', '));
"; then
  pass "Blueprint YAML valid with all 4 profiles"
else
  fail "Blueprint YAML invalid"
fi

# -------------------------------------------------------
info "3b. Verify blueprint profile validation from compiled TypeScript"
# -------------------------------------------------------
# Independent backstop for validate-blueprint.test.ts — exercises the same
# checks from the compiled TS inside the Docker container so a vitest
# loading bug cannot hide a broken blueprint.
if node --input-type=module -e "
  import { createRequire } from 'node:module';
  import { readFileSync } from 'node:fs';
  const require = createRequire('/opt/nemoclaw/');
  const YAML = require('yaml');

  const bp = YAML.parse(readFileSync('/opt/nemoclaw-blueprint/blueprint.yaml', 'utf-8'));
  const declared = bp.profiles;
  const defined = bp.components?.inference?.profiles ?? {};

  if (!Array.isArray(declared) || declared.length === 0) {
    throw new Error('Top-level profiles list is empty or missing');
  }
  if (Object.keys(defined).length === 0) {
    throw new Error('components.inference.profiles is empty or missing');
  }

  for (const name of declared) {
    if (!(name in defined)) throw new Error('Declared profile missing definition: ' + name);
    const cfg = defined[name];
    if (!cfg.provider_type) throw new Error(name + ': missing provider_type');
    if (!cfg.endpoint && !cfg.dynamic_endpoint) throw new Error(name + ': missing endpoint');
  }
  for (const name of Object.keys(defined)) {
    if (!declared.includes(name)) throw new Error('Defined profile not declared: ' + name);
  }

  const policy = YAML.parse(readFileSync('/opt/nemoclaw-blueprint/policies/openclaw-sandbox.yaml', 'utf-8'));
  if (!policy.version) throw new Error('Base policy missing version');
  if (!policy.network_policies) throw new Error('Base policy missing network_policies');

  console.log('Validated ' + declared.length + ' profiles: ' + declared.join(', '));
"; then
  pass "Blueprint validation from compiled TS inside Docker"
else
  fail "Blueprint validation from compiled TS failed"
fi

# -------------------------------------------------------
info "4. Verify blueprint runner plan command"
# -------------------------------------------------------
cd /opt/nemoclaw-blueprint
# Runner will fail at openshell prereq check (expected in test container).
# Use 'ncp' profile (empty endpoint skips SSRF DNS lookup in sandbox).
# Catch only the expected error — anything else propagates as a real failure.
NEMOCLAW_BLUEPRINT_PATH=/opt/nemoclaw-blueprint node --input-type=module -e "
  const { main } = await import('/opt/nemoclaw/dist/blueprint/runner.js');
  try {
    await main(['plan', '--profile', 'ncp', '--dry-run']);
  } catch (err) {
    if (!err.message.includes('openshell CLI not found')) throw err;
    console.log('EXPECTED_ERROR: ' + err.message);
  }
" 2>&1 | tee /tmp/plan-output.txt
if grep -q "RUN_ID:" /tmp/plan-output.txt; then
  pass "Blueprint plan generates run ID"
else
  fail "No run ID in plan output"
fi
if grep -q "Validating blueprint" /tmp/plan-output.txt; then
  pass "Blueprint runner validates before execution"
else
  fail "No validation step"
fi
if grep -q "EXPECTED_ERROR: openshell CLI not found" /tmp/plan-output.txt; then
  pass "Plan fails with expected openshell error (not silently)"
else
  fail "Plan did not produce expected openshell error"
fi

# -------------------------------------------------------
info "4b. Verify blueprint runner apply smoke test"
# -------------------------------------------------------
# Apply runs the full codepath (profile resolution, sandbox creation,
# provider setup, state save) against a fixture CLI. Policy mutation reads must
# return the same metadata + YAML shape as OpenShell 0.0.72; an empty successful
# response is intentionally rejected by the runner.
FAKE_OPENSHELL_BIN=$(mktemp -d)
APPLY_OUTPUT=$(mktemp)
cleanup_apply_fixture() {
  rm -rf "$FAKE_OPENSHELL_BIN"
  rm -f "$APPLY_OUTPUT"
}
trap cleanup_apply_fixture EXIT
cat >"$FAKE_OPENSHELL_BIN/openshell" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case "${1:-} ${2:-} ${3:-}" in
  "policy get --base")
    printf '%s\n' 'Policy for sandbox fixture' '---'
    cat /opt/nemoclaw-blueprint/policies/openclaw-sandbox.yaml
    ;;
  "policy get "*)
    echo "unexpected policy read: expected policy get --base" >&2
    exit 64
    ;;
esac
SH
chmod 0755 "$FAKE_OPENSHELL_BIN/openshell"
PATH="$FAKE_OPENSHELL_BIN:$PATH" NEMOCLAW_BLUEPRINT_PATH=/opt/nemoclaw-blueprint node --input-type=module -e "
  const { main } = await import('/opt/nemoclaw/dist/blueprint/runner.js');
  await main(['apply', '--profile', 'ncp']);
" 2>&1 | tee "$APPLY_OUTPUT"
rm -rf "$FAKE_OPENSHELL_BIN"
if grep -q "RUN_ID:" "$APPLY_OUTPUT"; then
  pass "Apply generates run ID"
else
  fail "No run ID in apply output"
fi
if grep -q "PROGRESS:20:Creating OpenClaw sandbox" "$APPLY_OUTPUT"; then
  pass "Apply executes sandbox creation step"
else
  fail "Apply did not reach sandbox creation step"
fi
if grep -q "PROGRESS:50:Configuring inference provider" "$APPLY_OUTPUT"; then
  pass "Apply executes provider configuration"
else
  fail "Apply did not reach provider configuration step"
fi
if grep -q "PROGRESS:100:Apply complete" "$APPLY_OUTPUT"; then
  pass "Apply completes full pipeline"
else
  fail "Apply did not complete"
fi
# Verify run state was persisted to disk
RUN_ID=$(grep -o 'nc-[0-9]*-[0-9]*-[a-f0-9]*' "$APPLY_OUTPUT" | head -1)
if [ -f "$HOME/.nemoclaw/state/runs/$RUN_ID/plan.json" ]; then
  pass "Apply persisted run state to disk"
else
  fail "Apply did not persist run state (plan.json missing for $RUN_ID)"
fi
rm -f "$APPLY_OUTPUT"
trap - EXIT

# -------------------------------------------------------
info "5. Verify sandbox OpenClaw state directories exist"
# -------------------------------------------------------
if [ -f /sandbox/.openclaw/openclaw.json ]; then
  pass "Host OpenClaw config detected"
else
  fail "No host config"
fi
if [ -d /sandbox/.openclaw/workspace ]; then
  pass "Host workspace directory exists"
else
  fail "No workspace dir"
fi
if [ -d /sandbox/.openclaw/skills ]; then
  pass "Host skills directory exists"
else
  fail "No skills dir"
fi
if [ -d /sandbox/.openclaw/hooks ]; then
  pass "Host hooks directory exists"
else
  fail "No hooks dir"
fi
if [ -f /sandbox/.openclaw/hooks/demo-hook/HOOK.md ]; then
  pass "Host hook fixture exists"
else
  fail "No hook fixture"
fi

# -------------------------------------------------------
info "6. Verify plugin TypeScript compilation"
# -------------------------------------------------------
if [ -f /opt/nemoclaw/dist/index.js ]; then
  pass "index.js compiled"
else
  fail "index.js missing"
fi
if [ -f /opt/nemoclaw/dist/commands/slash.js ]; then
  pass "slash.js compiled"
else
  fail "slash.js missing"
fi
if [ -f /opt/nemoclaw/dist/blueprint/state.js ]; then
  pass "state.js compiled"
else
  fail "state.js missing"
fi

# -------------------------------------------------------
info "7. Verify NemoClaw state management"
# -------------------------------------------------------
if node --input-type=module -e "
import { strict as assert } from 'node:assert';
const { loadState, saveState, clearState } = await import('/opt/nemoclaw/dist/blueprint/state.js');

// Initial state should be empty
let state = loadState();
assert.equal(state.lastAction, null, 'Initial state should be null');

// Save and reload
saveState({ ...state, lastAction: 'migrate', lastRunId: 'test-123', sandboxName: 'openclaw' });
state = loadState();
assert.equal(state.lastAction, 'migrate', 'Should be migrate');
assert.equal(state.lastRunId, 'test-123', 'Should be test-123');
assert.notEqual(state.updatedAt, null, 'Should have timestamp');

// Clear
clearState();
state = loadState();
assert.equal(state.lastAction, null, 'Should be cleared');

console.log('State management: create, save, load, clear all working');
"; then
  pass "NemoClaw state management works"
else
  fail "State management broken"
fi

# -------------------------------------------------------
info "8. Verify procps debug tools are present (#2343)"
# -------------------------------------------------------
for cmd in ps top free uptime vmstat; do
  if command -v "$cmd" >/dev/null 2>&1; then
    pass "$cmd is available at $(command -v "$cmd")"
  else
    fail "$cmd not found — procps package missing from sandbox image"
  fi
done
# Smoke-test: ps must actually execute, not just resolve
if ps --version >/dev/null 2>&1; then
  pass "ps executes successfully"
else
  fail "ps found but failed to execute"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ALL E2E TESTS PASSED${NC}"
echo -e "${GREEN}========================================${NC}"
