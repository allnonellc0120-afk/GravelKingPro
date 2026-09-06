export type PluginType = 'eq' | 'compressor' | 'reverb' | 'delay' | 'distortion' | 'gate' | 'gain' | 'pan';

export interface PluginDef {
  id: string;
  type: PluginType;
  enabled: boolean;
  params: Record<string, number>;
}

export interface Region {
  start: number;
  end: number;
}

export interface TrackState {
  id: string;
  name: string;
  file: File;
  buffer: AudioBuffer | null;
  editedBuffer: AudioBuffer | null;
  peaks: number[];
  duration: number;
  startOffset: number;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  plugins: PluginDef[];
  region: Region | null;
  color: string;
  edited: boolean;
}

export const TRACK_COLORS = [
  '#f59e0b', '#3b82f6', '#22c55e', '#a855f7',
  '#ef4444', '#06b6d4', '#ec4899', '#f97316',
];

export const PLUGIN_LABELS: Record<PluginType, string> = {
  eq: 'Parametric EQ',
  compressor: 'Compressor',
  reverb: 'Reverb',
  delay: 'Delay',
  distortion: 'Distortion',
  gate: 'Gate',
  gain: 'Gain',
  pan: 'Pan',
};

export const PLUGIN_DEFAULTS: Record<PluginType, Record<string, number>> = {
  eq:         { b1f: 80,   b1g: 0, b2f: 400,  b2g: 0, b2q: 1.4, b3f: 3000, b3g: 0, b3q: 1.4, b4f: 12000, b4g: 0 },
  compressor: { threshold: -24, ratio: 4, attack: 3, release: 150, knee: 6, makeup: 0 },
  reverb:     { size: 50, damp: 50, wet: 30 },
  delay:      { time: 250, feedback: 40, wet: 30 },
  distortion: { drive: 30, tone: 60 },
  gate:       { threshold: -50, release: 200 },
  gain:       { gain: 0 },
  pan:        { pan: 0 },
};

export const PLUGIN_PARAM_META: Record<PluginType, Array<{key: string; label: string; min: number; max: number; step: number; unit: string}>> = {
  eq: [
    { key: 'b1f',  label: 'Low Freq',  min: 20,   max: 500,   step: 1,   unit: 'Hz' },
    { key: 'b1g',  label: 'Low Gain',  min: -18,  max: 18,    step: 0.5, unit: 'dB' },
    { key: 'b2f',  label: 'Mid Freq',  min: 200,  max: 5000,  step: 10,  unit: 'Hz' },
    { key: 'b2g',  label: 'Mid Gain',  min: -18,  max: 18,    step: 0.5, unit: 'dB' },
    { key: 'b2q',  label: 'Mid Q',     min: 0.1,  max: 10,    step: 0.1, unit: '' },
    { key: 'b3f',  label: 'Hi-Mid Freq', min: 1000, max: 16000, step: 100, unit: 'Hz' },
    { key: 'b3g',  label: 'Hi-Mid Gain', min: -18, max: 18,   step: 0.5, unit: 'dB' },
    { key: 'b3q',  label: 'Hi-Mid Q',  min: 0.1,  max: 10,    step: 0.1, unit: '' },
    { key: 'b4f',  label: 'High Freq', min: 4000, max: 20000, step: 100, unit: 'Hz' },
    { key: 'b4g',  label: 'High Gain', min: -18,  max: 18,    step: 0.5, unit: 'dB' },
  ],
  compressor: [
    { key: 'threshold', label: 'Threshold', min: -60, max: 0,    step: 0.5, unit: 'dB' },
    { key: 'ratio',     label: 'Ratio',     min: 1,   max: 20,   step: 0.1, unit: ':1' },
    { key: 'attack',    label: 'Attack',    min: 0,   max: 200,  step: 1,   unit: 'ms' },
    { key: 'release',   label: 'Release',   min: 10,  max: 2000, step: 10,  unit: 'ms' },
    { key: 'knee',      label: 'Knee',      min: 0,   max: 40,   step: 1,   unit: 'dB' },
    { key: 'makeup',    label: 'Make-up',   min: -12, max: 24,   step: 0.5, unit: 'dB' },
  ],
  reverb: [
    { key: 'size', label: 'Room',   min: 0, max: 100, step: 1, unit: '%' },
    { key: 'damp', label: 'Damp',   min: 0, max: 100, step: 1, unit: '%' },
    { key: 'wet',  label: 'Wet',    min: 0, max: 100, step: 1, unit: '%' },
  ],
  delay: [
    { key: 'time',     label: 'Time',     min: 0,  max: 2000, step: 10, unit: 'ms' },
    { key: 'feedback', label: 'Feedback', min: 0,  max: 95,   step: 1,  unit: '%' },
    { key: 'wet',      label: 'Wet',      min: 0,  max: 100,  step: 1,  unit: '%' },
  ],
  distortion: [
    { key: 'drive', label: 'Drive', min: 0, max: 100, step: 1, unit: '%' },
    { key: 'tone',  label: 'Tone',  min: 0, max: 100, step: 1, unit: '%' },
  ],
  gate: [
    { key: 'threshold', label: 'Threshold', min: -80, max: 0,    step: 1,   unit: 'dB' },
    { key: 'release',   label: 'Release',   min: 0,   max: 2000, step: 10,  unit: 'ms' },
  ],
  gain: [
    { key: 'gain', label: 'Gain', min: -24, max: 24, step: 0.5, unit: 'dB' },
  ],
  pan: [
    { key: 'pan', label: 'Pan', min: -100, max: 100, step: 1, unit: '' },
  ],
};
