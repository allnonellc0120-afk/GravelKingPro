"""
Morris Law Kernel V3.5 - Production Audio Mastering Engine
Numba Accelerated | Adaptive Dynamics | Plugin-Ready | Moat Technology
"""

import numpy as np
import scipy.signal as signal
from typing import Literal, Dict
import warnings

try:
    from numba import njit, prange
    NUMBA_AVAILABLE = True
except ImportError:
    NUMBA_AVAILABLE = False
    def njit(*args, **kwargs):
        def decorator(f): return f
        return decorator
    prange = range

@njit(cache=True, fastmath=True, parallel=True)
def _njit_envelope(gr_db, attack_alpha, release_alpha):
    n = len(gr_db)
    gr_smooth = np.empty(n, dtype=np.float64)
    gr_smooth[0] = gr_db[0]
    for i in prange(1, n):
        alpha = attack_alpha if gr_db[i] > gr_smooth[i-1] else release_alpha
        gr_smooth[i] = alpha * gr_smooth[i-1] + (1.0 - alpha) * gr_db[i]
    return gr_smooth

@njit(cache=True, fastmath=True)
def _njit_rms(x, window):
    n = len(x)
    out = np.empty(n, dtype=np.float64)
    inv = 1.0 / window
    acc = 0.0
    for i in range(n):
        acc += x[i] * x[i]
        if i >= window:
            acc -= x[i-window] * x[i-window]
        out[i] = np.sqrt(acc * inv)
    return out

class MorrisLawKernel:
    PRESETS = {
        "warm_vintage": {"low_freq": 100.0, "low_gain_max": 4.0, "high_freq": 8000.0, "high_gain_max": -1.0, "drive_max": 0.35, "comp_ratio_max": 3.0},
        "sub_fire":     {"low_freq": 60.0,  "low_gain_max": 6.0, "high_freq": 4000.0, "high_gain_max": 2.5, "drive_max": 0.50, "comp_ratio_max": 4.0},
        "natural_body": {"low_freq": 120.0, "low_gain_max": 1.5, "high_freq": 6000.0, "high_gain_max": 1.5, "drive_max": 0.10, "comp_ratio_max": 1.8},
        "air_sheen":    {"low_freq": 100.0, "low_gain_max": 0.0, "high_freq": 10000.0, "high_gain_max": 6.0, "drive_max": 0.15, "comp_ratio_max": 2.2},
        "spatial_edge": {"low_freq": 80.0,  "low_gain_max": 2.0, "high_freq": 7500.0, "high_gain_max": 4.5, "drive_max": 0.25, "comp_ratio_max": 3.0},
        "gravelking_max": {"low_freq": 80.0, "low_gain_max": 4.5, "high_freq": 9000.0, "high_gain_max": 4.5, "drive_max": 0.40, "comp_ratio_max": 3.5},
    }

    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.nyq = sample_rate / 2.0
        self._use_numba = NUMBA_AVAILABLE

    def _mono(self, x):
        return np.mean(x, axis=1) if (x.ndim == 2 and x.shape[1] == 2) else x

    def _shelf(self, x, freq, gain_db, low):
        if abs(gain_db) < 0.05: return x
        b, a = signal.butter(2, freq / self.nyq, btype='low' if low else 'high')
        return signal.lfilter(b, a, x) * (10 ** (gain_db / 20.0))

    def _soft_saturate(self, x, drive):
        if drive < 0.01: return x
        return np.tanh(x * (1.0 + drive * 5.5)) / (1.0 + drive * 0.55)

    def _sidechain_filter(self, x, mode, freq):
        if mode == 'none' or freq < 25: return x
        btype = 'high' if mode == 'highpass' else 'low'
        b, a = signal.butter(2, freq / self.nyq, btype=btype)
        return signal.lfilter(b, a, x)

    def _compressor(self, audio, ratio, threshold_db=-18.0, attack_ms=4.0, release_ms=70.0,
                    sidechain_mode='none', sidechain_freq=140.0, stereo_link=True,
                    adaptive_mode='off', auto_threshold=False, auto_offset_db=-15.0):

        if ratio < 1.02: return audio
        is_stereo = (audio.ndim == 2 and audio.shape[1] == 2)
        det = self._mono(audio) if (is_stereo and stereo_link) else audio.copy()
        det = self._sidechain_filter(det, sidechain_mode, sidechain_freq)

        if auto_threshold:
            rms = np.sqrt(np.mean(det**2))
            threshold_db = 20 * np.log10(rms) + auto_offset_db if rms > 1e-8 else -28.0

        win = max(1, int(self.sample_rate * 0.008))
        rms = _njit_rms(det.astype(np.float64), win) if self._use_numba else np.sqrt(np.convolve(det**2, np.ones(win)/win, mode='same'))

        db = 20 * np.log10(np.maximum(rms, 1e-9))
        gr_db = np.maximum(db - threshold_db, 0.0) * (1.0 - 1.0 / ratio)

        attack_a = np.exp(-1.0 / (self.sample_rate * (attack_ms / 1000.0)))
        release_a = np.exp(-1.0 / (self.sample_rate * (release_ms / 1000.0)))

        if self._use_numba:
            gr_smooth = _njit_envelope(gr_db.astype(np.float64), attack_a, release_a)
        else:
            gr_smooth = np.zeros_like(gr_db)
            for i in range(1, len(gr_db)):
                alpha = attack_a if gr_db[i] > gr_smooth[i-1] else release_a
                gr_smooth[i] = alpha * gr_smooth[i-1] + (1.0 - alpha) * gr_db[i]

        gain = 10 ** (-gr_smooth / 20.0)
        return audio * (gain[:, np.newaxis] if (is_stereo and stereo_link) else gain)

    def process(self, audio, preset="gravelking_max", intensity=65.0, target_lufs=-14.0,
                ceiling_db=-0.8, sidechain_mode='highpass', sidechain_freq=140.0,
                stereo_link=True, adaptive_mode='bass_aware', auto_threshold=True,
                auto_offset_db=-15.5, dry_wet=1.0, output_gain_db=0.0):

        if preset not in self.PRESETS: raise ValueError(f"Unknown preset: {preset}")
        S = float(np.clip(intensity, 0, 100)) / 100.0
        p = self.PRESETS[preset]

        audio = self._shelf(audio, p["low_freq"], S * p["low_gain_max"], low=True)
        audio = self._shelf(audio, p["high_freq"], S * p["high_gain_max"], low=False)
        audio = self._soft_saturate(audio, S * p["drive_max"])

        audio = self._compressor(audio, S * p["comp_ratio_max"],
                                 sidechain_mode=sidechain_mode, sidechain_freq=sidechain_freq,
                                 stereo_link=stereo_link, adaptive_mode=adaptive_mode,
                                 auto_threshold=auto_threshold, auto_offset_db=auto_offset_db)

        peak = 10 ** (ceiling_db / 20.0)
        audio = np.clip(audio, -peak, peak)

        rms = np.sqrt(np.mean(audio * audio))
        if rms > 1e-8:
            audio *= (10 ** (target_lufs / 20.0)) / rms

        if output_gain_db != 0.0: audio *= (10 ** (output_gain_db / 20.0))
        if dry_wet < 1.0: audio *= dry_wet

        return np.clip(audio, -1.0, 1.0).astype(np.float32)


class IntelligentMultiBandIsolator:
    def __init__(self, sample_rate=44100):
        self.sample_rate = sample_rate
        self.nyq = sample_rate / 2.0

    def isolate_voice(self, audio, strength=0.85):
        mono = np.mean(audio, axis=1) if audio.ndim == 2 else audio
        b, a = signal.butter(2, 180 / self.nyq, btype='high')
        emphasized = signal.lfilter(b, a, mono)
        energy = np.abs(emphasized)
        thresh = np.percentile(energy, 30)
        gate = np.clip((energy - thresh) / (np.max(energy) + 1e-6), 0, 1)
        gate = np.convolve(gate, np.ones(128)/128, mode='same') ** 0.7
        return (emphasized * gate * strength).astype(np.float32)
