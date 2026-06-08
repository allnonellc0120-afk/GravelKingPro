---
name: DAW specialParams pattern
description: PluginNodeResult uses specialParams for live updates that can't go through AudioParam.setTargetAtTime
---

**Rule:** PluginNodeResult has two update maps: `audioParams: Map<string, AudioParam>` for standard Web Audio params, and `specialParams: Map<string, (v: number) => void>` for operations that require direct node property mutation.

**Why:** Reverb size/damp require regenerating the ConvolverNode's buffer (conv.buffer = makeIR(...)); distortion drive requires regenerating the WaveShaper curve (ws.curve = makeDistortionCurve(...)). Neither has an AudioParam.

**How to apply:** In updatePlugin and updateMasterPlugin, always check audioParams first, then fall through to specialParams. Both maps are populated in createPluginNode().
