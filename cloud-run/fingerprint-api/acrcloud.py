"""ACRCloud signed identification client.

Provider credentials are read only from environment variables. In Cloud Run,
bind these variables to Secret Manager versions with --set-secrets.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx


@dataclass
class ACRCloudUnavailable(Exception):
    category: str
    provider_code: int | str | None = None


def build_signature(
    access_secret: str,
    access_key: str,
    timestamp: str,
    data_type: str = "audio",
    signature_version: str = "1",
) -> str:
    """Build the ACRCloud Identification API HMAC-SHA1 signature."""
    string_to_sign = "\n".join(
        ["POST", "/v1/identify", access_key, data_type, signature_version, timestamp]
    )
    digest = hmac.new(
        access_secret.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha1,
    ).digest()
    return base64.b64encode(digest).decode("ascii")


def _endpoint_from_host(raw_host: str) -> str:
    host = raw_host.strip()
    if not host:
        raise ACRCloudUnavailable("configuration")
    if "://" not in host:
        host = f"https://{host}"
    parsed = urlparse(host)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ACRCloudUnavailable("configuration")
    return f"https://{parsed.netloc}/v1/identify"


def _config() -> tuple[str, str, str]:
    host = os.getenv("ACRCLOUD_HOST", "")
    access_key = os.getenv("ACRCLOUD_ACCESS_KEY", "")
    access_secret = os.getenv("ACRCLOUD_ACCESS_SECRET", "")
    if not host or not access_key or not access_secret:
        raise ACRCloudUnavailable("configuration")
    return _endpoint_from_host(host), access_key, access_secret


def _normalized_matches(payload: dict[str, Any]) -> list[dict[str, Any]]:
    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        return []

    candidates: list[dict[str, Any]] = []
    for collection in ("music", "custom_files"):
        values = metadata.get(collection)
        if not isinstance(values, list):
            continue
        for item in values:
            if not isinstance(item, dict):
                continue
            external_ids = item.get("external_ids")
            candidates.append(
                {
                    "title": item.get("title"),
                    "artists": [
                        artist.get("name")
                        for artist in item.get("artists", [])
                        if isinstance(artist, dict) and artist.get("name")
                    ],
                    "album": (
                        item.get("album", {}).get("name")
                        if isinstance(item.get("album"), dict)
                        else None
                    ),
                    "isrc": (
                        external_ids.get("isrc")
                        if isinstance(external_ids, dict)
                        else None
                    ),
                    "score": item.get("score"),
                    "acr_id": item.get("acrid"),
                }
            )
    return candidates


async def identify_audio(sample: bytes) -> dict[str, Any]:
    endpoint, access_key, access_secret = _config()
    timestamp = str(int(time.time()))
    signature_version = "1"
    data_type = "audio"
    signature = build_signature(
        access_secret, access_key, timestamp, data_type, signature_version
    )

    form = {
        "access_key": access_key,
        "sample_bytes": str(len(sample)),
        "timestamp": timestamp,
        "signature": signature,
        "data_type": data_type,
        "signature_version": signature_version,
    }
    files = {"sample": ("sample.wav", sample, "application/octet-stream")}
    timeout = httpx.Timeout(connect=5.0, read=15.0, write=15.0, pool=5.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(endpoint, data=form, files=files)
    except httpx.TimeoutException as exc:
        raise ACRCloudUnavailable("timeout") from exc
    except httpx.RequestError as exc:
        raise ACRCloudUnavailable("network") from exc

    # Authentication and billing suspension must never propagate as an app
    # outage. They become a temporary scan outage at this service boundary.
    if response.status_code in (401, 402):
        raise ACRCloudUnavailable("auth_or_billing", response.status_code)
    if response.status_code < 200 or response.status_code >= 300:
        raise ACRCloudUnavailable("provider_http", response.status_code)

    try:
        payload = response.json()
    except ValueError as exc:
        raise ACRCloudUnavailable("invalid_response") from exc

    status = payload.get("status") if isinstance(payload, dict) else None
    code = status.get("code") if isinstance(status, dict) else None
    if code == 1001:
        return {"status": "no_match", "provider": "acrcloud", "matches": []}
    if code != 0:
        raise ACRCloudUnavailable("provider_status", code)

    matches = _normalized_matches(payload)
    return {
        "status": "match" if matches else "no_match",
        "provider": "acrcloud",
        "matches": matches,
    }