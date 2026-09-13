#!/usr/bin/env python3
"""
GKP Demucs Runner
Patches torchaudio.load / torchaudio.save to use ffmpeg instead of torchcodec,
which is missing from this environment. Drop-in replacement for `python3 -m demucs`.
"""
import sys
import os
import json
from pathlib import Path
import tempfile
import subprocess
import numpy as np
import torch
import torchaudio

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))
from lib.gka_middleware import GKAdvantageCore

GKA_CORE = GKAdvantageCore(multiplier=0.75, slice_size=2)


def _ffmpeg_load(path, frame_offset=0, num_frames=-1, normalize=True,
                 channels_first=True, format=None, backend=None, **kwargs):
    path = str(path)

    with GKA_CORE.task("demucs_decode", metadata={"path": path}):
        # Probe sample rate + channels
        probe = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", path],
            capture_output=True, text=True,
        )
        info = json.loads(probe.stdout) if probe.stdout else {}
        stream = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), {})
        sr = int(stream.get("sample_rate", 44100))
        channels = int(stream.get("channels", 2))

        fd, raw_path = tempfile.mkstemp(suffix=".f32le")
        os.close(fd)
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", path,
                 "-f", "f32le", "-ar", str(sr), "-ac", str(channels), raw_path],
                capture_output=True, check=True,
            )
            with open(raw_path, "rb") as f:
                data = np.frombuffer(f.read(), dtype=np.float32).copy()
        finally:
            try:
                os.unlink(raw_path)
            except OSError:
                pass

    data = data.reshape(-1, channels).T if channels > 1 else data.reshape(1, -1)
    tensor = torch.from_numpy(data)
    if not channels_first:
        tensor = tensor.T
    return tensor, sr


def _ffmpeg_save(path, src, sample_rate, channels_first=True,
                 format=None, encoding=None, bits_per_sample=None, **kwargs):
    path = str(path)
    with GKA_CORE.task("demucs_encode", metadata={"path": path, "sample_rate": sample_rate}):
        arr = src.detach().cpu().numpy()
        if not channels_first:
            arr = arr.T
        if arr.ndim == 1:
            arr = arr.reshape(1, -1)
        channels = arr.shape[0]

        fd, raw_path = tempfile.mkstemp(suffix=".f32le")
        os.close(fd)
        try:
            with open(raw_path, "wb") as f:
                f.write(arr.T.astype(np.float32).tobytes())
            subprocess.run(
                ["ffmpeg", "-y",
                 "-f", "f32le", "-ar", str(sample_rate), "-ac", str(channels),
                 "-i", raw_path,
                 "-acodec", "pcm_s16le", path],
                capture_output=True, check=True,
            )
        finally:
            try:
                os.unlink(raw_path)
            except OSError:
                pass


# Patch BEFORE any demucs code is imported
torchaudio.load = _ffmpeg_load
torchaudio.save = _ffmpeg_save

# Hand off to demucs with whatever args were passed
from demucs.__main__ import main  # noqa: E402
sys.exit(main())
