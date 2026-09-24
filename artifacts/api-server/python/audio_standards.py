"""Canonical audio format and ITU-R BS.1770-4 measurement helpers."""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np
from scipy import signal

CANONICAL_SAMPLE_RATE = 48_000
CANONICAL_BIT_DEPTH = 24

try:
    import pyloudnorm as pyln
except ImportError:  # The immutable Replit Python image may omit optional wheels.
    pyln = None


def _as_channels(audio: np.ndarray) -> np.ndarray:
    data = np.asarray(audio, dtype=np.float64)
    if data.ndim == 1:
        data = data[:, np.newaxis]
    if data.ndim != 2:
        raise ValueError(f"audio must be one- or two-dimensional, got {data.shape}")
    return data


def _k_weight(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    """Apply the two cascaded BS.1770 K-weighting filters."""
    data = _as_channels(audio)
    # Coefficients from ITU-R BS.1770-4, Annex 1.
    shelf_b = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    shelf_a = [1.0, -1.69065929318241, 0.73248077421585]
    highpass_b = [1.0, -2.0, 1.0]
    highpass_a = [1.0, -1.99004745483398, 0.990072250366401]
    filtered = signal.lfilter(shelf_b, shelf_a, data, axis=0)
    return signal.lfilter(highpass_b, highpass_a, filtered, axis=0)


def integrated_lufs(audio: np.ndarray, sample_rate: int) -> float:
    """Return integrated loudness using BS.1770-4 K-weighting and gating."""
    data = _as_channels(audio)
    if data.size == 0:
        return float("-inf")
    if pyln is not None:
        return float(pyln.Meter(sample_rate).integrated_loudness(data))

    weighted = _k_weight(data, sample_rate)
    block = max(1, int(round(sample_rate * 0.400)))
    step = max(1, int(round(sample_rate * 0.100)))
    if weighted.shape[0] < block:
        padded = np.pad(weighted, ((0, block - weighted.shape[0]), (0, 0)))
        weighted = padded
    energies: list[float] = []
    for start in range(0, weighted.shape[0] - block + 1, step):
        window = weighted[start:start + block]
        energies.append(float(np.mean(window * window)))
    if not energies:
        energies = [float(np.mean(weighted * weighted))]
    energies_np = np.asarray(energies)
    loudness = -0.691 + 10.0 * np.log10(np.maximum(energies_np, 1e-20))
    absolute = loudness >= -70.0
    if not np.any(absolute):
        return float("-inf")
    ungated_energy = float(np.mean(energies_np[absolute]))
    relative_gate = -0.691 + 10.0 * np.log10(max(ungated_energy, 1e-20)) - 10.0
    gated = absolute & (loudness >= relative_gate)
    gated_energy = float(np.mean(energies_np[gated])) if np.any(gated) else ungated_energy
    return float(-0.691 + 10.0 * np.log10(max(gated_energy, 1e-20)))


def write_pcm24_wav(path: str | Path, audio: np.ndarray, sample_rate: int) -> None:
    """Write interleaved little-endian 24-bit PCM without float truncation."""
    data = _as_channels(audio)
    clipped = np.clip(data, -1.0, 1.0)
    # Use the symmetric signed 24-bit range. -1.0 is -8388608; +1.0 is +8388607.
    integers = np.where(
        clipped < 0,
        np.round(clipped * 8_388_608.0),
        np.round(clipped * 8_388_607.0),
    ).astype(np.int32)
    interleaved = integers.reshape(-1)
    packed = np.empty((interleaved.size, 3), dtype=np.uint8)
    packed[:, 0] = (interleaved & 0xFF).astype(np.uint8)
    packed[:, 1] = ((interleaved >> 8) & 0xFF).astype(np.uint8)
    packed[:, 2] = ((interleaved >> 16) & 0xFF).astype(np.uint8)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(data.shape[1])
        wav.setsampwidth(3)
        wav.setframerate(sample_rate)
        wav.writeframes(packed.tobytes())


def read_pcm24_samples(path: str | Path) -> tuple[int, np.ndarray]:
    """Read a PCM WAV through scipy and normalize common integer widths."""
    from scipy.io import wavfile

    sample_rate, raw = wavfile.read(str(path))
    if raw.dtype == np.int16:
        audio = raw.astype(np.float32) / 32768.0
    elif raw.dtype == np.int32:
        # scipy represents 24-bit PCM in the high 24 bits of int32.
        scale = 2.0 ** 31 if np.max(np.abs(raw), initial=0) > 8_388_607 else 8_388_608.0
        audio = raw.astype(np.float32) / scale
    else:
        audio = raw.astype(np.float32)
    return int(sample_rate), _as_channels(audio).astype(np.float32)