"""Gateway HTTP client for sandbox artifact delivery links."""

import os
from pathlib import Path
from typing import Any

import httpx


class GatewayError(Exception):
    """Error raised when a Gateway API request fails."""

    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class GatewayClient:
    """HTTP client for the ClawShell Gateway file-download API."""

    DOWNLOAD_URL_EXPIRES_IN_SECONDS = 300
    DOWNLOAD_URL_MAX_USES = 5

    def __init__(self, base_url: str, api_key: str, sandbox_id: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.sandbox_id = sandbox_id
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={
                "X-Gateway-Api-Key": api_key,
                "Accept": "application/json",
            },
        )

    @classmethod
    def from_env(cls) -> "GatewayClient":
        base_url = os.getenv("GATEWAY_URL")
        api_key = os.getenv("GATEWAY_API_KEY")
        sandbox_id = os.getenv("SANDBOX_ID")
        if not base_url:
            raise GatewayError("Missing required environment variable: GATEWAY_URL")
        if not api_key:
            raise GatewayError("Missing required environment variable: GATEWAY_API_KEY")
        if not sandbox_id:
            raise GatewayError("Missing required environment variable: SANDBOX_ID")
        return cls(base_url=base_url, api_key=api_key, sandbox_id=sandbox_id)

    def upload_file(self, file_path: str) -> dict[str, Any]:
        """Return a Gateway-issued signed download link for an existing file."""
        path = Path(file_path)
        if not path.is_file():
            raise GatewayError(f"File not found: {file_path}")
        try:
            response = self._client.post(
                f"/api/sandboxes/{self.sandbox_id}/files/generate-download-url",
                json={
                    "path": str(path),
                    "expires_in_seconds": self.DOWNLOAD_URL_EXPIRES_IN_SECONDS,
                    "max_uses": self.DOWNLOAD_URL_MAX_USES,
                },
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as error:
            try:
                detail = error.response.json().get("detail", str(error))
            except Exception:
                detail = str(error)
            raise GatewayError(
                f"Gateway error: {detail}", status_code=error.response.status_code
            ) from error
        except httpx.RequestError as error:
            raise GatewayError(f"Request failed: {error}") from error

        result = response.json()
        data = result.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("download_url"), str):
            raise GatewayError("Gateway error: Missing download_url in response")
        return data

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> "GatewayClient":
        return self

    def __exit__(self, *args: object) -> None:
        self.close()
