---
name: Vocal effects recording pattern
description: Vocal Booth keeps effect monitoring separate from clean dry stem capture; shared preset module; improved reverb IR.
---

## Rule
The Vocal Booth must keep monitoring and capture separate: route the raw microphone stream directly to MediaRecorder for a clean dry stem, while LiveVocalMonitor owns the parallel dry/wet speaker buses in its own AudioContext.

**Why:** Clean vocal stems are needed for later mix/master processing; baking monitor reverb or echo into the take makes those effects irreversible and can contaminate downstream mixes.

## How to apply
- Shared module: `artifacts/gravelkingpro/src/lib/daw/vocalPresets.ts`
  - `VOCAL_PRESETS` — preset definitions (id, EQ/comp params, reverb/echo params)
  - `buildEffectChain(ctx, source, preset, destination): AnalyserNode` — builds chain and returns analyser for metering
- Recorder: `useVocalBoothRecorder.start(deviceId?)` — records the original mic MediaStream and uses a separate analyser only for metering.
- Monitor: `LiveVocalMonitor({ onPresetChange })` — splits source into `dryGain → destination` and `sendGain → buildEffectChain → wetGain → destination`.
- Both paths use `{ latencyHint: "interactive", sampleRate: 44100 }` and browser input DSP disabled.

## Reverb IR quality
The original white-noise IR sounded harsh (metallic high-frequency content). The improved IR:
```ts
const n = (Math.random() + Math.random() + Math.random()) / 3 * 2 - 1; // averaged = natural LPF
d[i] = n * Math.pow(1 - pos / len, 2.2);
```
Plus an 18ms pre-delay (`preDelaySamples = sampleRate * 0.018`) before the reverb tail.
