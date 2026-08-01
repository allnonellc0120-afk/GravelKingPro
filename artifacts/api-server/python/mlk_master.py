"""
MLK v3.5 mastering worker — the single DSP path for GravelKing Pro mastering.

Invoked by the Node API as a subprocess:
  python3 mlk_master.py --input in.wav --output out.wav --preset gravelking_max ...

Loads the MorrisLawKernel (Numba-accelerated when numba is installed, pure
Python otherwise), processes the whole file, and prints a single JSON stats
line on stdout (last line) so the caller can surface real measurements.
Any failure exits non-zero with the traceback on stderr — never silently
succeeds.

Dependencies: numpy + scipy only (scipy.io.wavfile for I/O — no libsndfile).
"""

import argparse
import json
import os
import sys
import traceback

# Kernel lives next to this worker.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


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
    args = ap.parse_args()

    import numpy as np
    from scipy.io import wavfile
    from morris_law_kernel import MorrisLawKernel

    sr, data = wavfile.read(args.input)
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

    # 16-bit PCM output — matches the downstream LSB-embed WAV expectations.
    wavfile.write(args.output, sr, (np.clip(out, -1.0, 1.0) * 32767.0).astype(np.int16))

    print(json.dumps({
        "ok": True,
        "engine": "morris-law-kernel-v3.5-python",
        "numba": getattr(kernel, "_use_numba", False),
        "sampleRate": sr,
        "scFreqUsed": round(float(sc_freq_used), 1),
        "detectedRmsDb": round(detected_rms_db, 1),
        "appliedThresholdDb": round(applied_threshold_db, 1),
    }))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
