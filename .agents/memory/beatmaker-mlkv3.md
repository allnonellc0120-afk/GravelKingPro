---
name: Beat Maker + MLK v3
description: How beat generation works (ffmpeg lavfi) and how MLK v3 multi-band kernel processes audio
---

## Beat synthesis (artifacts/api-server/src/routes/beatmaker.ts)
- Uses ffmpeg `-f lavfi` sine sources to generate 4 frequency layers: bass (root/4), root, major 3rd (root×1.2599), perfect 5th (root×1.4983)
- Genre EQ applied per genre (e.g. trap=bass:g=9, lofi=lowpass:f=3000)
- Tremolo applied at beat frequency (BPM/60 Hz) for rhythmic feel
- Mix via `amix`, normalize via `loudnorm`
- Free: 30s; Pro: up to 120s

## MLK v3 (artifacts/api-server/src/kernel-v3.ts)
- 3-stage multi-band processing: low (W=16 FIR smooth), mid (W=4), detail (high = original − low − mid)
- Each band gets gravelking_opt applied with slightly different multiplier: low×1.15, mid×1.0, high×0.80
- Phase-coherent recombination + peak normalization to 0.92
- Input/output: float32 arrays via bufferToFloat32 / float32ToBuffer (pcm_s16le ↔ float32)
- Mood maps to multiplier: aggressive=1.8, dark=1.4, uplifting=0.85, chill=0.65

**Why:** Standard gravelking_opt applies uniform carving — MLK v3 adds multi-band awareness so bass frequencies get more presence while highs are treated gently, improving perceptual quality.
