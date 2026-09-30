#!/usr/bin/env bash
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
#
# nemoclaw-api-runtime — privileged supervisor for the dedicated api-profile
# gateway and the public-port prefix proxy.
#
# ClawShell launches this through the container-runtime privileged exec path
# (docker exec --user root). nemoclaw-start runs as the sandbox uid under the
# OpenShell-managed topology and cannot step down to the dedicated hermesapi
# uid, so the api profile's processes are owned by this supervisor instead of
# the managed entrypoint.
#
#   nemoclaw-api-runtime start    — ensure the api runtime is running
#   nemoclaw-api-runtime stop     — stop the supervisor and its children
#   nemoclaw-api-runtime replace  — stop the current supervisor and children,
#                                   then start fresh (post-config-write restart)
#
# The supervisor verifies the root-sealed api profile contract before launch
# and before every respawn; a drifted anchor, replaced path, missing key, or
# interrupted config-write journal fails closed. It also fingerprints the
# admin-owned design surface (config.yaml, .env, SOUL.md, skills/) each poll
# and restarts the gateway once an edit burst settles, so dashboard-side
# changes take effect without a manual replace.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "[api-runtime] requires the privileged executor identity" >&2
  exit 1
fi

ACTION="${1:-start}"
case "$ACTION" in
  start | stop | replace) ;;
  *)
    echo "[api-runtime] usage: nemoclaw-api-runtime [start|stop|replace]" >&2
    exit 1
    ;;
esac

# docker exec children inherit the container-level environment, which carries
# OpenShell supervisor-only identity material (TLS paths, sandbox token file)
# and other names the Hermes env boundary reads as secret-shaped. The api
# profile stack consumes none of it, so scrub every variable matching the
# boundary's secret pattern minus its explicit nonsecret allowlist — mirroring
# validate-env-secret-boundary.py's runtime contract rather than enumerating
# today's variable names.
_api_scrub_supervisor_env() {
  local name
  while IFS='=' read -r name _; do
    case "$name" in
      # OpenShell supervisor-only identity variables (canonical deny list in
      # validate-env-secret-boundary.py) and the boundary's nonsecret
      # allowlist respectively.
      OPENSHELL_TLS_CA | OPENSHELL_TLS_CERT | OPENSHELL_TLS_KEY)
        unset "$name"
        ;;
      API_SERVER_HOST | API_SERVER_PORT | GPG_KEY \
        | NEMOCLAW_INFERENCE_API | NEMOCLAW_INFERENCE_PROVIDER_ID \
        | NEMOCLAW_PROVIDER_KEY | NEMOCLAW_REQUIRE_API_PROFILE)
        continue
        ;;
      *TOKEN* | *KEY* | *SECRET* | *PASSWORD* | *CREDENTIAL* | *API*)
        unset "$name" 2>/dev/null || true
        ;;
    esac
  done < <(env)
}
_api_scrub_supervisor_env

_SANDBOX_INIT="/usr/local/lib/nemoclaw/sandbox-init.sh"
if [ ! -f "$_SANDBOX_INIT" ]; then
  _SANDBOX_INIT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../scripts/lib/sandbox-init.sh"
fi
# shellcheck source=scripts/lib/sandbox-init.sh
source "$_SANDBOX_INIT"

_GATEWAY_SUPERVISOR="/usr/local/lib/nemoclaw/gateway-supervisor.sh"
if [ ! -f "$_GATEWAY_SUPERVISOR" ]; then
  _GATEWAY_SUPERVISOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../../scripts/lib/gateway-supervisor.sh"
fi
# shellcheck source=scripts/lib/gateway-supervisor.sh
source "$_GATEWAY_SUPERVISOR"

# Fixed image contract — the caller never selects paths, ports, or identities.
API_PROFILE_HOME="/sandbox/.hermes-api/profiles/api"
API_INTERNAL_PORT=18699
PUBLIC_PORT=8642
MAIN_INTERNAL_PORT=18642
RUNTIME_STATE_DIR="/run/nemoclaw"
SUPERVISOR_PID_FILE="${RUNTIME_STATE_DIR}/api-runtime.pid"
SUPERVISOR_LOCK_FILE="${RUNTIME_STATE_DIR}/api-runtime.lock"
RUNTIME_LOG="/tmp/api-runtime.log"
GATEWAY_LOG="/tmp/api-gateway.log"
PROXY_LOG="/tmp/api-proxy.log"

_GUARD="/usr/local/lib/nemoclaw/hermes-runtime-config-guard.py"
_PROXY="/usr/local/lib/nemoclaw/hermes-api-prefix-proxy.py"
if [ ! -f "$_GUARD" ]; then
  _GUARD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/runtime-config-guard.py"
fi
if [ ! -f "$_PROXY" ]; then
  _PROXY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/api-prefix-proxy.py"
fi

_HERMES="$(command -v hermes || true)"
[ -n "$_HERMES" ] || {
  echo "[api-runtime] hermes executable not found on PATH" >&2
  exit 1
}
_HERMES_PYTHON=""
for _candidate in /opt/hermes/.venv/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [ -x "$_candidate" ]; then
    _HERMES_PYTHON="$_candidate"
    break
  fi
done
unset _candidate
[ -n "$_HERMES_PYTHON" ] || {
  echo "[api-runtime] trusted python3 not found" >&2
  exit 1
}

API_GATEWAY_PID=""
API_GATEWAY_START=""
API_PROXY_PID=""
API_PROXY_START=""
DESIGN_FP_APPLIED=""

install -d -m 0755 -o root -g root "$RUNTIME_STATE_DIR"
if [ ! -f "$RUNTIME_LOG" ]; then
  install -o root -g root -m 0600 /dev/null "$RUNTIME_LOG"
fi

log() {
  printf '%s [api-runtime] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$RUNTIME_LOG"
  printf '[api-runtime] %s\n' "$*" >&2
}

_api_verify_contract() {
  # normalize-api-profile repairs the admin-owned design surface (SOUL.md,
  # skills/) before asserting the sealed contract: operator edits arrive via
  # ordinary file writes and can drop the pinned mode/owner, and a respawn
  # must heal that drift rather than refuse to launch over it. Sealed bytes
  # (policy, anchor, record) are still verified, never rewritten.
  "$_HERMES_PYTHON" -I "$_GUARD" normalize-api-profile >/dev/null 2>>"$RUNTIME_LOG"
}

# A child is only reaped or signaled after its /proc start identity matches the
# value captured at spawn, so a recycled PID can never be mistaken for ours.
_api_child_current() {
  local pid="$1" start="$2" port="$3"
  [ -n "$pid" ] && [ -n "$start" ] || return 1
  gateway_control_pid_is_live "$pid" || return 1
  gateway_control_pid_matches_start_identity "$pid" "$start" || return 1
  gateway_control_pid_owns_tcp_listener "$pid" "$port"
}

_api_stop_child() {
  local pid="$1" start="$2" label="$3"
  local attempts=0
  [ -n "$pid" ] || return 0
  if gateway_control_pid_matches_start_identity "$pid" "$start" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    while [ "$attempts" -lt 20 ]; do
      gateway_control_pid_is_live "$pid" || break
      sleep 0.25
      attempts=$((attempts + 1))
    done
    if gateway_control_pid_is_live "$pid" \
      && gateway_control_pid_matches_start_identity "$pid" "$start"; then
      log "force-killing ${label} pid ${pid} after SIGTERM grace"
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
}

_api_port_owner_pid() {
  # Print the pid owning the LISTEN socket on a port, or nothing.
  local port="$1" port_hex inode fd_path target pid pid_dir
  port_hex="$(printf '%04X' "$port")"
  inode="$(awk -v expected="$port_hex" '
    {
      split($2, local_address, ":")
      if (toupper(local_address[2]) == expected && $4 == "0A") { print $10; exit }
    }' /proc/net/tcp /proc/net/tcp6 2>/dev/null || true)"
  [ -n "$inode" ] || return 1
  for pid_dir in /proc/[0-9]*; do
    pid="${pid_dir#/proc/}"
    for fd_path in "${pid_dir}"/fd/*; do
      [ -L "$fd_path" ] || continue
      target="$(readlink "$fd_path" 2>/dev/null || true)"
      if [ "$target" = "socket:[${inode}]" ]; then
        printf '%s\n' "$pid"
        return 0
      fi
    done
  done
  return 1
}

_api_kill_stale_children() {
  # Remove leftover api processes from a previous supervisor (container reused,
  # supervisor died, children orphaned). Match on the exact api-profile identity
  # so a default-profile gateway is never touched.
  local proc_root="/proc" cmdline_file pid cmdline
  for cmdline_file in "${proc_root}"/[0-9]*/cmdline; do
    [ -r "$cmdline_file" ] || continue
    pid="$(basename "$(dirname "$cmdline_file")")"
    [ "$pid" != "$$" ] || continue
    cmdline="$(tr '\0' ' ' <"$cmdline_file" 2>/dev/null || true)"
    case "$cmdline" in
      *api-prefix-proxy*)
        log "removing stale api prefix proxy (pid ${pid})"
        kill "$pid" 2>/dev/null || true
        ;;
      *hermes*gateway*run*)
        if tr '\0' '\n' <"${proc_root}/${pid}/environ" 2>/dev/null \
          | grep -qxF "HERMES_HOME=${API_PROFILE_HOME}"; then
          log "removing stale api profile gateway (pid ${pid})"
          kill "$pid" 2>/dev/null || true
        fi
        ;;
    esac
  done
}

_api_wait_port_free() {
  local port="$1" attempts=0
  while [ "$attempts" -lt 40 ]; do
    _api_port_owner_pid "$port" >/dev/null 2>&1 || return 0
    sleep 0.25
    attempts=$((attempts + 1))
  done
  log "port ${port} still bound after stale-child cleanup"
  return 1
}

_api_wait_owned_listener() {
  # Wait until the port has a LISTEN socket owned by the exact child pid.
  local pid="$1" start="$2" port="$3" label="$4" attempts=0
  while [ "$attempts" -lt 360 ]; do
    if gateway_control_pid_owns_tcp_listener "$pid" "$port"; then
      return 0
    fi
    if ! gateway_control_pid_matches_start_identity "$pid" "$start"; then
      log "${label} pid ${pid} exited before binding ${port}"
      return 1
    fi
    sleep 0.25
    attempts=$((attempts + 1))
  done
  log "${label} did not bind port ${port}"
  return 1
}

_api_wait_backend_listener() {
  # Wait until a port has any LISTEN socket (main-gateway backend readiness).
  # The main gateway's first boot runs config migrations and platform init for
  # minutes, and the api-profile contract can restart it once for auxiliary
  # validation, so the budget spans a slow first boot. Bail early only when
  # our freshly spawned api gateway is already gone — nothing below us is
  # worth keeping then.
  local port="$1" label="$2" attempts=0
  while [ "$attempts" -lt 1200 ]; do
    _api_port_owner_pid "$port" >/dev/null 2>&1 && return 0
    if ! gateway_control_pid_matches_start_identity \
      "$API_GATEWAY_PID" "$API_GATEWAY_START"; then
      log "api gateway exited while waiting for ${label} on ${port}"
      return 1
    fi
    sleep 0.5
    attempts=$((attempts + 1))
  done
  log "${label} did not bind port ${port} within the startup window"
  return 1
}

_api_prepare_log() {
  local path="$1"
  install -o hermesapi -g api -m 0640 /dev/null "$path"
}

_api_design_fingerprint() {
  # Covers the admin-owned design surface the gateway reads at boot. A change
  # here is the signal to restart the gateway so edits take effect.
  gateway_control_tree_fingerprint \
    "$API_PROFILE_HOME/config.yaml" "$API_PROFILE_HOME/.env" \
    "$API_PROFILE_HOME/SOUL.md" "$API_PROFILE_HOME/skills"
}

_api_apply_proxy_env() {
  # inference.local resolves only through the OpenShell egress proxy and its
  # L7 CA. nemoclaw-start publishes the same values for connect sessions in
  # the proxy-env file; read only the whitelisted export lines and never eval
  # the file — it is owned by the sandbox user while this script runs as root.
  local file="/tmp/nemoclaw-proxy-env.sh" name value
  if [ -f "$file" ]; then
    while IFS='=' read -r name value; do
      name="${name#export }"
      case "$name" in
        HTTP_PROXY | HTTPS_PROXY | NO_PROXY | http_proxy | https_proxy | no_proxy | \
          SSL_CERT_FILE | CURL_CA_BUNDLE | REQUESTS_CA_BUNDLE | GIT_SSL_CAINFO | \
          NODE_EXTRA_CA_CERTS)
          value="${value%\"}"
          value="${value#\"}"
          value="${value%\'}"
          value="${value#\'}"
          printf -v "$name" '%s' "$value"
          export "${name?}"
          ;;
      esac
    done <"$file"
  fi
  local proxy_host="${NEMOCLAW_PROXY_HOST:-10.200.0.1}"
  local proxy_port="${NEMOCLAW_PROXY_PORT:-3128}"
  : "${HTTP_PROXY:=http://${proxy_host}:${proxy_port}}"
  : "${HTTPS_PROXY:=$HTTP_PROXY}"
  : "${NO_PROXY:=localhost,127.0.0.1,::1,${proxy_host}}"
  : "${http_proxy:=$HTTP_PROXY}" "${https_proxy:=$HTTPS_PROXY}" "${no_proxy:=$NO_PROXY}"
  local ca_bundle="/etc/openshell-tls/ca-bundle.pem"
  if [ -f "$ca_bundle" ]; then
    : "${SSL_CERT_FILE:=$ca_bundle}" "${CURL_CA_BUNDLE:=$ca_bundle}"
    : "${REQUESTS_CA_BUNDLE:=$ca_bundle}" "${GIT_SSL_CAINFO:=$ca_bundle}"
    : "${NODE_EXTRA_CA_CERTS:=$ca_bundle}"
  fi
  export HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy
  export SSL_CERT_FILE CURL_CA_BUNDLE REQUESTS_CA_BUNDLE GIT_SSL_CAINFO \
    NODE_EXTRA_CA_CERTS
}

_api_spawn_gateway() {
  _api_prepare_log "$GATEWAY_LOG" || return 1
  _api_apply_proxy_env
  # The profile dir is sandbox:api 3770; hermesapi creates runtime state there
  # through the api group. Clean its stale pid/lock files as root first.
  rm -f "${API_PROFILE_HOME}/runtime/gateway.pid" "${API_PROFILE_HOME}/runtime/gateway.lock"
  HOME="$API_PROFILE_HOME" HERMES_HOME="$API_PROFILE_HOME" \
    nohup "${STEP_DOWN_PREFIX_API[@]}" sh -c \
    'umask 0007; exec "$@"' sh "$_HERMES" gateway run \
    >>"$GATEWAY_LOG" 2>&1 &
  API_GATEWAY_PID=$!
  API_GATEWAY_START="$(gateway_control_pid_start_identity "$API_GATEWAY_PID" || true)"
  [ -n "$API_GATEWAY_START" ] || {
    log "api gateway pid ${API_GATEWAY_PID} failed identity capture"
    return 1
  }
  log "api profile gateway launched as 'hermesapi' (pid $API_GATEWAY_PID)"
}

_api_spawn_proxy() {
  _api_prepare_log "$PROXY_LOG" || return 1
  NEMOCLAW_PROXY_LISTEN_PORT="$PUBLIC_PORT" \
    NEMOCLAW_PROXY_MAIN_PORT="$MAIN_INTERNAL_PORT" \
    NEMOCLAW_PROXY_API_PORT="$API_INTERNAL_PORT" \
    nohup "${STEP_DOWN_PREFIX_API[@]}" "$_HERMES_PYTHON" -I "$_PROXY" \
    >>"$PROXY_LOG" 2>&1 &
  API_PROXY_PID=$!
  API_PROXY_START="$(gateway_control_pid_start_identity "$API_PROXY_PID" || true)"
  [ -n "$API_PROXY_START" ] || {
    log "api prefix proxy pid ${API_PROXY_PID} failed identity capture"
    return 1
  }
  log "api prefix proxy launched as 'hermesapi' (pid $API_PROXY_PID)"
}

_api_launch_stack() {
  _api_verify_contract || {
    log "api profile contract verification failed; refusing launch"
    return 1
  }
  # Sample the design fingerprint before the gateway reads the files, so an
  # edit landing during the boot wait still registers as a change.
  DESIGN_FP_APPLIED="$(_api_design_fingerprint)"
  _api_spawn_gateway || return 1
  if ! _api_wait_owned_listener \
    "$API_GATEWAY_PID" "$API_GATEWAY_START" "$API_INTERNAL_PORT" "api profile gateway"; then
    _api_stop_child "$API_GATEWAY_PID" "$API_GATEWAY_START" "api-gateway"
    return 1
  fi
  # Publish the public listener only after both backends own their loopback
  # ports; a proxy that binds early would 502 one side of the path split.
  if ! _api_wait_backend_listener "$MAIN_INTERNAL_PORT" "main gateway"; then
    _api_stop_child "$API_GATEWAY_PID" "$API_GATEWAY_START" "api-gateway"
    return 1
  fi
  _api_spawn_proxy || {
    _api_stop_child "$API_GATEWAY_PID" "$API_GATEWAY_START" "api-gateway"
    return 1
  }
  _api_wait_owned_listener \
    "$API_PROXY_PID" "$API_PROXY_START" "$PUBLIC_PORT" "api prefix proxy"
}

_api_shutdown() {
  _api_stop_child "$API_PROXY_PID" "$API_PROXY_START" "api-proxy"
  _api_stop_child "$API_GATEWAY_PID" "$API_GATEWAY_START" "api-gateway"
  API_PROXY_PID="" API_PROXY_START=""
  API_GATEWAY_PID="" API_GATEWAY_START=""
}

_api_recent_exits_over_budget() {
  # $1 = now; remaining args are prior exit timestamps. Prints nothing; returns
  # 0 when more than 5 exits occurred inside the trailing 60s window.
  local cutoff=$(($1 - 60)) count=0 ts
  shift
  for ts in "$@"; do
    [ "$ts" -ge "$cutoff" ] && count=$((count + 1))
  done
  [ "$count" -gt 5 ]
}

_api_prune_exits() {
  # Echo the exit timestamps still inside the trailing 60s window.
  local cutoff=$(($1 - 60)) ts
  shift
  for ts in "$@"; do
    [ "$ts" -ge "$cutoff" ] && printf '%s\n' "$ts"
  done
}

_api_supervise() {
  local -a gateway_exits=() proxy_exits=()
  local design_fp_applied design_fp_pending="" design_fp_now
  design_fp_applied="$DESIGN_FP_APPLIED"
  while :; do
    # The admin side edits the api profile's design files through ordinary
    # writes; the gateway only reads them at boot, so a stable fingerprint
    # change restarts it. The one-tick debounce lets a write burst settle
    # instead of restarting once per touched file.
    design_fp_now="$(_api_design_fingerprint)"
    if [ "$design_fp_now" != "$design_fp_applied" ]; then
      if [ "$design_fp_now" = "$design_fp_pending" ]; then
        log "api design files changed; restarting api profile gateway"
        _api_stop_child "$API_GATEWAY_PID" "$API_GATEWAY_START" "api-gateway"
        API_GATEWAY_PID="" API_GATEWAY_START=""
        design_fp_applied="$design_fp_now"
        design_fp_pending=""
        # A SIGKILLed child can leave its listener socket mid-teardown; wait
        # for the port to release before the respawn path binds it again.
        _api_wait_port_free "$API_INTERNAL_PORT" || {
          log "api gateway port did not release after design restart"
          _api_shutdown
          return 1
        }
      else
        design_fp_pending="$design_fp_now"
      fi
    fi
    if [ -n "$API_GATEWAY_PID" ] \
      && ! gateway_control_pid_matches_start_identity \
        "$API_GATEWAY_PID" "$API_GATEWAY_START"; then
      log "api profile gateway pid ${API_GATEWAY_PID} exited"
      gateway_exits+=("$SECONDS")
      API_GATEWAY_PID="" API_GATEWAY_START=""
    fi
    if [ -n "$API_PROXY_PID" ] \
      && ! gateway_control_pid_matches_start_identity \
        "$API_PROXY_PID" "$API_PROXY_START"; then
      log "api prefix proxy pid ${API_PROXY_PID} exited"
      proxy_exits+=("$SECONDS")
      API_PROXY_PID="" API_PROXY_START=""
    fi
    if [ -z "$API_GATEWAY_PID" ] || [ -z "$API_PROXY_PID" ]; then
      # Respawn only while the root-sealed contract still verifies.
      _api_verify_contract || {
        log "api profile contract verification failed during supervision; stopping"
        _api_shutdown
        return 1
      }
    fi
    if [ -z "$API_GATEWAY_PID" ]; then
      mapfile -t gateway_exits < <(_api_prune_exits "$SECONDS" "${gateway_exits[@]}")
      if _api_recent_exits_over_budget "$SECONDS" "${gateway_exits[@]}"; then
        log "api gateway exceeded respawn budget; refusing further relaunch"
        _api_shutdown
        return 1
      fi
      log "respawning api profile gateway"
      _api_spawn_gateway || {
        _api_shutdown
        return 1
      }
      _api_wait_owned_listener \
        "$API_GATEWAY_PID" "$API_GATEWAY_START" "$API_INTERNAL_PORT" \
        "api profile gateway" || {
        _api_shutdown
        return 1
      }
    fi
    if [ -z "$API_PROXY_PID" ]; then
      mapfile -t proxy_exits < <(_api_prune_exits "$SECONDS" "${proxy_exits[@]}")
      if _api_recent_exits_over_budget "$SECONDS" "${proxy_exits[@]}"; then
        log "api prefix proxy exceeded respawn budget; refusing further relaunch"
        _api_shutdown
        return 1
      fi
      log "respawning api prefix proxy"
      _api_spawn_proxy || {
        _api_shutdown
        return 1
      }
      _api_wait_owned_listener \
        "$API_PROXY_PID" "$API_PROXY_START" "$PUBLIC_PORT" "api prefix proxy" || {
        _api_shutdown
        return 1
      }
    fi
    sleep 2 || true
  done
}

# ── Payload network namespace ────────────────────────────────────
# docker exec lands in the OpenShell supervisor's network namespace (PID 1's),
# whose loopback cannot see payload listeners: sandbox payload processes —
# nemoclaw-start, the main gateway, and everything OpenShell exec spawns —
# run in a dedicated netns. The api stack must live there too: the prefix
# proxy fallthrough targets the main gateway's 127.0.0.1:18642, and
# ClawShell's readiness probes arrive through OpenShell exec, which joins
# the payload netns. Re-exec into it once before any listener work so every
# /proc/net/tcp check and spawned child resolves the right loopback.
#
# The anchor is the pinned nemoclaw-start pid — the same supervised process
# the guard requires for bootstrap — verified live and by cmdline before its
# namespace is borrowed. In non-OpenShell topologies nemoclaw-start already
# shares the only netns, and the self-comparison skips the re-exec.
_api_resolve_payload_ns_pid() {
  local pid_file="/sandbox/.hermes/runtime/nemoclaw-start.pid" pid cmdline
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  case "$pid" in '' | *[!0-9]*) return 1 ;; esac
  gateway_control_pid_is_live "$pid" || return 1
  cmdline="$(tr '\0' ' ' <"/proc/${pid}/cmdline" 2>/dev/null || true)"
  case "$cmdline" in
    *nemoclaw-start*) ;;
    *) return 1 ;;
  esac
  PAYLOAD_NS_PID="$pid"
}
PAYLOAD_NS_PID=""
if [ "$ACTION" != "stop" ]; then
  if ! _api_resolve_payload_ns_pid; then
    echo "[api-runtime] cannot resolve the payload network namespace anchor (nemoclaw-start pid)" >&2
    exit 1
  fi
  if [ "$(readlink /proc/self/ns/net)" != "$(readlink "/proc/${PAYLOAD_NS_PID}/ns/net")" ]; then
    command -v nsenter >/dev/null 2>&1 || {
      echo "[api-runtime] nsenter is required to join the payload network namespace" >&2
      exit 1
    }
    exec nsenter -t "$PAYLOAD_NS_PID" -n -- "$0" "$ACTION"
  fi
fi

# ── Supervisor singleton ─────────────────────────────────────────
# The lock serializes start/replace across concurrent privileged exec calls.
exec 9>"$SUPERVISOR_LOCK_FILE"
if [ "$ACTION" = "stop" ]; then
  if [ -r "$SUPERVISOR_PID_FILE" ]; then
    old_pid="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
    case "$old_pid" in
      '' | *[!0-9]*) ;;
      *)
        if kill -0 "$old_pid" 2>/dev/null; then
          log "stopping api runtime supervisor (pid ${old_pid})"
          kill "$old_pid" 2>/dev/null || true
          for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
            kill -0 "$old_pid" 2>/dev/null || break
            sleep 0.25
          done
        fi
        ;;
    esac
  fi
  # Belt-and-braces: reap any api children the supervisor did not own.
  _api_kill_stale_children
  exit 0
fi
if [ "$ACTION" = "replace" ]; then
  if [ -r "$SUPERVISOR_PID_FILE" ]; then
    old_pid="$(cat "$SUPERVISOR_PID_FILE" 2>/dev/null || true)"
    case "$old_pid" in
      '' | *[!0-9]*) ;;
      *)
        if [ "$old_pid" != "$$" ] && kill -0 "$old_pid" 2>/dev/null; then
          log "stopping existing api runtime supervisor (pid ${old_pid})"
          kill "$old_pid" 2>/dev/null || true
        fi
        ;;
    esac
  fi
  flock -w 30 9 || {
    log "timed out waiting for the previous api runtime supervisor to stop"
    exit 1
  }
else
  if ! flock -n 9; then
    log "api runtime supervisor already running"
    exit 0
  fi
fi
printf '%s\n' "$$" >"$SUPERVISOR_PID_FILE"
chmod 0600 "$SUPERVISOR_PID_FILE"

# Trap before any launch so a TERM mid-startup never orphans children.
trap '_api_shutdown; rm -f "$SUPERVISOR_PID_FILE"; exit 0' SIGTERM SIGINT

_api_kill_stale_children
_api_wait_port_free "$API_INTERNAL_PORT" || exit 1
_api_wait_port_free "$PUBLIC_PORT" || exit 1

if ! _api_launch_stack; then
  _api_shutdown
  rm -f "$SUPERVISOR_PID_FILE"
  exit 1
fi

_api_supervise
