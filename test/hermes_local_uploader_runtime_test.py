"""Credential-free integration coverage for the managed Hermes file uploader."""

from __future__ import annotations

from unittest.mock import Mock, patch

import pytest

from sandbox_mcp_server.gateway_client import GatewayError
from sandbox_mcp_server.server import create_server


@pytest.fixture(autouse=True)
def gateway_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GATEWAY_URL", "http://gateway.test:8001")
    monkeypatch.setenv("GATEWAY_API_KEY", "provider-bound-test-key")
    monkeypatch.setenv("SANDBOX_ID", "sbx-runtime-test")


def _gateway_client(*responses: object) -> Mock:
    client = Mock()
    client.__enter__ = Mock(return_value=client)
    client.__exit__ = Mock(return_value=False)
    client.upload_file.side_effect = responses
    return client


@pytest.mark.asyncio
async def test_allowed_file_returns_gateway_signed_download_link(tmp_path) -> None:
    allowed_file = tmp_path / "report.txt"
    allowed_file.write_text("runtime delivery proof\n", encoding="utf-8")
    client = _gateway_client({"download_url": "/download/signed-report"})

    with patch("sandbox_mcp_server.server.GatewayClient") as gateway_client:
        gateway_client.from_env.return_value = client
        result = await create_server().call_tool(
            "upload_file", {"file_path": str(allowed_file), "description": "Runtime report"}
        )

    assert "[Runtime report](/download/signed-report)" in str(result)
    client.upload_file.assert_called_once_with(str(allowed_file))


@pytest.mark.asyncio
async def test_gateway_denial_never_returns_a_download_link(tmp_path) -> None:
    denied_file = tmp_path / "protected.txt"
    denied_file.write_text("not deliverable\n", encoding="utf-8")
    client = _gateway_client(GatewayError("Gateway error: path is protected", status_code=403))

    with patch("sandbox_mcp_server.server.GatewayClient") as gateway_client:
        gateway_client.from_env.return_value = client
        result = await create_server().call_tool("upload_file", {"file_path": str(denied_file)})

    assert "Error: Gateway error: path is protected" in str(result)
    assert "download" not in str(result).lower()


@pytest.mark.asyncio
async def test_missing_provider_credential_fails_before_upload(tmp_path, monkeypatch) -> None:
    upload_file = tmp_path / "missing-credential.txt"
    upload_file.write_text("credential boundary\n", encoding="utf-8")
    monkeypatch.delenv("GATEWAY_API_KEY")

    result = await create_server().call_tool("upload_file", {"file_path": str(upload_file)})

    assert "Missing required environment variable: GATEWAY_API_KEY" in str(result)


@pytest.mark.asyncio
async def test_retry_after_a_transient_gateway_error_is_safe(tmp_path) -> None:
    upload_file = tmp_path / "retry.txt"
    upload_file.write_text("retry proof\n", encoding="utf-8")
    client = _gateway_client(
        GatewayError("Request failed: temporary outage"),
        {"download_url": "/download/retry-success"},
    )

    with patch("sandbox_mcp_server.server.GatewayClient") as gateway_client:
        gateway_client.from_env.return_value = client
        mcp = create_server()
        first = await mcp.call_tool("upload_file", {"file_path": str(upload_file)})
        second = await mcp.call_tool("upload_file", {"file_path": str(upload_file)})

    assert "Error: Request failed: temporary outage" in str(first)
    assert "[retry.txt](/download/retry-success)" in str(second)
    assert client.upload_file.call_count == 2
