"""
GravelKing Productions — FastAPI Audio Engine

Endpoints:
  GET  /health                    — service health check
  POST /separate/vocals           — vocal/instrumental separation
  POST /separate/stems            — multi-stem separation (5/14 stems)
  POST /process/denoise           — noise reduction (afftdn)
  POST /process/normalize         — loudness normalization
  POST /process/master            — full mastering chain

All processing uses temporary files with immediate cleanup after delivery.
Output files are read into memory before cleanup, then returned via StreamingResponse.
"""
import os
import asyncio
from pathlib import Path
import shutil
import tempfile
import subprocess
import zipfile
import sys
from typing import List, Dict

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, BackgroundTasks
from fastapi.responses import StreamingResponse, JSONResponse

WORKSPACE_ROOT = Path(__file__).resolve().parents[1]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))
from lib.gka_middleware import GKAdvantageCore

app = FastAPI(
    title="GravelKing Audio Engine",
    description="FastAPI audio processing backend with ffmpeg — vocal separation, stem splitting, noise reduction, and mastering.",
    version="2.0.0",
)

# ── Configuration ─────────────────────────────────────────────────────────────
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
FFMPEG_TIMEOUT = 180  # seconds
GKA_CORE = GKAdvantageCore(multiplier=0.75, slice_size=2)

# ── Helpers ─────────────────────────────────────────────────────────────────


async def run_ffmpeg(
    args: List[str],
    timeout: int = FFMPEG_TIMEOUT,
    task_name: str = "ffmpeg_audio_pipeline",
) -> None:
    """Run ffmpeg with given arguments. Raises HTTPException on failure."""
    cmd = ["ffmpeg", "-y"] + args
    task_id = GKA_CORE.begin_task(task_name, metadata={"command": cmd[:2]})
    try:
        result = await asyncio.to_thread(
            subprocess.run,
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"ffmpeg failed: {result.stderr}")
        GKA_CORE.finish_task(task_id)
    except subprocess.TimeoutExpired:
        GKA_CORE.finish_task(task_id, status="failed", metadata={"error": "timeout"})
        raise HTTPException(status_code=504, detail=f"ffmpeg timed out after {timeout}s")
    except Exception as error:
        if GKA_CORE.lineage_snapshot() and any(
            task.get("task_id") == task_id and task.get("status") == "running"
            for task in GKA_CORE.lineage_snapshot()
        ):
            GKA_CORE.finish_task(task_id, status="failed", metadata={"error": str(error)[:500]})
        raise


async def get_audio_info(file_path: str) -> Dict[str, int]:
    """Probe audio file for sample rate, channels, duration."""
    try:
        result = await asyncio.to_thread(
            subprocess.run,
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", file_path],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return {"sample_rate": 44100, "channels": 2, "duration": 0}
        import json
        info = json.loads(result.stdout)
        stream = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
        if not stream:
            return {"sample_rate": 44100, "channels": 2, "duration": 0}
        return {
            "sample_rate": int(stream.get("sample_rate", 44100)),
            "channels": int(stream.get("channels", 2)),
            "duration": int(float(stream.get("duration", 0))),
        }
    except Exception:
        return {"sample_rate": 44100, "channels": 2, "duration": 0}


async def save_upload(upload: UploadFile, suffix: str = ".wav") -> str:
    """Save uploaded file to a temporary path."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await upload.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 100MB)")
        tmp.write(content)
        return tmp.name


def cleanup_files(*paths: str) -> None:
    """Remove temporary files. Silent on errors."""
    for path in paths:
        try:
            if os.path.isfile(path):
                os.remove(path)
            elif os.path.isdir(path):
                shutil.rmtree(path)
        except Exception:
            pass


def make_output_path(input_path: str, suffix: str) -> str:
    """Generate a temporary output path."""
    base = os.path.splitext(os.path.basename(input_path))[0]
    return os.path.join(tempfile.gettempdir(), f"{base}_{suffix}")


def audio_response(data: bytes, filename: str, media_type: str, headers: dict):
    """Return a streaming response with audio data, with proper cleanup handled."""
    return StreamingResponse(
        iter([data]),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"', **headers},
    )


def validate_audio(file: UploadFile):
    """Validate uploaded file is an audio file."""
    allowed = ("audio/", "application/octet-stream", "application/wav", "audio/x-wav")
    if not file.content_type or not any(file.content_type.startswith(a) for a in allowed):
        raise HTTPException(status_code=400, detail="File must be an audio file")


# ── Health Check ──────────────────────────────────────────────────────────────


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "gravelking-audio-engine", "version": "2.0.0"}


# ── Vocal Separation ──────────────────────────────────────────────────────────


@app.post("/separate/vocals")
async def separate_vocals(
    file: UploadFile = File(...),
    mode: str = Form("instrumental"),
    quality: str = Form("high"),
):
    """Separate vocals from instrumental. Returns the requested stem as WAV."""
    validate_audio(file)
    input_path = await save_upload(file, ".wav")
    info = await get_audio_info(input_path)
    is_stereo = info["channels"] >= 2

    vocal_path = make_output_path(input_path, "vocals.wav")
    inst_path = make_output_path(input_path, "inst.wav")

    try:
        if quality == "high" and is_stereo:
            await run_ffmpeg([
                "-i", input_path,
                "-filter_complex",
                "[0:a]pan=mono|c0=0.5*c0+0.5*c1[mono];"
                "[0:a]pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0-0.5*c1[inst];"
                "[mono]highpass=f=120,lowpass=f=8000,compand=attacks=0.1:decays=0.5:points=-80/-80|-50/-40|-20/-10|-10/-5[voc]",
                "-map", "[voc]", vocal_path,
                "-map", "[inst]", inst_path,
            ])
        else:
            if is_stereo:
                await run_ffmpeg([
                    "-i", input_path,
                    "-filter_complex",
                    "[0:a]pan=mono|c0=0.5*c0+0.5*c1[mono];"
                    "[0:a]pan=stereo|c0=c0-c1|c1=c1-c0[inst];"
                    "[mono]highpass=f=180,lowpass=f=5000[voc]",
                    "-map", "[voc]", vocal_path,
                    "-map", "[inst]", inst_path,
                ])
            else:
                await run_ffmpeg([
                    "-i", input_path,
                    "-filter_complex",
                    "[0:a]highpass=f=180,lowpass=f=5000[voc];"
                    "[0:a]equalizer=f=2500:t=q:w=2:g=-9[inst]",
                    "-map", "[voc]", vocal_path,
                    "-map", "[inst]", inst_path,
                ])

        out_path = vocal_path if mode == "vocals" else inst_path
        out_name = "vocals.wav" if mode == "vocals" else "instrumental.wav"
        with open(out_path, "rb") as f:
            data = f.read()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Separation failed: {str(e)}")
    finally:
        cleanup_files(input_path, vocal_path, inst_path)

    return audio_response(
        data, out_name, "audio/wav",
        {"X-GK-Mode": mode, "X-GK-Quality": quality, "X-GK-Channels": str(info["channels"])},
    )


# ── Stem Splitting ───────────────────────────────────────────────────────────


@app.post("/separate/stems")
async def separate_stems(
    file: UploadFile = File(...),
    stems: str = Form("5"),
    format: str = Form("wav"),
):
    """Split audio into stems (5 or 14). Returns a ZIP file."""
    validate_audio(file)
    input_path = await save_upload(file, ".wav")
    info = await get_audio_info(input_path)
    is_stereo = info["channels"] >= 2

    output_dir = tempfile.mkdtemp(prefix="gk_stems_")
    zip_path = os.path.join(output_dir, "stems.zip")

    try:
        if stems == "5":
            stem_specs = [
                {"name": "vocals", "filter": "pan=mono|c0=0.5*c0+0.5*c1,highpass=f=180,lowpass=f=5000" if is_stereo else "highpass=f=180,lowpass=f=5000"},
                {"name": "drums", "filter": "highpass=f=200,lowpass=f=2500"},
                {"name": "bass", "filter": "lowpass=f=250"},
                {"name": "other", "filter": "highpass=f=2500"},
                {"name": "instrumental", "filter": "pan=stereo|c0=c0-c1|c1=c1-c0" if is_stereo else "equalizer=f=2500:t=q:w=2:g=-9"},
            ]
        else:
            stem_specs = [
                {"name": "vocals", "filter": "pan=mono|c0=0.5*c0+0.5*c1,highpass=f=180,lowpass=f=5000" if is_stereo else "highpass=f=180,lowpass=f=5000"},
                {"name": "vocals_high", "filter": "highpass=f=3000,lowpass=f=8000"},
                {"name": "vocals_low", "filter": "highpass=f=180,lowpass=f=1000"},
                {"name": "drums", "filter": "highpass=f=200,lowpass=f=2500"},
                {"name": "drums_kick", "filter": "highpass=f=30,lowpass=f=150"},
                {"name": "drums_snare", "filter": "highpass=f=150,lowpass=f=800"},
                {"name": "drums_hats", "filter": "highpass=f=8000,lowpass=f=18000"},
                {"name": "bass", "filter": "lowpass=f=250"},
                {"name": "bass_sub", "filter": "lowpass=f=80"},
                {"name": "bass_mid", "filter": "highpass=f=80,lowpass=f=250"},
                {"name": "other", "filter": "highpass=f=2500"},
                {"name": "other_mid", "filter": "highpass=f=2500,lowpass=f=6000"},
                {"name": "other_high", "filter": "highpass=f=6000"},
                {"name": "instrumental", "filter": "pan=stereo|c0=c0-c1|c1=c1-c0" if is_stereo else "equalizer=f=2500:t=q:w=2:g=-9"},
            ]

        stem_files = []
        for spec in stem_specs:
            ext = "mp3" if format == "mp3" else "wav"
            out_file = os.path.join(output_dir, f"{spec['name']}.{ext}")
            if format == "mp3":
                tmp_wav = os.path.join(output_dir, f"{spec['name']}_tmp.wav")
                await run_ffmpeg([
                    "-i", input_path, "-af", spec["filter"],
                    "-ac", "2" if is_stereo else "1", "-acodec", "pcm_s16le", tmp_wav,
                ])
                await run_ffmpeg([
                    "-i", tmp_wav, "-acodec", "libmp3lame", "-b:a", "320k", "-ar", "44100", out_file,
                ], timeout=60)
                os.remove(tmp_wav)
            else:
                await run_ffmpeg([
                    "-i", input_path, "-af", spec["filter"],
                    "-ac", "2" if is_stereo else "1", "-acodec", "pcm_s16le", out_file,
                ])
            stem_files.append(out_file)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for stem_file in stem_files:
                if os.path.exists(stem_file):
                    zf.write(stem_file, os.path.basename(stem_file))

        with open(zip_path, "rb") as f:
            data = f.read()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stem split failed: {str(e)}")
    finally:
        cleanup_files(input_path, output_dir)

    return audio_response(
        data, "gravelking_stems.zip", "application/zip",
        {"X-GK-Mode": "stem_split", "X-GK-Stems": stems, "X-GK-Format": format, "X-GK-Channels": str(info["channels"])},
    )


# ── Noise Reduction ───────────────────────────────────────────────────────────


@app.post("/process/denoise")
async def denoise_audio(
    file: UploadFile = File(...),
    strength: float = Form(0.5),
    profile: str = Form("auto"),
):
    """Noise reduction using ffmpeg afftdn. Returns denoised WAV."""
    validate_audio(file)
    if strength < 0.0 or strength > 1.0:
        raise HTTPException(status_code=400, detail="Strength must be between 0.0 and 1.0")

    input_path = await save_upload(file, ".wav")
    output_path = make_output_path(input_path, "denoised.wav")

    try:
        info = await get_audio_info(input_path)
        nr_amount = int(strength * 100)
        filter_str = f"afftdn=nr={nr_amount}:nf=-25:tn=1" if profile == "music" else f"afftdn=nr={nr_amount}:nf=-40:tn=1"

        await run_ffmpeg([
            "-i", input_path, "-af", filter_str,
            "-acodec", "pcm_s16le", "-ar", str(info["sample_rate"]), output_path,
        ])

        with open(output_path, "rb") as f:
            data = f.read()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Denoise failed: {str(e)}")
    finally:
        cleanup_files(input_path, output_path)

    return audio_response(
        data, "denoised.wav", "audio/wav",
        {"X-GK-Mode": "denoise", "X-GK-Strength": str(strength), "X-GK-Profile": profile},
    )


# ── Loudness Normalization ───────────────────────────────────────────────────


@app.post("/process/normalize")
async def normalize_audio(
    file: UploadFile = File(...),
    target: float = Form(-14.0),
    true_peak: float = Form(-1.0),
):
    """Loudness normalization using ffmpeg loudnorm. Returns normalized WAV."""
    validate_audio(file)
    input_path = await save_upload(file, ".wav")
    output_path = make_output_path(input_path, "normalized.wav")

    try:
        info = await get_audio_info(input_path)
        sample_rate = info["sample_rate"]

        # Pass 1: analyze
        analyze = await asyncio.to_thread(
            subprocess.run,
            ["ffmpeg", "-y", "-i", input_path,
             "-af", f"loudnorm=I={target}:TP={true_peak}:print_format=json", "-f", "null", "-"],
            capture_output=True,
            text=True,
            timeout=FFMPEG_TIMEOUT,
        )

        import json
        loudnorm_data = {}
        stderr_lines = analyze.stderr.split("\n")
        for i, line in enumerate(stderr_lines):
            if "Parsed_loudnorm" in line and "target" in line:
                for j in range(i, min(i + 10, len(stderr_lines))):
                    if stderr_lines[j].strip().startswith("{"):
                        json_str = "\n".join(stderr_lines[j:])
                        start = json_str.find("{")
                        end = json_str.find("}") + 1
                        if start >= 0 and end > start:
                            try:
                                loudnorm_data = json.loads(json_str[start:end])
                            except Exception:
                                pass
                        break

        input_i = loudnorm_data.get("input_i", "-23")
        input_tp = loudnorm_data.get("input_tp", "0")
        input_lra = loudnorm_data.get("input_lra", "7")
        input_thresh = loudnorm_data.get("input_thresh", "-30")
        target_offset = loudnorm_data.get("target_offset", "0")

        filter_str = (
            f"loudnorm=I={target}:TP={true_peak}:"
            f"measured_I={input_i}:measured_TP={input_tp}:"
            f"measured_LRA={input_lra}:measured_thresh={input_thresh}:"
            f"offset={target_offset}"
        )

        await run_ffmpeg([
            "-i", input_path, "-af", filter_str,
            "-acodec", "pcm_s16le", "-ar", str(sample_rate), output_path,
        ])

        with open(output_path, "rb") as f:
            data = f.read()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Normalization failed: {str(e)}")
    finally:
        cleanup_files(input_path, output_path)

    return audio_response(
        data, "normalized.wav", "audio/wav",
        {"X-GK-Mode": "normalize", "X-GK-Target-LUFS": str(target), "X-GK-True-Peak": str(true_peak)},
    )


# ── Mastering Chain ──────────────────────────────────────────────────────────


@app.post("/process/master")
async def master_audio(
    file: UploadFile = File(...),
    preset: str = Form("balanced"),
    denoise: bool = Form(False),
):
    """Full mastering chain: EQ -> compression -> limiting -> loudnorm. Returns WAV."""
    validate_audio(file)
    input_path = await save_upload(file, ".wav")
    output_path = make_output_path(input_path, "mastered.wav")

    preset_filters = {
        "balanced": "highpass=f=30,lowpass=f=18000,equalizer=f=100:t=q:w=1.5:g=2,equalizer=f=5000:t=q:w=1.5:g=1,equalizer=f=12000:t=q:w=1.5:g=-1,compand=attacks=0.02:decays=0.2:points=-80/-80|-50/-30|-30/-15|-10/-8|0/-6|20/-6:gain=-3:volume=-90",
        "warm": "highpass=f=30,lowpass=f=16000,equalizer=f=100:t=q:w=1.5:g=4,equalizer=f=250:t=q:w=1.5:g=2,equalizer=f=8000:t=q:w=1.5:g=-2,compand=attacks=0.03:decays=0.3:points=-80/-80|-50/-35|-30/-18|-10/-8|0/-6:gain=-2:volume=-90",
        "bright": "highpass=f=40,lowpass=f=20000,equalizer=f=100:t=q:w=1.5:g=-1,equalizer=f=4000:t=q:w=1.5:g=3,equalizer=f=10000:t=q:w=1.5:g=2,equalizer=f=150:t=q:w=1.5:g=-1,compand=attacks=0.015:decays=0.15:points=-80/-80|-50/-25|-30/-12|-10/-6|0/-4:gain=-1:volume=-90",
        "punchy": "highpass=f=30,lowpass=f=18000,equalizer=f=60:t=q:w=1.5:g=3,equalizer=f=100:t=q:w=1.5:g=2,equalizer=f=5000:t=q:w=1.5:g=1,compand=attacks=0.01:decays=0.1:points=-80/-80|-50/-20|-30/-10|-10/-5|0/-3:gain=-1:volume=-90",
    }

    try:
        info = await get_audio_info(input_path)
        sample_rate = info["sample_rate"]
        filter_chain = preset_filters.get(preset, preset_filters["balanced"])

        if denoise:
            filter_chain = f"afftdn=nr=50:nf=-40:tn=1,{filter_chain}"
        filter_chain = f"{filter_chain},alimiter=limit=0.95:level=disabled"

        await run_ffmpeg([
            "-i", input_path, "-af", filter_chain,
            "-acodec", "pcm_s16le", "-ar", str(sample_rate), output_path,
        ])

        with open(output_path, "rb") as f:
            data = f.read()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mastering failed: {str(e)}")
    finally:
        cleanup_files(input_path, output_path)

    return audio_response(
        data, "mastered.wav", "audio/wav",
        {"X-GK-Mode": "master", "X-GK-Preset": preset, "X-GK-Denoise": str(denoise)},
    )


# ── Demucs Neural Separation ─────────────────────────────────────────────────

DEMUCS_API_KEY = os.getenv("DEMUCS_API_KEY", "")


@app.post("/separate")
async def separate_audio(
    audio: UploadFile = File(...),
    mode: str = Form("voice_remove"),
) -> JSONResponse:
    """
    Neural stem separation via Demucs htdemucs.
    mode=voice_remove → stems: { vocals, no_vocals }
    mode=stem_split   → stems: { drums, bass, other, vocals, instrumental }
    Optionally protected by DEMUCS_API_KEY env var (x-api-key header).
    """
    import base64

    suffix     = os.path.splitext(audio.filename or "input.wav")[1] or ".wav"
    input_path = None
    out_dir    = None
    task_id = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await audio.read()
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail="File too large (max 100MB)")
            tmp.write(content)
            input_path = tmp.name

        out_dir = tempfile.mkdtemp()

        if mode == "voice_remove":
            cmd = [
                "python", "-m", "demucs",
                "-n", "htdemucs",
                "--two-stems", "vocals",
                "-o", out_dir,
                input_path,
            ]
        else:
            cmd = [
                "python", "-m", "demucs",
                "-n", "htdemucs",
                "-o", out_dir,
                input_path,
            ]

        task_id = GKA_CORE.begin_task(
            "demucs_stem_separation",
            metadata={"mode": mode, "model": "htdemucs", "slice_size": GKA_CORE.slice_size},
        )
        try:
            proc = await asyncio.to_thread(
                subprocess.run,
                cmd,
                capture_output=True,
                text=True,
                timeout=600,
            )
            if proc.returncode != 0:
                raise HTTPException(
                    status_code=500,
                    detail=f"demucs failed: {proc.stderr[-400:]}",
                )
        except Exception as error:
            GKA_CORE.finish_task(task_id, status="failed", metadata={"error": str(error)[:500]})
            raise

        track_name = os.path.splitext(os.path.basename(input_path))[0]
        stem_dir   = os.path.join(out_dir, "htdemucs", track_name)

        stems: Dict[str, str] = {}
        for fname in os.listdir(stem_dir):
            if not fname.endswith(".wav"):
                continue
            stem_name = fname.replace(".wav", "")
            with open(os.path.join(stem_dir, fname), "rb") as fh:
                stems[stem_name] = base64.b64encode(fh.read()).decode()
        stem_slices = GKA_CORE.slice_data(sorted(stems))

        if mode == "stem_split" and "vocals" in stems:
            non_vocal_names = [n for n in stems if n != "vocals"]
            if len(non_vocal_names) > 1:
                inst_out  = os.path.join(out_dir, "instrumental.wav")
                mix_args  = sum([["-i", os.path.join(stem_dir, f"{n}.wav")] for n in non_vocal_names], [])
                await asyncio.to_thread(
                    subprocess.run,
                    ["ffmpeg", "-y"] + mix_args + [
                        "-filter_complex", f"amix=inputs={len(non_vocal_names)}:normalize=0",
                        "-acodec", "pcm_s16le", inst_out,
                    ],
                    capture_output=True,
                    timeout=120,
                )
                if os.path.exists(inst_out):
                    with open(inst_out, "rb") as fh:
                        stems["instrumental"] = base64.b64encode(fh.read()).decode()

        GKA_CORE.finish_task(
            task_id,
            metadata={"stem_count": len(stems), "slice_count": len(stem_slices)},
        )
        return JSONResponse({
            "stems": stems,
            "model": "htdemucs",
            "gka": GKA_CORE.verify_parity(),
            "lineage_task_id": task_id,
        })

    except Exception as error:
        if task_id is not None and any(
            task.get("task_id") == task_id and task.get("status") == "running"
            for task in GKA_CORE.lineage_snapshot()
        ):
            GKA_CORE.finish_task(task_id, status="failed", metadata={"error": str(error)[:500]})
        raise
    finally:
        if input_path and os.path.exists(input_path):
            os.unlink(input_path)
        if out_dir and os.path.exists(out_dir):
            shutil.rmtree(out_dir, ignore_errors=True)


# ── Root ───────────────────────────────────────────────────────────────────────


@app.get("/")
def root():
    return {
        "service": "GravelKing Audio Engine",
        "version": "2.0.0",
        "endpoints": [
            {"path": "/health", "method": "GET", "description": "Health check"},
            {"path": "/separate/vocals", "method": "POST", "description": "Vocal/instrumental separation"},
            {"path": "/separate/stems", "method": "POST", "description": "Multi-stem splitting (5 or 14 stems)"},
            {"path": "/process/denoise", "method": "POST", "description": "Noise reduction (afftdn)"},
            {"path": "/process/normalize", "method": "POST", "description": "Loudness normalization"},
            {"path": "/process/master", "method": "POST", "description": "Full mastering chain"},
        ],
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
