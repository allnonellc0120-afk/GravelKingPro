"""
GravelKing IP Verification API v3.5 — LIVE

Split-key verification model:
  - The NOMINATOR rides inside the track itself (LSB watermark, public by design).
  - The DENOMINATOR + HMAC handshake live only on the GravelKing production server.

This service extracts the nominator locally (transparency), then asks the live
GravelKing server for the authoritative verdict. It never fabricates validity:
only a well-formed HTTP 200 JSON verdict from the server counts. Anything else
(unreachable server, 4xx/5xx, non-JSON body, malformed schema) is surfaced as a
backend failure — HTTP 503 here — never as a "certified" or "not certified" answer.

LSB scheme (must stay bit-identical to kernel-v3.ts on the server):
  frame = GKP_MAGIC ("GKPW\\x03") + uint16BE payload length + payload
  One frame bit per int16 PCM sample LSB, bits packed MSB-first per byte.
"""

import io
import json
import os
import struct
from typing import Any

import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

GRAVELKING_VERIFY_URL = os.environ.get(
    "GRAVELKING_VERIFY_URL",
    "https://gravelkingpro.it.com/api/kernel/verify-cert",
)
GKP_MAGIC = b"GKPW\x03"  # 5 bytes, format version 3 — must match kernel-v3.ts


class VerificationBackendError(RuntimeError):
    """Raised when no authoritative verdict could be obtained from the
    GravelKing server (unreachable, non-200 status, non-JSON body, or a
    malformed verdict schema). A backend failure is surfaced as a failure —
    it is never converted into a cert verdict, positive or negative."""


app = FastAPI(title="GravelKing IP Verification API v3.5 (live)")


# ── WAV + LSB extraction (faithful port of kernel-v3.ts) ─────────────────────

def _parse_wav(buf: bytes) -> tuple[tuple[int, int, int], int, int]:
    """Walk RIFF chunks to find fmt + data (ffmpeg WAVs may carry LIST/INFO
    chunks, so fixed 44-byte offsets cannot be assumed)."""
    if len(buf) < 12 or buf[0:4] != b"RIFF" or buf[8:12] != b"WAVE":
        raise ValueError("Invalid WAV: missing RIFF/WAVE header")
    offset = 12
    fmt: tuple[int, int, int] | None = None
    while offset + 8 <= len(buf):
        chunk_id = buf[offset:offset + 4]
        (chunk_size,) = struct.unpack_from("<I", buf, offset + 4)
        body = offset + 8
        if chunk_id == b"fmt ":
            (num_channels,) = struct.unpack_from("<H", buf, body + 2)
            (sample_rate,) = struct.unpack_from("<I", buf, body + 4)
            (bits_per_sample,) = struct.unpack_from("<H", buf, body + 14)
            fmt = (num_channels, sample_rate, bits_per_sample)
        elif chunk_id == b"data":
            if fmt is None:
                raise ValueError("Invalid WAV: data chunk before fmt chunk")
            data_size = min(chunk_size, len(buf) - body)
            return fmt, body, data_size
        # RIFF chunks are word-aligned (padded to an even byte count).
        offset = body + chunk_size + (chunk_size % 2)
    raise ValueError("Invalid WAV: no data chunk found")


def _lsb_read(pcm: bytes, start_sample: int, num_bytes: int) -> bytes:
    """Read num_bytes from PCM sample LSBs starting at start_sample."""
    out = bytearray(num_bytes)
    for b in range(num_bytes * 8):
        off = (start_sample + b) * 2
        if off + 2 > len(pcm):
            break
        (sample,) = struct.unpack_from("<h", pcm, off)
        byte_idx = b >> 3
        bit_idx = 7 - (b & 7)
        out[byte_idx] = (out[byte_idx] & ~(1 << bit_idx)) | ((sample & 1) << bit_idx)
    return bytes(out)


def extract_lsb_payload(wav_bytes: bytes) -> bytes | None:
    """Return the embedded nominator payload, or None when the GKP magic is
    absent — file was never stamped, or was re-encoded (lossy encoding
    destroys LSB watermarks)."""
    try:
        _fmt, data_offset, data_size = _parse_wav(wav_bytes)
        pcm = wav_bytes[data_offset:data_offset + data_size]
        hdr_size = len(GKP_MAGIC) + 2
        if data_size // 2 < hdr_size * 8:
            return None
        hdr = _lsb_read(pcm, 0, hdr_size)
        if hdr[: len(GKP_MAGIC)] != GKP_MAGIC:
            return None
        (length,) = struct.unpack_from(">H", hdr, len(GKP_MAGIC))
        if data_size // 2 < (hdr_size + length) * 8:
            return None
        return _lsb_read(pcm, hdr_size * 8, length)
    except Exception:
        return None


# ── Live verification against the GravelKing production server ───────────────

def verify_against_gravelking(data: bytes, filename: str = "upload.wav") -> dict:
    """Extract the nominator locally, then get the authoritative split-key
    verdict from the live GravelKing server.

    Raises VerificationBackendError whenever no authoritative verdict exists —
    the caller must present that as a backend failure, not as "uncertified"."""
    local: Any = None
    payload = extract_lsb_payload(data)
    if payload is not None:
        try:
            local = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            local = {"raw_hex": payload.hex()[:64], "note": "payload present but not JSON"}

    try:
        resp = requests.post(
            GRAVELKING_VERIFY_URL,
            files={"audio": (filename, io.BytesIO(data), "audio/wav")},
            timeout=60,
        )
    except requests.RequestException as exc:
        raise VerificationBackendError(
            f"GravelKing verification server unreachable: {exc}"
        ) from exc

    # Only a well-formed HTTP 200 JSON verdict counts. The server's 400/422
    # responses are operational failures (bad upload, processing error), not
    # authoritative cert verdicts — never present them as one.
    if resp.status_code != 200:
        raise VerificationBackendError(
            f"GravelKing verification backend returned HTTP {resp.status_code} — "
            "no verdict was issued for this track."
        )
    try:
        verdict = resp.json()
    except ValueError as exc:
        raise VerificationBackendError(
            "GravelKing verification backend returned a non-JSON response — "
            "no verdict was issued for this track."
        ) from exc
    if not isinstance(verdict, dict) or not isinstance(verdict.get("valid"), bool):
        raise VerificationBackendError(
            "GravelKing verification backend response is missing a boolean "
            "'valid' verdict — treating as a backend failure."
        )

    return {"local_watermark": local, **verdict}


# ── FastAPI surface ───────────────────────────────────────────────────────────

class VerificationReport(BaseModel):
    valid: bool
    certId: str | None = None
    artist: str | None = None
    certifiedAt: Any = None
    kernel: str | None = None
    reason: str | None = None
    note: str | None = None
    error: str | None = None
    local_watermark: Any = None


@app.post("/verify", response_model=VerificationReport, response_model_exclude_none=True)
async def verify_audio(file: UploadFile = File(...)):
    data = await file.read()
    try:
        return verify_against_gravelking(data, file.filename or "upload.wav")
    except VerificationBackendError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@app.get("/health")
async def health():
    return {"status": "healthy", "version": "3.5", "verify_backend": GRAVELKING_VERIFY_URL}
