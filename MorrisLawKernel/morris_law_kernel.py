"""
Morris Law Kernel V3.5 — Production Audio Mastering Engine
Numba JIT | Stereo-Linked Adaptive Sidechain | Auto-Threshold | Multi-Band Isolation

Grok V3.5 production feature set:
  - Numba JIT acceleration (cache=True, fastmath=True; parallel=True where the
    math is actually parallelizable — see notes on the envelope recurrence).
  - stereo_link=True: linked L+R detection (single gain curve, no image shift);
    stereo_link=False: true dual-mono (independent per-channel compression).
  - adaptive_mode='bass_aware': measures low-frequency energy (<200 Hz) and
    dynamically lifts the sidechain high-pass cutoff during bass-heavy
    passages so kicks/808s don't pump the compressor.
  - auto_threshold=True: threshold rides the program RMS level at
    auto_threshold_offset_db below it.
  - IntelligentMultiBandIsolator: fast, pure-DSP band-weighted energy gating
    for vocal/stem isolation (honest approximation — expect bleed; this is
    filter-and-gate DSP, not ML source separation).

Falls back to pure NumPy automatically when Numba is not installed.
"""

import numpy as np
import scipy.signal as signal
from typing import Dict, Literal
import warnings

try:
    from numba import njit, prange
    NUMBA_AVAILABLE = True
except ImportError:
    NUMBA_AVAILABLE = False
    def njit(*args, **kwargs):
        def decorator(f):
            return f
        return decorator
    prange = range

try:
    import pyloudnorm as _pyln
    PYLOUDNORM_AVAILABLE = True
except ImportError:
    PYLOUDNORM_AVAILABLE = False


# ── Numba JIT kernels ─────────────────────────────────────────────────────────
# Parallelization policy: prange is used ONLY where iterations are independent.
# One-pole envelope followers are sequential recurrences (out[i] depends on
# out[i-1]); running those under prange is a data race, so they are JIT-compiled
# without parallel=True. The windowed-RMS read-out has no cross-iteration
# dependency, so it gets the full parallel treatment.

@njit(cache=True, fastmath=True)
def _njit_prefix_sq(x):
    """Sequential prefix sum of squares (recurrence — intentionally serial)."""
    n = len(x)
    prefix = np.empty(n + 1, dtype=np.float64)
    prefix[0] = 0.0
    for i in range(n):
        prefix[i + 1] = prefix[i] + x[i] * x[i]
    return prefix


@njit(cache=True, fastmath=True, parallel=True)
def _njit_windowed_rms(prefix, window):
    """Sliding-window RMS from prefix sums — independent per sample, prange-safe."""
    n = len(prefix) - 1
    out = np.empty(n, dtype=np.float64)
    inv = 1.0 / window
    for i in prange(n):
        lo = i - window + 1
        if lo < 0:
            lo = 0
        acc = prefix[i + 1] - prefix[lo]
        if acc < 0.0:
            acc = 0.0
        out[i] = np.sqrt(acc * inv)
    return out


@njit(cache=True, fastmath=True)
def _njit_asym_smooth(x, alpha_up, alpha_dn):
    """Asymmetric one-pole smoother (attack/release envelope).
    Sequential recurrence — must NOT be prange'd (data race)."""
    n = len(x)
    out = np.empty(n, dtype=np.float64)
    out[0] = x[0]
    for i in range(1, n):
        alpha = alpha_up if x[i] > out[i - 1] else alpha_dn
        out[i] = alpha * out[i - 1] + (1.0 - alpha) * x[i]
    return out


def _windowed_rms(x, window, use_numba):
    x = np.ascontiguousarray(x, dtype=np.float64)
    if use_numba:
        return _njit_windowed_rms(_njit_prefix_sq(x), window)
    prefix = np.concatenate(([0.0], np.cumsum(x * x)))
    idx_lo = np.maximum(0, np.arange(len(x)) - window + 1)
    return np.sqrt(np.maximum(prefix[1:] - prefix[idx_lo], 0.0) / window)


def _asym_smooth(x, alpha_up, alpha_dn, use_numba):
    x = np.ascontiguousarray(x, dtype=np.float64)
    if use_numba:
        return _njit_asym_smooth(x, alpha_up, alpha_dn)
    out = np.empty_like(x)
    out[0] = x[0]
    for i in range(1, len(x)):
        alpha = alpha_up if x[i] > out[i - 1] else alpha_dn
        out[i] = alpha * out[i - 1] + (1.0 - alpha) * x[i]
    return out


def _one_pole_lowpass(x, alpha):
    """Symmetric one-pole smoother (linear — safe as an IIR filter)."""
    return signal.lfilter([1.0 - alpha], [1.0, -alpha], x)


# ── Mastering kernel ──────────────────────────────────────────────────────────

class MorrisLawKernel:
    PRESETS = {
        "warm_vintage": {"low_freq": 100.0, "low_gain_max": 4.0, "high_freq": 8000.0, "high_gain_max": -1.0, "drive_max": 0.35, "comp_ratio_max": 3.0},
        "sub_fire":     {"low_freq": 60.0,  "low_gain_max": 6.0, "high_freq": 4000.0, "high_gain_max": 2.5, "drive_max": 0.50, "comp_ratio_max": 4.0},
        "natural_body": {"low_freq": 120.0, "low_gain_max": 1.5, "high_freq": 6000.0, "high_gain_max": 1.5, "drive_max": 0.10, "comp_ratio_max": 1.8},
        "air_sheen":    {"low_freq": 100.0, "low_gain_max": 0.0, "high_freq": 10000.0, "high_gain_max": 6.0, "drive_max": 0.15, "comp_ratio_max": 2.2},
        "spatial_edge": {"low_freq": 80.0,  "low_gain_max": 2.0, "high_freq": 7500.0, "high_gain_max": 4.5, "drive_max": 0.25, "comp_ratio_max": 3.0},
        "gravelking_max": {"low_freq": 80.0, "low_gain_max": 4.5, "high_freq": 9000.0, "high_gain_max": 4.5, "drive_max": 0.40, "comp_ratio_max": 3.5},
    }

    BASS_ANALYSIS_HZ = 200.0     # "bass-aware" band: energy below this lifts the cutoff
    BASS_LIFT_CEILING_HZ = 320.0  # lifted sidechain cutoff never exceeds this

    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.nyq = sample_rate / 2.0
        self._use_numba = NUMBA_AVAILABLE

    # ── small DSP helpers ────────────────────────────────────────────────────

    def _mono(self, x):
        return np.mean(x, axis=1) if (x.ndim == 2 and x.shape[1] == 2) else x

    def _shelf(self, x, freq, gain_db, low):
        """RBJ Audio-EQ-Cookbook shelving biquad: unity gain in the passband,
        smooth boost/cut around the corner. (A pass-filter + makeup gain is NOT
        a shelf — it deletes the rest of the spectrum.)"""
        if abs(gain_db) < 0.05:
            return x
        freq = min(freq, 0.45 * self.sample_rate)  # keep the biquad stable below Nyquist
        A = 10.0 ** (gain_db / 40.0)
        w0 = 2.0 * np.pi * freq / self.sample_rate
        cosw, sinw = np.cos(w0), np.sin(w0)
        alpha = sinw / 2.0 * np.sqrt(2.0)  # shelf slope S = 1
        two_sqrtA_alpha = 2.0 * np.sqrt(A) * alpha
        if low:
            b0 = A * ((A + 1) - (A - 1) * cosw + two_sqrtA_alpha)
            b1 = 2 * A * ((A - 1) - (A + 1) * cosw)
            b2 = A * ((A + 1) - (A - 1) * cosw - two_sqrtA_alpha)
            a0 = (A + 1) + (A - 1) * cosw + two_sqrtA_alpha
            a1 = -2 * ((A - 1) + (A + 1) * cosw)
            a2 = (A + 1) + (A - 1) * cosw - two_sqrtA_alpha
        else:
            b0 = A * ((A + 1) + (A - 1) * cosw + two_sqrtA_alpha)
            b1 = -2 * A * ((A - 1) + (A + 1) * cosw)
            b2 = A * ((A + 1) + (A - 1) * cosw - two_sqrtA_alpha)
            a0 = (A + 1) - (A - 1) * cosw + two_sqrtA_alpha
            a1 = 2 * ((A - 1) - (A + 1) * cosw)
            a2 = (A + 1) - (A - 1) * cosw - two_sqrtA_alpha
        b = np.array([b0, b1, b2]) / a0
        a = np.array([1.0, a1 / a0, a2 / a0])
        return signal.lfilter(b, a, x, axis=0)

    def _soft_saturate(self, x, drive):
        if drive < 0.01:
            return x
        return np.tanh(x * (1.0 + drive * 5.5)) / (1.0 + drive * 0.55)

    def _sidechain_filter(self, x, mode, freq):
        if mode == 'none' or freq < 25:
            return x
        btype = 'high' if mode == 'highpass' else 'low'
        freq = min(freq, 0.45 * self.sample_rate)  # butter() raises at/above Nyquist
        b, a = signal.butter(2, freq / self.nyq, btype=btype)
        return signal.lfilter(b, a, x)

    # ── adaptive bass-aware sidechain ────────────────────────────────────────

    def _bass_aware_detector(self, x, base_freq):
        """Bass-aware adaptive sidechain detection.

        Measures the short-time low-frequency energy fraction (<200 Hz) and
        morphs the detection signal between a high-pass at `base_freq` and a
        lifted cutoff (2.4× base, capped at 320 Hz). Bass-heavy passages push
        detection toward the lifted cutoff so sustained lows (kick/808) don't
        drive gain reduction — i.e. anti-pumping. Implemented as a crossfade
        between two time-invariant filters weighted by the smoothed bass
        fraction, which is artifact-free (no time-varying filter zipper)."""
        lifted = float(min(max(base_freq * 2.4, base_freq + 60.0), self.BASS_LIFT_CEILING_HZ))
        sos_lp = signal.butter(2, self.BASS_ANALYSIS_HZ / self.nyq, btype='low', output='sos')
        bass = signal.sosfilt(sos_lp, x)

        win = max(1, int(self.sample_rate * 0.05))          # 50 ms energy frames
        bass_rms = _windowed_rms(bass, win, self._use_numba)
        total_rms = _windowed_rms(x, win, self._use_numba)
        ratio = np.clip(bass_rms / (total_rms + 1e-9), 0.0, 1.0)
        alpha = np.exp(-1.0 / (self.sample_rate * 0.15))     # 150 ms smoothing
        weight = np.clip(_one_pole_lowpass(ratio, alpha), 0.0, 1.0)

        det_base = self._sidechain_filter(x, 'highpass', base_freq)
        det_lift = self._sidechain_filter(x, 'highpass', lifted)
        return det_base * (1.0 - weight) + det_lift * weight

    # ── compressor ───────────────────────────────────────────────────────────

    def _gain_curve(self, det, ratio, threshold_db, attack_ms, release_ms,
                    auto_threshold, auto_threshold_offset_db):
        """Gain curve from a 1-D detection signal (auto-threshold aware)."""
        if auto_threshold:
            program_rms = float(np.sqrt(np.mean(det * det)))
            threshold_db = (20.0 * np.log10(program_rms) + auto_threshold_offset_db
                            if program_rms > 1e-8 else -28.0)

        win = max(1, min(int(self.sample_rate * 0.008), det.shape[0]))
        rms = _windowed_rms(det, win, self._use_numba)
        db = 20.0 * np.log10(np.maximum(rms, 1e-9))
        gr_db = np.maximum(db - threshold_db, 0.0) * (1.0 - 1.0 / ratio)

        attack_a = np.exp(-1.0 / (self.sample_rate * (attack_ms / 1000.0)))
        release_a = np.exp(-1.0 / (self.sample_rate * (release_ms / 1000.0)))
        gr_smooth = _asym_smooth(gr_db, attack_a, release_a, self._use_numba)
        return 10.0 ** (-gr_smooth / 20.0)

    def _compressor(self, audio, ratio, threshold_db=-18.0, attack_ms=4.0, release_ms=70.0,
                    sidechain_mode='none', sidechain_freq=140.0, stereo_link=True,
                    adaptive_mode='off', auto_threshold=False, auto_threshold_offset_db=-15.5):
        if ratio < 1.02:
            return audio

        def detect(sig_1d):
            if adaptive_mode == 'bass_aware' and sidechain_mode == 'highpass' and sidechain_freq >= 25:
                return self._bass_aware_detector(sig_1d, sidechain_freq)
            return self._sidechain_filter(sig_1d, sidechain_mode, sidechain_freq)

        def gain_for(sig_1d):
            return self._gain_curve(detect(np.asarray(sig_1d, dtype=np.float64)),
                                    ratio, threshold_db, attack_ms, release_ms,
                                    auto_threshold, auto_threshold_offset_db)

        is_stereo = (audio.ndim == 2 and audio.shape[1] == 2)
        if is_stereo and stereo_link:
            # Linked L+R detection: one gain curve, both channels — no image shift.
            gain = gain_for(0.5 * (audio[:, 0] + audio[:, 1]))
            return audio * gain[:, np.newaxis]
        if is_stereo:
            # True dual-mono: each channel detected and compressed independently.
            gains = np.stack([gain_for(audio[:, c]) for c in (0, 1)], axis=1)
            return audio * gains
        return audio * gain_for(audio)

    # ── loudness ─────────────────────────────────────────────────────────────

    def _loudness_normalize(self, audio, target_lufs):
        """ITU-R BS.1770 integrated loudness via pyloudnorm when available;
        otherwise an RMS approximation (documented, not silent)."""
        x = np.asarray(audio, dtype=np.float64)
        if PYLOUDNORM_AVAILABLE and x.shape[0] >= int(self.sample_rate * 0.5):
            try:
                loudness = _pyln.Meter(self.sample_rate).integrated_loudness(x)
                if np.isfinite(loudness) and loudness > -70.0:
                    return audio * (10.0 ** ((target_lufs - loudness) / 20.0))
                warnings.warn("input is effectively silent (< -70 LUFS); "
                              "skipping loudness normalization")
                return audio
            except Exception as exc:  # pragma: no cover — meter edge cases
                warnings.warn(f"pyloudnorm failed ({exc}); using RMS approximation")
        rms = float(np.sqrt(np.mean(x * x)))
        if rms <= 10.0 ** (-70.0 / 20.0):
            warnings.warn("input is effectively silent; skipping loudness normalization")
            return audio
        return audio * ((10.0 ** (target_lufs / 20.0)) / rms)

    # ── main entry ───────────────────────────────────────────────────────────

    def process(self, audio, preset="gravelking_max", intensity=65.0, target_lufs=-14.0,
                ceiling_db=-0.8, sidechain_mode='highpass', sidechain_freq=140.0,
                stereo_link=True, adaptive_mode='bass_aware', auto_threshold=True,
                auto_threshold_offset_db=-15.5, dry_wet=1.0, output_gain_db=0.0):
        if preset not in self.PRESETS:
            raise ValueError(f"Unknown preset: {preset}")
        S = float(np.clip(intensity, 0, 100)) / 100.0
        p = self.PRESETS[preset]

        dry = np.asarray(audio, dtype=np.float64)
        if dry.size == 0:
            raise ValueError("input audio is empty (0 samples)")
        if dry.ndim > 2 or (dry.ndim == 2 and dry.shape[1] > 2):
            raise ValueError(f"only mono or stereo audio is supported (got shape {dry.shape})")
        wet = dry.copy()
        wet = self._shelf(wet, p["low_freq"], S * p["low_gain_max"], low=True)
        wet = self._shelf(wet, p["high_freq"], S * p["high_gain_max"], low=False)
        wet = self._soft_saturate(wet, S * p["drive_max"])
        wet = self._compressor(wet, 1.0 + S * (p["comp_ratio_max"] - 1.0),
                               sidechain_mode=sidechain_mode, sidechain_freq=sidechain_freq,
                               stereo_link=stereo_link, adaptive_mode=adaptive_mode,
                               auto_threshold=auto_threshold,
                               auto_threshold_offset_db=auto_threshold_offset_db)

        wet = self._loudness_normalize(wet, target_lufs)
        if output_gain_db != 0.0:
            wet *= 10.0 ** (output_gain_db / 20.0)

        out = wet if dry_wet >= 1.0 else dry * (1.0 - dry_wet) + wet * dry_wet

        # Ceiling by transparent gain trim — never by clipping. If the loudness
        # target would push true peaks past the ceiling (high crest factor),
        # the ceiling wins and the track lands below target: loudness is never
        # manufactured by distorting the waveform.
        peak = 10.0 ** (ceiling_db / 20.0)
        max_abs = float(np.max(np.abs(out))) if out.size else 0.0
        if max_abs > peak:
            out *= peak / max_abs
        return np.clip(out, -1.0, 1.0).astype(np.float32)


# ── Intelligent multi-band isolator ──────────────────────────────────────────

class IntelligentMultiBandIsolator:
    """Fast, pure-DSP frequency-band gating for vocal/stem isolation.

    Honest scope: this is filter-bank + adaptive energy gating. It suppresses
    material outside the target stem's bands and outside its energy envelope —
    it does NOT perform ML source separation, and bleed within shared bands is
    expected. Built for the combined Studio DAW where speed and zero model
    weights matter."""

    BANDS = (
        ("sub",      20.0,   120.0),
        ("low",      120.0,  350.0),
        ("body",     350.0,  1200.0),
        ("presence", 1200.0, 4200.0),
        ("air",      4200.0, 16000.0),
    )

    STEM_PROFILES: Dict[str, Dict] = {
        "vocals": {
            "gate_from": ("body", "presence"),
            "weights": {"sub": 0.05, "low": 0.35, "body": 1.0, "presence": 1.0, "air": 0.7},
            "transient": False,
        },
        "bass": {
            "gate_from": ("sub", "low"),
            "weights": {"sub": 1.0, "low": 0.9, "body": 0.15, "presence": 0.05, "air": 0.02},
            "transient": False,
        },
        "drums": {
            "gate_from": ("sub", "air"),
            "weights": {"sub": 0.8, "low": 0.5, "body": 0.35, "presence": 0.6, "air": 0.9},
            "transient": True,
        },
    }

    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.nyq = sample_rate / 2.0
        self._use_numba = NUMBA_AVAILABLE
        self._sos: Dict[str, np.ndarray] = {}
        for name, lo, hi in self.BANDS:
            hi = min(hi, self.nyq * 0.98)
            if lo >= hi * 0.999:
                continue  # band sits entirely above Nyquist at this rate — skip deterministically
            self._sos[name] = signal.butter(4, [lo / self.nyq, hi / self.nyq],
                                            btype='bandpass', output='sos')
        if len(self._sos) < 2:
            raise ValueError(
                f"sample_rate={sample_rate} Hz is too low for the isolator's band plan; "
                "need at least 2 usable bands below Nyquist")

    def _band_split(self, mono):
        return {name: signal.sosfilt(sos, mono) for name, sos in self._sos.items()}

    def _gate_envelope(self, gate_source, transient):
        att = np.exp(-1.0 / (self.sample_rate * 0.003))   # 3 ms attack
        rel = np.exp(-1.0 / (self.sample_rate * 0.080))   # 80 ms release
        env = _asym_smooth(np.abs(gate_source), att, rel, self._use_numba)
        if transient:
            # Emphasize onsets: positive envelope derivative, re-smoothed.
            onset = np.maximum(np.diff(env, prepend=env[0]), 0.0)
            att_t = np.exp(-1.0 / (self.sample_rate * 0.001))
            rel_t = np.exp(-1.0 / (self.sample_rate * 0.060))
            env = _asym_smooth(onset, att_t, rel_t, self._use_numba)
        return env

    def _soft_gate(self, env, strength):
        thresh = np.percentile(env, 35.0)                  # adaptive threshold
        span = float(np.max(env) - thresh)
        gate = np.clip((env - thresh) / (span + 1e-9), 0.0, 1.0)
        return gate ** (0.5 + float(np.clip(strength, 0.0, 1.0)))

    def isolate_stem(self, audio, stem: Literal["vocals", "bass", "drums"] = "vocals",
                     strength: float = 0.85):
        if stem not in self.STEM_PROFILES:
            raise ValueError(f"Unknown stem: {stem} (choose from {list(self.STEM_PROFILES)})")
        profile = self.STEM_PROFILES[stem]
        audio = np.asarray(audio)
        if audio.size == 0:
            raise ValueError("input audio is empty (0 samples)")
        mono = np.mean(audio, axis=1) if audio.ndim == 2 else np.asarray(audio, dtype=np.float64)
        bands = self._band_split(mono)

        gate_bands = [b for b in profile["gate_from"] if b in bands]
        if not gate_bands:
            raise ValueError(
                f"stem '{stem}' cannot be isolated at {self.sample_rate} Hz — "
                "its defining bands sit above Nyquist")
        gate_source = sum(bands[b] for b in gate_bands)
        env = self._gate_envelope(gate_source, profile["transient"])
        gate = self._soft_gate(env, strength)

        out = np.zeros_like(mono)
        for name in bands:  # only bands valid at this sample rate
            out += profile["weights"][name] * bands[name]
        return (out * gate).astype(np.float32)

    def isolate_band(self, audio, band: str):
        """Raw single-band output (no gating) — building block for stem tools."""
        if band not in self._sos:
            raise ValueError(
                f"Band '{band}' is not available at {self.sample_rate} Hz "
                f"(usable bands: {list(self._sos)})")
        audio = np.asarray(audio)
        if audio.size == 0:
            raise ValueError("input audio is empty (0 samples)")
        mono = np.mean(audio, axis=1) if audio.ndim == 2 else np.asarray(audio, dtype=np.float64)
        return signal.sosfilt(self._sos[band], mono).astype(np.float32)

    def isolate_voice(self, audio, strength: float = 0.85):
        """Back-compat wrapper — vocal-profile stem isolation."""
        return self.isolate_stem(audio, "vocals", strength)
