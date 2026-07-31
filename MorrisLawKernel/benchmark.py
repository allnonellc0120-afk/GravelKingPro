"""
Morris Law Kernel V3.5 — honest local benchmark.

Measures REAL performance on THIS machine and prints exactly what it finds:
no fabricated numbers, no hardware claims beyond what Python can detect.
The DSP engine is CPU-only; no GPU is used or reported.

Usage:
  python benchmark.py [--seconds 30] [--block 512]
"""

import argparse
import os
import platform
import time

import numpy as np
import scipy

from morris_law_kernel import (
    NUMBA_AVAILABLE,
    PYLOUDNORM_AVAILABLE,
    IntelligentMultiBandIsolator,
    MorrisLawKernel,
    _asym_smooth,
    _windowed_rms,
)

SR = 44100


def make_test_signal(seconds: float, seed: int = 20260725) -> np.ndarray:
    """Deterministic stereo program: sines + noise + a 60 Hz 'kick' pulse train."""
    rng = np.random.default_rng(seed)
    n = int(SR * seconds)
    t = np.arange(n) / SR
    kick = 0.6 * np.sin(2 * np.pi * 60 * t) * (np.sin(2 * np.pi * 2.0 * t) > 0.9)
    melody = 0.25 * np.sin(2 * np.pi * 440 * t) + 0.15 * np.sin(2 * np.pi * 1320 * t)
    noise = 0.05 * rng.standard_normal(n)
    left = kick + melody + noise
    right = kick + 0.9 * melody + 0.05 * rng.standard_normal(n)
    x = np.stack([left, right], axis=1)
    return (0.9 * x / np.max(np.abs(x))).astype(np.float32)


def bench(label: str, fn, repeats: int = 3) -> float:
    best = min(_timed(fn) for _ in range(repeats))
    print(f"  {label:<46} {best * 1000:10.2f} ms")
    return best


def _timed(fn) -> float:
    t0 = time.perf_counter()
    fn()
    return time.perf_counter() - t0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=30.0)
    ap.add_argument("--block", type=int, default=512)
    args = ap.parse_args()

    print("Morris Law Kernel V3.5 — local benchmark (measured, not claimed)")
    print(f"  platform     : {platform.platform()}")
    print(f"  python       : {platform.python_version()}")
    print(f"  numpy/scipy  : {np.__version__} / {scipy.__version__}")
    if NUMBA_AVAILABLE:
        import numba
        print(f"  numba        : {numba.__version__} (JIT ON)")
    else:
        print("  numba        : not installed — pure-NumPy fallback (JIT OFF)")
    print(f"  pyloudnorm   : {'yes (BS.1770 loudness)' if PYLOUDNORM_AVAILABLE else 'no (RMS approximation)'}")
    print(f"  cpu count    : {os.cpu_count()} (CPU-only DSP; no GPU used)")
    print()

    audio = make_test_signal(args.seconds)
    kernel = MorrisLawKernel(SR)
    isolator = IntelligentMultiBandIsolator(SR)

    if NUMBA_AVAILABLE:
        t0 = time.perf_counter()
        kernel.process(audio[: SR // 2])  # compile the JIT kernels once
        print(f"  JIT warmup (one-time compile)                {(time.perf_counter() - t0) * 1000:10.2f} ms")

    dur = bench(f"kernel.process ({args.seconds:.0f}s stereo)", lambda: kernel.process(audio))
    print(f"  -> {args.seconds / dur:8.1f}x realtime")
    dur = bench(f"isolator.isolate_stem vocals ({args.seconds:.0f}s)", lambda: isolator.isolate_stem(audio, "vocals"))
    print(f"  -> {args.seconds / dur:8.1f}x realtime")
    print()

    # Per-block core-loop latency (the envelope + RMS inner kernels). This is
    # the number the sub-2ms design target refers to — verify it on YOUR box.
    block = np.ascontiguousarray(audio[: args.block, 0], dtype=np.float64)
    win = max(1, int(SR * 0.008))
    a_up, a_dn = 0.994, 0.9997
    _ = _windowed_rms(block, win, NUMBA_AVAILABLE)
    _ = _asym_smooth(block, a_up, a_dn, NUMBA_AVAILABLE)  # warm
    reps = 200
    t0 = time.perf_counter()
    for _i in range(reps):
        rms = _windowed_rms(block, win, NUMBA_AVAILABLE)
        _asym_smooth(rms, a_up, a_dn, NUMBA_AVAILABLE)
    per_block_ms = (time.perf_counter() - t0) / reps * 1000
    budget_ms = args.block / SR * 1000
    print(f"  core loops per {args.block}-sample block            {per_block_ms:10.3f} ms "
          f"(realtime budget {budget_ms:.2f} ms)")
    print()
    print("Numbers above are measured on this machine at this moment; they vary "
          "with hardware and load.")


if __name__ == "__main__":
    main()
