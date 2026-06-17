---
name: DAW plugin/EQ accuracy + stem-split quality
description: Audit findings on the web DAW's plugin DSP correctness and the real separation quality of the MLK v3 stem splitter.
---

# Plugin/EQ DSP accuracy (web DAW)

The plugin chain (`useDAW.ts` `createPluginNode`) and the EQ-curve visualizer
(`PluginRack.tsx` `computeEQCurve`) are DSP-accurate EXCEPT the Gate:

- **EQ is correct.** 4 bands = lowshelf/peaking/peaking/highshelf via Web Audio
  `BiquadFilterNode`. The visualizer uses RBJ-cookbook coefficients + the
  `phi=4·sin²(w/2)` magnitude-squared formula, and shelf Q=0.707 matches Web
  Audio's fixed shelf slope (S=1). Minor cosmetic-only mismatch: visualizer
  hardcodes Fs=44100 while the live AudioContext may run at 48000 → curve drifts
  slightly vs. actual at HF; audio itself is correct.
- Compressor / Delay / Distortion / Gain / Pan / Reverb: all correct (dB→linear
  `10^(dB/20)`, ms→s `/1000`, feedback capped 95%, equal-gain wet/dry).
- **Gate is WRONG (the one real bug).** It is built as a `DynamicsCompressor`
  (ratio 20, knee 0) — a downward compressor/limiter that ducks signal ABOVE
  threshold. A real noise gate must attenuate signal BELOW threshold. At the
  default −50 dB threshold it squashes the whole signal instead of silencing
  quiet passages.
  **Why unfixed natively:** Web Audio has no native gate/expander; a faithful
  gate needs an AudioWorklet (sample-level envelope), which `createPluginNode`
  (synchronous) doesn't currently support.

# MLK v3 stem-split quality (measured)

`mlkStemSplit` is **frequency-band splitting + center-cancellation, NOT source
separation.** Measured on a synthetic true-stereo mix (distinct bass/vox/drum/
cymbal components):

- Bass (lowpass 250) and "other" (highpass 2500) isolate cleanly (~30 dB
  rejection of out-of-band content).
- **"drums" (bp 200–2500) and "vocals" (bp 180–5000) bands overlap → a 1 kHz
  vocal bleeds into the drums stem at essentially full source level.** Midrange
  sources are not separable this way; "vocals" is really a midrange stem.
- **"instrumental" (L−R center-cancel) only keeps stereo-width content** — any
  centered instrument/vocal vanishes, so it's a karaoke-residual/sides stem, not
  a true instrumental.
- The per-stem `applyMLKv3` post-carve normalizes/peak-limits each stem but adds
  no separation.

**Why this design:** the neural separator (Demucs/htdemucs) was dead-pathed and
removed from `pyproject.toml` to fit the 8 GiB deploy image. A lighter upgrade
that needs no neural net: HPSS (harmonic/percussive median-filter separation)
via the numpy/scipy now in the image — better drums-vs-tonal split than naive
bands, but still not full neural-grade stems.
