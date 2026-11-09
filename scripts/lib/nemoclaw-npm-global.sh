# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
# shellcheck shell=sh
#
# NemoClaw sandbox npm global prefix (derekhsu/NemoClaw#67).
#
# Installed as /etc/profile.d/nemoclaw-npm-global.sh. /usr/local belongs to
# root, so `npm install -g` by the sandbox user needs a prefix it owns. This
# hook points npm's global prefix at /sandbox/.npm-global and puts its bin
# directory on the login-shell PATH, so installed commands run by name.
# ~/.bashrc and ~/.profile are root-owned and read-only, and /etc/profile
# resets PATH, so /etc/profile.d is the only place this setting survives.
#
# - Sandbox user only: /sandbox/.npm-global is sandbox-writable and must not
#   reach root or the service accounts. `id` is called by absolute path so a
#   sandbox-writable directory earlier on PATH cannot spoof the user check.
# - The bin directory is appended, so it never shadows system commands.
# - A prefix that is already set in the environment is kept, for example the
#   /tmp/npm-global redirect that nemoclaw-start exports.
if [ "$(/usr/bin/id -un 2>/dev/null || true)" = sandbox ]; then
  if [ -z "${npm_config_prefix:-}" ] && [ -z "${NPM_CONFIG_PREFIX:-}" ]; then
    npm_config_prefix=/sandbox/.npm-global
    export npm_config_prefix
  fi
  case ":${PATH}:" in
    *:/sandbox/.npm-global/bin:*) ;;
    *)
      PATH="${PATH}:/sandbox/.npm-global/bin"
      export PATH
      ;;
  esac
fi
