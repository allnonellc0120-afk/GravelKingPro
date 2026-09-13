"""GravelKing commercial fingerprint gateway for Google Cloud Run."""

from __future__ import annotations

import hmac
import logging
import os
import asyncio
import sys
import subprocess
import tempfile
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from acrcloud import ACRCloudUnavailable, identify_audio
from lib.gka_middleware import GKAdvantageCore

logger = logging.getLogger("gkp-fingerprint")
app = FastAPI(
    title="GravelKing Fingerprint Gateway",
    description="Fail-closed ACRCloud recognition boundary for certificate stamping.",
    version="1.0.0",
)

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
SAMPLE_SECONDS = 12
GKA_CORE = GKAdvantageCore(multiplier=0.75, slice_size=2)


def _authorize(presented_key: str | None) -> None:
    expected = os.getenv("FINGERPRINT_SERVICE_API_KEY", "")
    # A missing service key is a deployment error, not permission to expose the
    # provider-backed endpoint publicly.
    if not expected:
        raise HTTPException(status_code=503, detail="Scan temporarily unavailable")
    if not presented_key or not hmac.compare_digest(presented_key, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _make_sample(source_path: str, parent_id: str | None = None) -> bytes:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as out:
        sample_path = out.name
    try:
        with GKA_CORE.task(
            "fingerprint_sample_transcode",
            parent_id=parent_id,
            metadata={"sample_seconds": SAMPLE_SECONDS, "sample_rate": 8000},
        ):
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    source_path,
                    "-t",
                    str(SAMPLE_SECONDS),
                    "-vn",
                    "-ac",
                    "1",
                    "-ar",
                    "8000",
                    "-c:a",
                    "pcm_s16le",
                    sample_path,
                ],
                capture_output=True,
                check=True,
                timeout=30,
            )
            with open(sample_path, "rb") as sample_file:
                return sample_file.read()
    except (subprocess.SubprocessError, OSError) as exc:
        raise HTTPException(status_code=422, detail="Audio could not be scanned") from exc
    finally:
        try:
            os.unlink(sample_path)
        except OSError:
            pass


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "gkp-fingerprint",
        "provider": "acrcloud",
        "configured": all(
            os.getenv(name)
            for name in (
                "ACRCLOUD_HOST",
                "ACRCLOUD_ACCESS_KEY",
                "ACRCLOUD_ACCESS_SECRET",
                "FINGERPRINT_SERVICE_API_KEY",
            )
        ),
    }


@app.post("/v1/fingerprint/scan")
async def scan(
    audio: UploadFile = File(...),
    x_api_key: str | None = Header(default=None),
) -> JSONResponse:
    _authorize(x_api_key)
    suffix = os.path.splitext(audio.filename or "upload.wav")[1] or ".wav"
    source_path: str | None = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as source:
            source_path = source.name
            total = 0
            while chunk := await audio.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Audio sample is too large")
                source.write(chunk)

        with GKA_CORE.task(
            "fingerprint_scan",
            metadata={"filename": audio.filename or "upload.wav", "provider": "acrcloud"},
        ) as scan_task:
            sample = await asyncio.to_thread(_make_sample, source_path, scan_task)
            result = await identify_audio(sample)
            response = dict(result)
            response["gka"] = GKA_CORE.verify_parity()
            response["gka_lineage"] = GKA_CORE.lineage_snapshot()[-2:]
        return JSONResponse(response)
    except HTTPException:
        raise
    except ACRCloudUnavailable as exc:
        logger.warning(
            "ACRCloud scan unavailable category=%s provider_code=%s",
            exc.category,
            exc.provider_code,
        )
        return JSONResponse(
            status_code=503,
            content={
                "status": "unavailable",
                "code": "SCAN_TEMPORARILY_UNAVAILABLE",
                "message": "Scan temporarily unavailable",
            },
        )
    except Exception:
        logger.exception("Unexpected fingerprint gateway failure")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unavailable",
                "code": "SCAN_TEMPORARILY_UNAVAILABLE",
                "message": "Scan temporarily unavailable",
            },
        )
    finally:
        if source_path:
            try:
                os.unlink(source_path)
            except OSError:
                pass