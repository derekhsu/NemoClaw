#!/usr/bin/env python3
# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Keep the sandbox egress proxy on Hermes' remote MCP HTTP clients.

Source-of-truth note for this localized Hermes runtime patch:
  - Invalid state: Hermes v0.21.3 builds its Streamable HTTP and SSE MCP clients
    with a custom ``transport=`` (to cap response bodies and carry TLS
    settings). httpx ignores HTTP(S)_PROXY/NO_PROXY whenever a transport is
    passed, so these clients connect directly. An OpenShell sandbox network
    namespace has no DNS and reaches the network only through the egress
    proxy, so every remote MCP server fails with
    ``[Errno -3] Temporary failure in name resolution`` while the rest of the
    gateway, which uses default clients, reaches the same host (#53).
  - Value being patched: pinned/prebuilt ``/opt/hermes/tools/mcp_tool_transport.py``.
    A helper after ``_present`` resolves the environment proxy for the server
    URL with the standard library's proxy rules (scheme then ``all_proxy``,
    honoring ``no_proxy``). The inner ``AsyncHTTPTransport`` of both client
    factories receives it as ``proxy=``. Without a proxy variable, or for a
    ``no_proxy`` host, the transport is built exactly as before.
  - Source-fix constraint: NemoClaw layers a sandbox image on top of the
    published Hermes runtime; the source fix belongs upstream in Hermes, not in
    NemoClaw's TypeScript or wrapper code.
  - Regression evidence: on first application, this patcher accepts exactly one
    unpatched helper anchor and two unpatched transport constructions, with no
    proxy helper. A later application accepts exactly the complete patched
    shape. Every other source shape fails without writing. The image-build
    ``mcp-http-proxy`` probe imports the patched module and checks the proxy
    selection for proxied and ``no_proxy`` URLs.
  - Removal condition: delete this patch when the pinned Hermes runtime keeps
    environment proxies on its MCP HTTP transports.
"""

from __future__ import annotations

import argparse
from pathlib import Path

HELPER_ANCHOR = '''def _present(**kwargs) -> dict:
    """*kwargs* minus the ``None`` values (optional httpx client arguments)."""
    return {k: v for k, v in kwargs.items() if v is not None}
'''
HELPER_NAME = "_nemoclaw_env_proxy"
HELPER = f'''

def {HELPER_NAME}(url) -> dict:
    """NemoClaw: a custom ``transport=`` makes httpx skip HTTP(S)_PROXY/NO_PROXY.

    OpenShell sandboxes reach the network only through the egress proxy, so
    resolve it for *url* (scheme, then ``all``; ``no_proxy`` bypasses) and pass
    it to the inner transport explicitly.
    """
    import urllib.parse
    import urllib.request

    parts = urllib.parse.urlsplit(str(url))
    host = parts.hostname or ""
    if not host or urllib.request.proxy_bypass_environment(host):
        return {{}}
    proxies = urllib.request.getproxies_environment()
    proxy = proxies.get(parts.scheme.lower()) or proxies.get("all")
    return {{"proxy": proxy}} if proxy else {{}}
'''
SSE_OLD = "_httpx_mod.AsyncHTTPTransport(verify=ssl_verify, **_present(cert=client_cert))"
SSE_NEW = (
    "_httpx_mod.AsyncHTTPTransport(verify=ssl_verify, **_present(cert=client_cert),"
    f" **{HELPER_NAME}(url))"
)
HTTP_OLD = "httpx.AsyncHTTPTransport(verify=ssl_verify, **_present(cert=client_cert))"
HTTP_NEW = (
    "httpx.AsyncHTTPTransport(verify=ssl_verify, **_present(cert=client_cert),"
    f" **{HELPER_NAME}(url))"
)


def _counts(source: str) -> tuple[int, int, int, int, int, int]:
    # "_httpx_mod.AsyncHTTPTransport" does not contain "httpx.AsyncHTTPTransport",
    # so the SSE and Streamable HTTP constructions are counted independently.
    return (
        source.count(HELPER_ANCHOR),
        source.count(f"def {HELPER_NAME}("),
        source.count(SSE_OLD),
        source.count(HTTP_OLD),
        source.count(SSE_NEW),
        source.count(HTTP_NEW),
    )


def patch_file(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    anchor, helper, sse_old, http_old, sse_new, http_new = _counts(source)
    if (anchor, helper, sse_old, http_old, sse_new, http_new) == (1, 1, 0, 0, 1, 1) and (
        source.count(HELPER_ANCHOR + HELPER) == 1
    ):
        return
    if (anchor, helper, sse_old, http_old, sse_new, http_new) != (1, 0, 1, 1, 0, 0):
        raise SystemExit(
            "ERROR: Hermes MCP HTTP transport shape changed; expected one _present "
            "helper, one SSE and one Streamable HTTP AsyncHTTPTransport construction, "
            f"and no proxy helper; found anchor={anchor} helper={helper} "
            f"sse={sse_old}/{sse_new} http={http_old}/{http_new} (unpatched/patched)"
        )
    patched = source.replace(HELPER_ANCHOR, HELPER_ANCHOR + HELPER, 1)
    patched = patched.replace(SSE_OLD, SSE_NEW, 1)
    patched = patched.replace(HTTP_OLD, HTTP_NEW, 1)
    compile(patched, str(path), "exec")
    path.write_text(patched, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "path",
        nargs="?",
        default="/opt/hermes/tools/mcp_tool_transport.py",
        help="Hermes MCP transport module to patch",
    )
    args = parser.parse_args()
    patch_file(Path(args.path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
