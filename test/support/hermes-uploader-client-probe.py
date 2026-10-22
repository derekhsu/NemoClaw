# SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
# SPDX-License-Identifier: Apache-2.0
"""Exercise the shipped Gateway client with a credential-free HTTP adapter."""

import builtins
import contextlib
import io
import json
import logging
import os
import socket
import sys
import types
from unittest.mock import patch

sys.path.insert(0, sys.argv[1])
key = os.environ["GATEWAY_API_KEY"]
requests = []
closed = []


class StatusError(Exception):
    pass


class Client:
    def __init__(self, **options):
        self.options = options

    def post(self, url, **options):
        requests.append({"url": url, "body": options["json"], "authenticated": self.options["headers"]["X-Gateway-Api-Key"] == key})
        return types.SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"data": {"download_url": "/download/signed-report"}})

    def close(self):
        closed.append(True)


sys.modules["httpx"] = types.SimpleNamespace(Client=Client, HTTPStatusError=StatusError, RequestError=OSError)
output = io.StringIO()
handler = logging.StreamHandler(output)
logging.getLogger().addHandler(handler)
logging.getLogger().setLevel(logging.DEBUG)
original_open = builtins.open


def read_only_open(file, mode="r", *args, **kwargs):
    if any(flag in mode for flag in "wax+"):
        raise AssertionError("Uploader attempted an unexpected file write")
    return original_open(file, mode, *args, **kwargs)


def no_probe(*args, **kwargs):
    raise AssertionError("Uploader attempted an unexpected socket probe")


with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output), patch("builtins.open", read_only_open), patch("io.open", read_only_open), patch.object(socket, "socket", no_probe):
    from sandbox_mcp_server.gateway_client import GatewayClient, GatewayError
    with GatewayClient.from_env() as client:
        link = client.upload_file(sys.argv[2])
    del os.environ["GATEWAY_API_KEY"]
    try:
        GatewayClient.from_env()
    except GatewayError as error:
        missing = str(error)
    else:
        raise AssertionError("Missing credential was accepted")
logging.getLogger().removeHandler(handler)
print(json.dumps({"requests": requests, "closed": closed, "link": link, "missing": missing, "output": output.getvalue()}))
