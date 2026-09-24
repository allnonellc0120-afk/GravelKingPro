"""Deterministic regression test for the canonical MLK V4 audio boundary."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "artifacts" / "api-server" / "python" / "mlk_master.py"


def _decode_pcm24(payload: bytes) -> np.ndarray:
    packed = np.frombuffer(payload, dtype=np.uint8).reshape(-1, 3)
    values = (
        packed[:, 0].astype(np.int32)
        | (packed[:, 1].astype(np.int32) << 8)
        | (packed[:, 2].astype(np.int32) << 16)
    )
    values = np.where(values & 0x800000, values - 0x1000000, values)
    return values


def test_canonical_worker_tone_pipeline() -> None:
    sample_rate = 48_000
    seconds = 2
    t = np.arange(sample_rate * seconds, dtype=np.float32) / sample_rate
    tone = (0.18 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
    stereo = np.column_stack([tone, tone * 0.97])

    with tempfile.TemporaryDirectory(prefix="gk-audio-test-") as directory:
        input_path = Path(directory) / "tone-in.wav"
        output_path = Path(directory) / "tone-out.wav"
        from scipy.io import wavfile

        wavfile.write(input_path, sample_rate, stereo)
        started = time.perf_counter()
        completed = subprocess.run(
            [
                sys.executable,
                str(WORKER),
                "--input",
                str(input_path),
                "--output",
                str(output_path),
                "--preset",
                "natural_body",
                "--intensity",
                "65",
                "--target-lufs",
                "-14",
                "--ceiling-db",
                "-0.5",
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=45,
        )
        elapsed = time.perf_counter() - started
        stats = json.loads(completed.stdout.strip().splitlines()[-1])

        with wave.open(str(output_path), "rb") as rendered:
            assert rendered.getframerate() == 48_000
            assert rendered.getsampwidth() == 3
            assert rendered.getnchannels() == 2
            payload = rendered.readframes(rendered.getnframes())

        values = _decode_pcm24(payload)
        assert values.size > 0
        assert int(values.min()) >= -8_388_608
        assert int(values.max()) <= 8_388_607
        assert stats["sampleRate"] == 48_000
        assert stats["bitDepth"] == 24
        assert abs(float(stats["outputLufs"]) - (-14.0)) < 1.0
        assert elapsed < 45.0


if __name__ == "__main__":
    test_canonical_worker_tone_pipeline()
    print("audio pipeline: ok")