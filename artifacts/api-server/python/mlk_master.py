"""
MLK V4 mastering worker — the single DSP path for GravelKing Pro mastering.

Invoked by the Node API as a subprocess:
  python3 mlk_master.py --input in.wav --output out.wav --preset gravelking_max ...

Loads the MorrisLawKernel (Numba-accelerated when numba is installed, pure
Python otherwise), processes the whole file, and prints a single JSON stats
line on stdout (last line) so the caller can surface real measurements.
Any failure exits non-zero with the traceback on stderr — never silently
succeeds.

Dependencies: numpy + scipy + pyloudnorm (with a standards-equivalent local
implementation when the immutable runtime does not expose the wheel).
"""

import argparse
import json
import os
import signal
import sys
import traceback
import subprocess
from pathlib import Path

WORKER_TIMEOUT_SECONDS = 45
CANONICAL_SAMPLE_RATE = 48_000


class WorkerTimeoutError(RuntimeError):
    """Raised when the mastering worker exceeds its hard wall-clock budget."""


def _worker_timeout(_signum, _frame):
    raise WorkerTimeoutError(
        f"MLK V4 worker exceeded its {WORKER_TIMEOUT_SECONDS}-second execution limit"
    )


def _stage(name: str) -> None:
    print(f"[mlk_master] stage={name}", file=sys.stderr, flush=True)

# Kernel lives next to this worker.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
WORKSPACE_ROOT = Path(__file__).resolve().parents[3]
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--preset", default="gravelking_max")
    ap.add_argument("--intensity", type=float, default=65.0)
    ap.add_argument("--sidechain-filter", default="highpass",
                    choices=["none", "highpass", "lowpass"])
    ap.add_argument("--sidechain-freq", type=float, default=140.0)
    ap.add_argument("--stereo-link", default="true")
    ap.add_argument("--adaptive-mode", default="bass_aware",
                    choices=["off", "bass_aware"])
    ap.add_argument("--auto-threshold", default="true")
    ap.add_argument("--auto-offset", type=float, default=-15.5)
    ap.add_argument("--target-lufs", type=float, default=-14.0)
    ap.add_argument("--ceiling-db", type=float, default=-0.8)
    ap.add_argument("--mp3-output", default=None)
    ap.add_argument("--dsp-preset-json", default=None)
    args = ap.parse_args()

    import numpy as np
    from scipy.io import wavfile
    from scipy.signal import butter, hilbert, sosfilt
    from audio_standards import integrated_lufs, write_pcm24_wav
    from lib.gka_middleware import GKAdvantageCore
    from morris_law_kernel import MorrisLawKernel

    _stage("read_input")
    sr, data = wavfile.read(args.input)
    if sr != CANONICAL_SAMPLE_RATE:
        raise ValueError(
            f"Expected normalized {CANONICAL_SAMPLE_RATE} Hz PCM input, received {sr} Hz"
        )
    if data.size == 0:
        raise ValueError("Normalized audio file contains no samples")
    if data.ndim > 2:
        raise ValueError(f"Normalized audio has unsupported shape {data.shape}")
    if data.dtype == np.int16:
        audio = data.astype(np.float32) / 32768.0
    elif data.dtype == np.int32:
        audio = data.astype(np.float32) / 2147483648.0
    else:
        audio = data.astype(np.float32)
    if audio.ndim == 1:
        audio = audio[:, np.newaxis]
    if audio.shape[1] == 1:
        # Kernel's stereo logic expects (N, 2); duplicate mono to dual mono.
        audio = np.repeat(audio, 2, axis=1)

    # GKA is the required partition/optimization boundary before MLK V4.
    # This is real float audio processing, not a mock or metadata-only flag.
    _stage("gka_prepare")
    gka = GKAdvantageCore(multiplier=0.75, slice_size=2)
    audio = gka.optimize_audio(audio, operation="mlk_v3_5_master_input")
    _stage("kernel_prepare")
    kernel = MorrisLawKernel(sample_rate=sr)
    stereo_link = args.stereo_link.lower() != "false"
    auto_threshold = args.auto_threshold.lower() == "true"
    intensity = float(np.clip(args.intensity, 0, 100))

    # ── Observability: detector stats from the SAME signal the compressor ──
    # will see — after EQ shelves and saturation, exactly mirroring process().
    S = intensity / 100.0
    p = kernel.PRESETS[args.preset]
    det_audio = kernel._shelf(audio, p["low_freq"], S * p["low_gain_max"], low=True)
    det_audio = kernel._shelf(det_audio, p["high_freq"], S * p["high_gain_max"], low=False)
    det_audio = kernel._soft_saturate(det_audio, S * p["drive_max"])

    sc_freq_used = kernel._adaptive_sidechain_freq(det_audio, args.sidechain_freq, args.adaptive_mode)
    det = kernel._mono(det_audio) if stereo_link else det_audio
    det = kernel._sidechain_filter(det, args.sidechain_filter, sc_freq_used)
    rms = float(np.sqrt(np.mean(det * det)))
    detected_rms_db = 20.0 * float(np.log10(max(rms, 1e-9)))
    applied_threshold_db = (
        float(kernel._auto_threshold(det, args.auto_offset)) if auto_threshold else -18.0
    )

    _stage("kernel_process")
    out = kernel.process(
        audio,
        preset=args.preset,
        intensity=intensity,
        target_lufs=args.target_lufs,
        ceiling_db=args.ceiling_db,
        sidechain_mode=args.sidechain_filter,
        sidechain_freq=args.sidechain_freq,
        stereo_link=stereo_link,
        adaptive_mode=args.adaptive_mode,
        auto_threshold=auto_threshold,
        auto_offset_db=args.auto_offset,
    )

    if args.dsp_preset_json:
        _stage("admin_dsp")
        cfg = json.loads(args.dsp_preset_json)
        # The additional three-band processor operates on the actual float
        # signal, before the final loudness/peak stage and PCM quantization.
        original = out.astype(np.float64)
        low = sosfilt(butter(2, 180, fs=sr, btype="lowpass", output="sos"), original, axis=0)
        high = sosfilt(butter(2, 2400, fs=sr, btype="highpass", output="sos"), original, axis=0)
        bands = [low, original - low - high, high]
        processed = np.zeros_like(original)
        for band, settings in zip(bands, cfg["bands"]):
            block_size = 256
            detector = np.array([
                np.max(np.abs(band[i:i + block_size]))
                for i in range(0, len(band), block_size)
            ])
            threshold = 10 ** (settings["threshold"] / 20)
            over_db = np.maximum(0, 20 * np.log10(np.maximum(detector, 1e-9) / threshold))
            desired = 10 ** (-over_db * (1 - 1 / settings["ratio"]) / 20)
            attack = np.exp(-block_size / (sr * settings["attack"] / 1000))
            release = np.exp(-block_size / (sr * settings["release"] / 1000))
            gain = np.empty_like(desired)
            state = 1.0
            for i, target in enumerate(desired):
                coeff = attack if target < state else release
                state = coeff * state + (1 - coeff) * target
                gain[i] = state
            processed += band * np.repeat(gain, block_size)[:len(band), None]
        drive = cfg["saturationDrive"]
        if drive:
            sub_source = np.mean(low, axis=1)
            # Analytic phase / 2 synthesizes a genuine octave-below component
            # from the bass band rather than merely labeling soft clipping as
            # "sub-harmonic". Keep it mono and gate it by the source envelope.
            analytic = hilbert(sub_source)
            sub = np.abs(analytic) * np.cos(np.unwrap(np.angle(analytic)) / 2)
            processed += (sub * min(drive, 2) * 0.18 * cfg["saturationMix"])[:, None]
            wet = np.tanh(processed * (1 + drive)) / np.tanh(1 + drive)
            processed = processed * (1 - cfg["saturationMix"]) + wet * cfg["saturationMix"]
        air = sosfilt(butter(2, 9000, fs=sr, btype="highpass", output="sos"), processed, axis=0)
        processed += air * (10 ** (cfg["airDb"] / 20) - 1)
        mono_low = sosfilt(butter(2, cfg["monoHz"], fs=sr, btype="lowpass", output="sos"), processed, axis=0)
        mid = np.mean(processed, axis=1)
        side = (processed[:, 0] - processed[:, 1]) * 0.5
        low_side = (mono_low[:, 0] - mono_low[:, 1]) * 0.5
        side = (side - low_side) * cfg["width"]
        processed = np.column_stack((mid + side, mid - side))
        measured = float(integrated_lufs(processed, sr))
        if not np.isfinite(measured):
            raise ValueError("DSP output loudness is not finite")
        processed *= 10 ** ((cfg["targetLufs"] - measured) / 20)
        ceiling = 10 ** (args.ceiling_db / 20)
        peak = float(np.max(np.abs(processed)))
        if peak > ceiling:
            processed *= ceiling / peak
        out = processed.astype(np.float32)

    _stage("write_wav")
    # True 24-bit PCM WAV. The kernel output is quantized only at the
    # deliverable boundary; all DSP above ran on float32.
    write_pcm24_wav(args.output, out, sr)

    if args.mp3_output:
        _stage("write_mp3")
        subprocess.run(
            ["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", args.output,
             "-codec:a", "libmp3lame", "-b:a", "320k", "-ar", "44100", "-ac", "2", args.mp3_output],
            check=True,
            timeout=WORKER_TIMEOUT_SECONDS,
        )

    print(json.dumps({
        "ok": True,
        "engine": "morris-law-kernel-v4-python",
        "numba": getattr(kernel, "_use_numba", False),
        "sampleRate": sr,
        "bitDepth": 24,
        "inputLufs": round(float(integrated_lufs(audio, sr)), 3),
        "outputLufs": round(float(integrated_lufs(out, sr)), 3),
        "mp3Output": args.mp3_output,
        "scFreqUsed": round(float(sc_freq_used), 1),
        "detectedRmsDb": round(detected_rms_db, 1),
        "appliedThresholdDb": round(applied_threshold_db, 1),
        "gka": gka.verify_parity(),
    }))
    return 0


if __name__ == "__main__":
    signal.signal(signal.SIGALRM, _worker_timeout)
    signal.setitimer(signal.ITIMER_REAL, WORKER_TIMEOUT_SECONDS)
    try:
        sys.exit(main())
    except WorkerTimeoutError as exc:
        print(f"[mlk_master] ERROR: {exc}", file=sys.stderr, flush=True)
        sys.exit(124)
    except subprocess.TimeoutExpired as exc:
        print(
            f"[mlk_master] ERROR: ffmpeg subprocess exceeded "
            f"{WORKER_TIMEOUT_SECONDS} seconds: {exc}",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(124)
    except Exception:
        traceback.print_exc()
        sys.exit(1)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
