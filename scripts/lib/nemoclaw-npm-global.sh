# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
# shellcheck shell=sh
#
# NemoClaw sandbox npm global prefix (derekhsu/NemoClaw#67).
#
# Installed as /etc/profile.d/nemoclaw-sandbox-npm-global.sh. /usr/local
# belongs to root, so `npm install -g` by the sandbox user needs a prefix it
# owns. This hook defaults npm's global prefix to /sandbox/.npm-global and puts
# the active prefix's bin directory on the login-shell PATH, so installed
# commands run by name. ~/.bashrc and ~/.profile are root-owned and read-only,
# and /etc/profile resets PATH, so /etc/profile.d is the only place this
# setting survives.
#
# - Sandbox user only: npm prefixes are sandbox-writable and must not reach
#   root or the service accounts. `id` is called by absolute path so a
#   sandbox-writable directory earlier on PATH cannot spoof the user check.
# - A prefix that is already set is kept, for example the /tmp/npm-global
#   redirect that nemoclaw-start exports to its children and writes to
#   /tmp/nemoclaw-proxy-env.sh. The file name sorts after nemoclaw-proxy.sh,
#   which sources that file, so this hook sees the redirect.
# - The bin directory is appended, so it never shadows system commands.
if [ "$(/usr/bin/id -un 2>/dev/null || true)" = sandbox ]; then
  if [ -z "${npm_config_prefix:-}" ] && [ -z "${NPM_CONFIG_PREFIX:-}" ]; then
    npm_config_prefix=/sandbox/.npm-global
    export npm_config_prefix
  fi
  _nemoclaw_npm_bin="${npm_config_prefix:-${NPM_CONFIG_PREFIX:-}}/bin"
  case "${_nemoclaw_npm_bin}" in
    /*)
      case ":${PATH}:" in
        *:"${_nemoclaw_npm_bin}":*) ;;
        *)
          PATH="${PATH}:${_nemoclaw_npm_bin}"
          export PATH
          ;;
      esac
      ;;
  esac
  unset _nemoclaw_npm_bin
fi
