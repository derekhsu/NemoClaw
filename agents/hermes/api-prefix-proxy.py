# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Public-port prefix proxy for the dedicated api-profile gateway.

The public API port is a single listener; ``/p/api`` traffic must reach the
dedicated ``hermesapi``-uid gateway while every other path stays on the main
gateway. socat forwards TCP only, so this minimal aiohttp reverse proxy splits
by URL prefix instead. The prefix is preserved — the api gateway recognizes
its own ``/p/api/`` prefix natively.

Environment:
    NEMOCLAW_PROXY_LISTEN_PORT   public listen port (default 8642)
    NEMOCLAW_PROXY_MAIN_PORT     main gateway loopback port (default 18642)
    NEMOCLAW_PROXY_API_PORT      api gateway loopback port (default 18699)
    NEMOCLAW_API_PROFILE_PREFIX  routed prefix (default /p/api)
"""

from __future__ import annotations

import os
import sys

from aiohttp import ClientSession, ClientTimeout, TCPConnector, web
from aiohttp.client_exceptions import ClientError

HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "host",
        "content-length",
    }
)


def _upstream_port(path: str, prefix: str, main_port: int, api_port: int) -> int:
    if path == prefix or path.startswith(prefix + "/"):
        return api_port
    return main_port


async def _handle(request: web.Request) -> web.StreamResponse:
    app = request.app
    port = _upstream_port(
        request.path, app["prefix"], app["main_port"], app["api_port"]
    )
    url = f"http://127.0.0.1:{port}{request.rel_url}"
    headers = {
        k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP
    }
    headers["host"] = f"127.0.0.1:{port}"
    session: ClientSession = app["session"]
    try:
        upstream = await session.request(
            request.method,
            url,
            headers=headers,
            data=request.content.iter_any(),
            allow_redirects=False,
        )
    except ClientError:
        return web.Response(status=502, text="upstream gateway unavailable")
    try:
        response = web.StreamResponse(
            status=upstream.status,
            reason=upstream.reason,
            headers={
                k: v
                for k, v in upstream.headers.items()
                if k.lower() not in HOP_BY_HOP
            },
        )
        await response.prepare(request)
        async for chunk in upstream.content.iter_any():
            await response.write(chunk)
        await response.write_eof()
        return response
    finally:
        upstream.release()


def main() -> int:
    listen_port = int(os.environ.get("NEMOCLAW_PROXY_LISTEN_PORT", "8642"))
    main_port = int(os.environ.get("NEMOCLAW_PROXY_MAIN_PORT", "18642"))
    api_port = int(os.environ.get("NEMOCLAW_PROXY_API_PORT", "18699"))
    prefix = os.environ.get("NEMOCLAW_API_PROFILE_PREFIX", "/p/api").rstrip("/")

    async def on_startup(app: web.Application) -> None:
        # No total timeout: long-running streaming chat completions must not
        # be cut off by the proxy. Per-hop errors surface as ClientError.
        app["session"] = ClientSession(
            timeout=ClientTimeout(total=None, sock_connect=10),
            connector=TCPConnector(limit=256, force_close=False),
        )

    async def on_cleanup(app: web.Application) -> None:
        await app["session"].close()

    app = web.Application()
    app["prefix"] = prefix
    app["main_port"] = main_port
    app["api_port"] = api_port
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    app.router.add_route("*", "/{tail:.*}", _handle)
    web.run_app(app, host="0.0.0.0", port=listen_port, print=None)
    return 0


if __name__ == "__main__":
    sys.exit(main())
