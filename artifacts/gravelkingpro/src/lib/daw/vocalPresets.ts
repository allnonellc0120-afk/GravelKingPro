/**
 * Shared vocal preset definitions and effect chain builder.
 * Used by both the LiveVocalMonitor (speaker output) and useVocalBoothRecorder
 * (recording — routes through MediaStreamAudioDestinationNode, not speakers).
 */

export type VocalPresetId = "raw" | "warm" | "broadcast" | "space" | "echo" | "studio";

export interface VocalPreset {
  id: VocalPresetId;
  label: string;
  emoji: string;
  description: string;
  accent: string;
  glow: string;
  bg: string;
  lowGain: number;
  midGain: number;
  highGain: number;
  compThreshold: number;
  compRatio: number;
  reverbMix: number;
  echoDelay: number;
  echoMix: number;
}

export const VOCAL_PRESETS: VocalPreset[] = [
  {
    id: "raw", label: "Raw", emoji: "🎤",
    description: "Clean pass-through — no processing",
    accent: "#94a3b8", glow: "rgba(148,163,184,0.2)", bg: "linear-gradient(135deg,#1e293b,#0f172a)",
    lowGain: 0, midGain: 0, highGain: 0,
    compThreshold: -3, compRatio: 1.05,
    reverbMix: 0, echoDelay: 0, echoMix: 0,
  },
  {
    id: "warm", label: "Warm", emoji: "🔥",
    description: "Gentle compression + low-end warmth",
    accent: "#f59e0b", glow: "rgba(245,158,11,0.2)", bg: "linear-gradient(135deg,#451a03,#1c0a00)",
    lowGain: 4, midGain: 0, highGain: -1,
    compThreshold: -20, compRatio: 3,
    reverbMix: 0.05, echoDelay: 0, echoMix: 0,
  },
  {
    id: "broadcast", label: "Broadcast", emoji: "📡",
    description: "Tight compression + presence boost",
    accent: "#3b82f6", glow: "rgba(59,130,246,0.2)", bg: "linear-gradient(135deg,#1e3a5f,#0c1a2e)",
    lowGain: -2, midGain: 2, highGain: 1,
    compThreshold: -15, compRatio: 6,
    reverbMix: 0.03, echoDelay: 0, echoMix: 0,
  },
  {
    id: "space", label: "Space", emoji: "🌌",
    description: "Airy reverb + air EQ boost",
    accent: "#8b5cf6", glow: "rgba(139,92,246,0.2)", bg: "linear-gradient(135deg,#2e1065,#13043a)",
    lowGain: 0, midGain: 0, highGain: 3,
    compThreshold: -18, compRatio: 3,
    reverbMix: 0.45, echoDelay: 0, echoMix: 0,
  },
  {
    id: "echo", label: "Echo", emoji: "🔁",
    description: "Slapback delay + lush reverb",
    accent: "#06b6d4", glow: "rgba(6,182,212,0.2)", bg: "linear-gradient(135deg,#083344,#021726)",
    lowGain: 0, midGain: 1, highGain: 1,
    compThreshold: -18, compRatio: 3,
    reverbMix: 0.3, echoDelay: 0.22, echoMix: 0.35,
  },
  {
    id: "studio", label: "Studio", emoji: "🎚️",
    description: "Full chain: EQ + comp + presence reverb",
    accent: "#22c55e", glow: "rgba(34,197,94,0.2)", bg: "linear-gradient(135deg,#052e16,#021a0d)",
    lowGain: 2, midGain: -1, highGain: 4,
    compThreshold: -12, compRatio: 8,
    reverbMix: 0.12, echoDelay: 0, echoMix: 0,
  },
];

/**
 * Build the vocal effect chain and connect it to `destination`.
 * Returns the AnalyserNode so the caller can drive a level meter.
 *
 * Chain: source → EQ → compressor → limiter → [reverb | echo | dry] → analyser → outGain → destination
 *
 * The caller decides where `destination` points:
 *   - `ctx.destination`                  → speaker monitoring
 *   - `ctx.createMediaStreamDestination()` → recording without speaker output
 */
export function buildEffectChain(
  ctx: AudioContext,
  source: AudioNode,
  preset: VocalPreset,
  destination: AudioNode,
): AnalyserNode {
  // 3-band EQ
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 200;
  low.gain.value = preset.lowGain;

  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 2000;
  mid.Q.value = 1.4;
  mid.gain.value = preset.midGain;

  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 8000;
  high.gain.value = preset.highGain;

  // Compressor
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = preset.compThreshold;
  comp.ratio.value = preset.compRatio;
  comp.knee.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;

  // Brick-wall limiter
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1;
  limiter.ratio.value = 20;
  limiter.knee.value = 0;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  // Analyser for metering (read by the level meter RAF loop)
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;

  // Output gain
  const outGain = ctx.createGain();
  outGain.gain.value = 0.85;

  // Wire source → EQ → comp
  source.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(comp);

  // Parallel wet/dry for echo or reverb; straight through otherwise.
  if (preset.echoDelay > 0 && preset.echoMix > 0) {
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = preset.echoDelay;
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - preset.echoMix;
    const wetGain = ctx.createGain();
    wetGain.gain.value = preset.echoMix;
    comp.connect(dryGain);
    comp.connect(delay);
    delay.connect(wetGain);
    dryGain.connect(limiter);
    wetGain.connect(limiter);
  } else if (preset.reverbMix > 0) {
    // Improved convolution IR: averaged white noise with a 18 ms pre-delay.
    // Averaging 3 white-noise samples naturally rolls off high-frequency content,
    // producing a warmer, less metallic tail compared to pure white-noise.
    const irLength = Math.floor(ctx.sampleRate * 2.5);
    const irBuffer = ctx.createBuffer(2, irLength, ctx.sampleRate);
    const preDelaySamples = Math.floor(ctx.sampleRate * 0.018);
    for (let ch = 0; ch < 2; ch++) {
      const d = irBuffer.getChannelData(ch);
      for (let i = 0; i < irLength; i++) {
        if (i < preDelaySamples) { d[i] = 0; continue; }
        const pos = i - preDelaySamples;
        const len = irLength - preDelaySamples;
        const n = (Math.random() + Math.random() + Math.random()) / 3 * 2 - 1;
        d[i] = n * Math.pow(1 - pos / len, 2.2);
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = irBuffer;
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - preset.reverbMix;
    const wetGain = ctx.createGain();
    wetGain.gain.value = preset.reverbMix;
    comp.connect(dryGain);
    comp.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(limiter);
    wetGain.connect(limiter);
  } else {
    comp.connect(limiter);
  }

  limiter.connect(analyser);
  analyser.connect(outGain);
  outGain.connect(destination);

  return analyser;
}
