"""
Morris Law Kernel V3.5 - Production Audio Mastering Engine
Numba-Accelerated | Stereo Linked | Adaptive + Auto-Threshold | Ultra Lightweight

Developed for GravelKing Pro / All One LLC
IP Protected - All Rights Reserved
"""

import numpy as np
import scipy.signal as signal
from typing import Literal, Optional

# Optional Numba acceleration
try:
    from numba import njit
    NUMBA_AVAILABLE = True
except ImportError:
    NUMBA_AVAILABLE = False
    njit = lambda f: f   # fallback decorator (does nothing)


@njit(cache=True, fastmath=True)
def _njit_envelope(gr_db: np.ndarray, attack_alpha: float, release_alpha: float) -> np.ndarray:
    """Numba-accelerated one-pole attack/release envelope follower"""
    n = len(gr_db)
    gr_smooth = np.zeros(n, dtype=np.float64)
    for i in range(1, n):
        alpha = attack_alpha if gr_db[i] > gr_smooth[i-1] else release_alpha
        gr_smooth[i] = alpha * gr_smooth[i-1] + (1.0 - alpha) * gr_db[i]
    return gr_smooth


class MorrisLawKernel:
    """
    High-performance, Numba-accelerated audio mastering processor.
    Features all 3 advanced dynamics options + professional signal chain.
    """

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

    def _mono(self, x: np.ndarray) -> np.ndarray:
        return np.mean(x, axis=1) if (x.ndim == 2 and x.shape[1] == 2) else x

    def _shelf(self, x: np.ndarray, freq: float, gain_db: float, low: bool) -> np.ndarray:
        """True shelving EQ: keeps the original signal and adds/subtracts the
        filtered band. (The handover version replaced the signal with the band
        and cascaded lowpass→highpass, which nulled the audio; lfilter also
        defaulted to axis=-1, filtering the 2-sample channel axis on stereo.)
        """
        if abs(gain_db) < 0.05:
            return x
        b, a = signal.butter(2, freq / self.nyq, btype='low' if low else 'high')
        band = signal.lfilter(b, a, x, axis=0)
        return x + band * (10 ** (gain_db / 20.0) - 1.0)

    def _soft_saturate(self, x: np.ndarray, drive: float) -> np.ndarray:
        if drive < 0.01:
            return x
        return np.tanh(x * (1.0 + drive * 5.5)) / (1.0 + drive * 0.55)

    def _sidechain_filter(self, x: np.ndarray, mode: str, freq: float) -> np.ndarray:
        if mode == 'none' or freq < 25:
            return x
        btype = 'high' if mode == 'highpass' else 'low'
        b, a = signal.butter(2, freq / self.nyq, btype=btype)
        return signal.lfilter(b, a, x, axis=0)

    def _bass_energy_ratio(self, x: np.ndarray) -> float:
        mono = self._mono(x)
        b, a = signal.butter(2, 200 / self.nyq, btype='low')
        low = signal.lfilter(b, a, mono)
        rms_low = np.sqrt(np.mean(low * low))
        rms_all = np.sqrt(np.mean(mono * mono))
        return rms_low / rms_all if rms_all > 1e-9 else 0.0

    def _adaptive_sidechain_freq(self, x: np.ndarray, base_freq: float, mode: str) -> float:
        if mode != 'bass_aware':
            return base_freq
        ratio = self._bass_energy_ratio(x)
        if ratio > 0.55:
            return max(base_freq, 175.0)
        if ratio > 0.30:
            return max(base_freq, 135.0)
        return base_freq

    def _auto_threshold(self, detection: np.ndarray, offset_db: float) -> float:
        rms = np.sqrt(np.mean(detection * detection))
        if rms < 1e-8:
            return -28.0
        return 20 * np.log10(rms) + offset_db

    def _compressor(self, audio: np.ndarray,
                    ratio: float,
                    threshold_db: float = -18.0,
                    attack_ms: float = 4.0,
                    release_ms: float = 70.0,
                    sidechain_mode: str = 'none',
                    sidechain_freq: float = 140.0,
                    stereo_link: bool = True,
                    adaptive_mode: str = 'off',
                    auto_threshold: bool = False,
                    auto_offset_db: float = -15.0) -> np.ndarray:

        if ratio < 1.02:
            return audio

        is_stereo = (audio.ndim == 2 and audio.shape[1] == 2)

        sc_freq = self._adaptive_sidechain_freq(audio, sidechain_freq, adaptive_mode)

        if is_stereo and stereo_link:
            det = self._mono(audio)
        else:
            det = audio.copy() if not is_stereo else audio

        det = self._sidechain_filter(det, sidechain_mode, sc_freq)

        if auto_threshold:
            threshold_db = self._auto_threshold(det, auto_offset_db)

        # RMS detection — per column when the detector is stereo (unlinked).
        win = max(1, int(self.sample_rate * 0.008))
        kern = np.ones(win) / win
        if det.ndim == 2:
            rms = np.column_stack([
                np.sqrt(np.convolve(det[:, c] ** 2, kern, mode='same'))
                for c in range(det.shape[1])
            ])
        else:
            rms = np.sqrt(np.convolve(det ** 2, kern, mode='same'))

        db = 20 * np.log10(np.maximum(rms, 1e-9))
        over = np.maximum(db - threshold_db, 0.0)
        gr_db = over * (1.0 - 1.0 / ratio)

        # Attack / Release coefficients
        attack_alpha = np.exp(-1.0 / (self.sample_rate * (attack_ms / 1000.0)))
        release_alpha = np.exp(-1.0 / (self.sample_rate * (release_ms / 1000.0)))

        def _envelope_1d(g: np.ndarray) -> np.ndarray:
            if self._use_numba:
                return _njit_envelope(g.astype(np.float64), attack_alpha, release_alpha)
            s = np.zeros_like(g)
            for i in range(1, len(g)):
                alpha = attack_alpha if g[i] > s[i - 1] else release_alpha
                s[i] = alpha * s[i - 1] + (1.0 - alpha) * g[i]
            return s

        if gr_db.ndim == 2:
            gr_smooth = np.column_stack([_envelope_1d(gr_db[:, c]) for c in range(gr_db.shape[1])])
        else:
            gr_smooth = _envelope_1d(gr_db)

        gain_reduction = 10 ** (-gr_smooth / 20.0)

        if is_stereo and stereo_link:
            return audio * gain_reduction[:, np.newaxis]
        return audio * gain_reduction

    def process(self,
                audio: np.ndarray,
                preset: str = "gravelking_max",
                intensity: float = 65.0,
                target_lufs: float = -14.0,
                ceiling_db: float = -0.8,
                sidechain_mode: Literal['none', 'highpass', 'lowpass'] = 'highpass',
                sidechain_freq: float = 140.0,
                stereo_link: bool = True,
                adaptive_mode: Literal['off', 'bass_aware'] = 'bass_aware',
                auto_threshold: bool = True,
                auto_offset_db: float = -15.5,
                dry_wet: float = 1.0,
                output_gain_db: float = 0.0) -> np.ndarray:

        if preset not in self.PRESETS:
            raise ValueError(f"Unknown preset: {preset}")

        intensity = float(np.clip(intensity, 0, 100))
        S = intensity / 100.0
        p = self.PRESETS[preset]

        # EQ
        audio = self._shelf(audio, p["low_freq"], S * p["low_gain_max"], low=True)
        audio = self._shelf(audio, p["high_freq"], S * p["high_gain_max"], low=False)

        # Saturation
        audio = self._soft_saturate(audio, S * p["drive_max"])

        # Advanced Compressor (all 3 features)
        audio = self._compressor(
            audio,
            ratio=S * p["comp_ratio_max"],
            sidechain_mode=sidechain_mode,
            sidechain_freq=sidechain_freq,
            stereo_link=stereo_link,
            adaptive_mode=adaptive_mode,
            auto_threshold=auto_threshold,
            auto_offset_db=auto_offset_db
        )

        # Brickwall limiter
        peak = 10 ** (ceiling_db / 20.0)
        audio = np.clip(audio, -peak, peak)

        # LUFS staging
        rms = np.sqrt(np.mean(audio * audio))
        if rms > 1e-8:
            gain = (10 ** (target_lufs / 20.0)) / rms
            audio = audio * gain

        # Output processing
        if output_gain_db != 0.0:
            audio = audio * (10 ** (output_gain_db / 20.0))
        if dry_wet < 1.0:
            audio = audio * dry_wet

        return np.clip(audio, -1.0, 1.0).astype(np.float32)


if __name__ == "__main__":
    kernel = MorrisLawKernel(sample_rate=44100)
    status = "Numba accelerated" if NUMBA_AVAILABLE else "Numba not installed (pure Python fallback)"
    print(f"Morris Law Kernel V3.5 ready — {status}")
