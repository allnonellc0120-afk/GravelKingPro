---
name: Vocal effects recording pattern
description: How to bake vocal monitor effects into a recording take via MediaStreamAudioDestinationNode; shared preset module; improved reverb IR.
---

## Rule
To bake monitoring effects into a recording, route `mic source → buildEffectChain(ctx, src, preset, destNode) → MediaRecorder(destNode.stream)`. Never connect the chain to `ctx.destination` in the recording context (that causes feedback); let LiveVocalMonitor own speaker output via its own AudioContext.

**Why:** MediaRecorder only captures what flows into the MediaStream it wraps. The raw mic stream has no effects. A `MediaStreamAudioDestinationNode` creates a capturable stream from any AudioContext chain output.

## How to apply
- Shared module: `artifacts/gravelkingpro/src/lib/daw/vocalPresets.ts`
  - `VOCAL_PRESETS` — preset definitions (id, EQ/comp params, reverb/echo params)
  - `buildEffectChain(ctx, source, preset, destination): AnalyserNode` — builds chain and returns analyser for metering
- Recorder: `useVocalBoothRecorder.start(deviceId?, preset?)` — if `preset && preset.id !== "raw"`, creates `destNode = ctx.createMediaStreamDestination()`, calls `buildEffectChain(ctx, src, preset, destNode)`, records from `destNode.stream`
- Monitor: `LiveVocalMonitor({ onPresetChange })` — calls `buildEffectChain(ctx, src, p, ctx.destination)` for speaker output; reports active preset to parent via `onPresetChange`
- Parent (`VocalBoothInner`): lifts `monitorPreset` state, wires to `recorder.start(undefined, monitorPreset ?? undefined)`

## Reverb IR quality
The original white-noise IR sounded harsh (metallic high-frequency content). The improved IR:
```ts
const n = (Math.random() + Math.random() + Math.random()) / 3 * 2 - 1; // averaged = natural LPF
d[i] = n * Math.pow(1 - pos / len, 2.2);
```
Plus an 18ms pre-delay (`preDelaySamples = sampleRate * 0.018`) before the reverb tail.
