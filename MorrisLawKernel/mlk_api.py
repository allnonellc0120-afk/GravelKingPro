"""
Morris Law Kernel V3.5 — FastAPI mastering service.

Deployable to Cloud Run (see Dockerfile.mlk-api). This is the server-side
counterpart to the GravelKing Pro mastering route: the API server POSTs a WAV
plus kernel parameters here and receives the mastered WAV back with real
measurement headers.

    POST /master
      multipart: audio (WAV), preset, intensity, sidechain_filter,
                 sidechain_freq, stereo_link, adaptive_mode,
                 auto_threshold, auto_offset, target_lufs, ceiling_db
      response:  audio/wav (PCM 16) + X-MLK-* measurement headers

    GET /healthz → {"ok": true, "numba": bool}

Auth: optional — if MLK_API_KEY is set in the environment, every /master
request must carry a matching `x-api-key` header.
"""

import os
import tempfile
import traceback
import math

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

from morris_law_kernel import MorrisLawKernel, NUMBA_AVAILABLE

app = FastAPI(title="Morris Law Kernel V3.5", version="3.5.0")

VALID_PRESETS = set(MorrisLawKernel.PRESETS.keys())


def _check_key(req: Request) -> None:
    expected = os.environ.get("MLK_API_KEY") or os.environ.get("API_KEY")
    if expected and req.headers.get("x-api-key") != expected:
        raise HTTPException(status_code=401, detail="invalid api key")


@app.get("/healthz")
def healthz():
    return {"ok": True, "engine": "morris-law-kernel-v3.5", "numba": NUMBA_AVAILABLE}


@app.post("/master")
async def master(
    req: Request,
    audio: UploadFile = File(...),
    preset: str = Form("gravelking_max"),
    intensity: float = Form(65.0),
    sidechain_filter: str = Form("highpass"),
    sidechain_freq: float = Form(140.0),
    stereo_link: str = Form("true"),
    adaptive_mode: str = Form("bass_aware"),
    auto_threshold: str = Form("true"),
    auto_offset: float = Form(-15.5),
    target_lufs: float = Form(-14.0),
    ceiling_db: float = Form(-0.8),
):
    _check_key(req)

    if preset not in VALID_PRESETS:
        raise HTTPException(status_code=400, detail=f"unknown preset: {preset}")
    if sidechain_filter not in ("none", "highpass", "lowpass"):
        raise HTTPException(status_code=400, detail="sidechain_filter must be none|highpass|lowpass")
    if adaptive_mode not in ("off", "bass_aware"):
        raise HTTPException(status_code=400, detail="adaptive_mode must be off|bass_aware")
    if not math.isfinite(intensity) or intensity < 0 or intensity > 100:
        raise HTTPException(status_code=400, detail="intensity must be between 0 and 100")
    if not math.isfinite(sidechain_freq) or sidechain_freq <= 0:
        raise HTTPException(status_code=400, detail="sidechain_freq must be a positive frequency")
    # Match the Node route's supported detector band. Values inside the
    # positive domain are clamped; malformed/non-positive values are rejected.
    sidechain_freq = float(np.clip(sidechain_freq, 20, 2000))

    from scipy.io import wavfile

    try:
        raw = await audio.read()
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(raw)
            in_path = tmp.name
        out_path = in_path + ".out.wav"

        sr, data = wavfile.read(in_path)
        if data.dtype == np.int16:
            x = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            x = data.astype(np.float32) / 2147483648.0
        else:
            x = data.astype(np.float32)
        if x.ndim == 1:
            x = x[:, np.newaxis]
        if x.shape[1] == 1:
            x = np.repeat(x, 2, axis=1)

        kernel = MorrisLawKernel(sample_rate=sr)
        link = stereo_link.lower() != "false"
        auto = auto_threshold.lower() == "true"
        intensity = float(intensity)

        # Observability from the same post-EQ/saturation signal the compressor sees
        S = intensity / 100.0
        p = kernel.PRESETS[preset]
        d = kernel._shelf(x, p["low_freq"], S * p["low_gain_max"], low=True)
        d = kernel._shelf(d, p["high_freq"], S * p["high_gain_max"], low=False)
        d = kernel._soft_saturate(d, S * p["drive_max"])
        sc_freq = kernel._adaptive_sidechain_freq(d, sidechain_freq, adaptive_mode)
        det = kernel._mono(d) if link else d
        det = kernel._sidechain_filter(det, sidechain_filter, sc_freq)
        rms = float(np.sqrt(np.mean(det * det)))
        rms_db = 20.0 * float(np.log10(max(rms, 1e-9)))
        thresh_db = float(kernel._auto_threshold(det, auto_offset)) if auto else -18.0

        out = kernel.process(
            x,
            preset=preset,
            intensity=intensity,
            target_lufs=target_lufs,
            ceiling_db=ceiling_db,
            sidechain_mode=sidechain_filter,
            sidechain_freq=sidechain_freq,
            stereo_link=link,
            adaptive_mode=adaptive_mode,
            auto_threshold=auto,
            auto_offset_db=auto_offset,
        )
        wavfile.write(out_path, sr, (np.clip(out, -1.0, 1.0) * 32767.0).astype(np.int16))
        with open(out_path, "rb") as f:
            body = f.read()

        return Response(
            content=body,
            media_type="audio/wav",
            headers={
                "X-MLK-Engine": "morris-law-kernel-v3.5-python",
                "X-MLK-Numba": "true" if NUMBA_AVAILABLE else "false",
                "X-MLK-ScFreqUsed": f"{sc_freq:.1f}",
                "X-MLK-DetectedRmsDb": f"{rms_db:.1f}",
                "X-MLK-AppliedThresholdDb": f"{thresh_db:.1f}",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"kernel processing failed: {e}")
    finally:
        for pth in (locals().get("in_path"), locals().get("out_path")):
            if pth and os.path.exists(pth):
                os.unlink(pth)
