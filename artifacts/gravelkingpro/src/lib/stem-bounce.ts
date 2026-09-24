export interface StemMixSettings {
  id: string;
  name: string;
  level: number;
  pan: number;
  lowGain: number;
  midGain: number;
  highGain: number;
  solo: boolean;
  muted: boolean;
}

export interface StemGraph {
  source: AudioBufferSourceNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  panner: StereoPannerNode;
  gain: GainNode;
  nodes: AudioNode[];
}

export const MAX_STEMS = 3;

export function isStemAudible(stems: readonly StemMixSettings[], stem: StemMixSettings): boolean {
  const hasSolo = stems.some((candidate) => candidate.solo);
  return !stem.muted && (!hasSolo || stem.solo);
}

export function buildStemGraph(
  context: BaseAudioContext,
  buffer: AudioBuffer,
  stem: StemMixSettings,
  destination: AudioNode,
  audible = true,
): StemGraph {
  const source = context.createBufferSource();
  source.buffer = buffer;

  const low = context.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 100;
  low.gain.value = stem.lowGain;

  const mid = context.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 2500;
  mid.Q.value = 1.1;
  mid.gain.value = stem.midGain;

  const high = context.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 8000;
  high.gain.value = stem.highGain;

  const panner = context.createStereoPanner();
  panner.pan.value = stem.pan;

  const gain = context.createGain();
  gain.gain.value = audible ? stem.level : 0;

  source.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(panner);
  panner.connect(gain);
  gain.connect(destination);

  return {
    source,
    low,
    mid,
    high,
    panner,
    gain,
    nodes: [source, low, mid, high, panner, gain],
  };
}

export function disconnectStemGraph(graph: StemGraph, stopSource = true): void {
  if (stopSource) {
    try { graph.source.stop(); } catch { /* already stopped */ }
  }
  for (const node of graph.nodes) {
    try { node.disconnect(); } catch { /* already disconnected */ }
  }
  graph.source.buffer = null;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}

/** Encode an AudioBuffer as a standard little-endian 24-bit PCM WAV. */
export function audioBufferToWav24(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const sampleRate = 48_000;
  const frames = buffer.length;
  const bytesPerSample = 3;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 24, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sourceChannel = Math.min(channel, buffer.numberOfChannels - 1);
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(sourceChannel)[frame] ?? 0));
      const value = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
      view.setUint8(offset, value & 0xff);
      view.setUint8(offset + 1, (value >> 8) & 0xff);
      view.setUint8(offset + 2, (value >> 16) & 0xff);
      offset += bytesPerSample;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export async function renderStemBounce(
  buffer: AudioBuffer,
  stems: readonly StemMixSettings[],
): Promise<Blob> {
  if (!stems.length) throw new Error("Add at least one active stem before exporting.");
  const sampleRate = 48_000;
  const context = new OfflineAudioContext(2, Math.ceil(buffer.duration * sampleRate), sampleRate);
  const graphs: StemGraph[] = [];
  try {
    for (const stem of stems.slice(0, MAX_STEMS)) {
      const graph = buildStemGraph(
        context,
        buffer,
        stem,
        context.destination,
        isStemAudible(stems, stem),
      );
      graphs.push(graph);
      graph.source.start(0);
    }
    const rendered = await context.startRendering();
    return audioBufferToWav24(rendered);
  } finally {
    for (const graph of graphs) disconnectStemGraph(graph);
  }
}