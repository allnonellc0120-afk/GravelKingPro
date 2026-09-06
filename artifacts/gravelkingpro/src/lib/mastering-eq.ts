export const MASTERING_EQ_BANDS = [
  { frequency: 31, label: "31" },
  { frequency: 63, label: "63" },
  { frequency: 125, label: "125" },
  { frequency: 250, label: "250" },
  { frequency: 500, label: "500" },
  { frequency: 1000, label: "1k" },
  { frequency: 2000, label: "2k" },
  { frequency: 4000, label: "4k" },
  { frequency: 8000, label: "8k" },
  { frequency: 16000, label: "16k" },
] as const;

export const FLAT_MASTERING_EQ = MASTERING_EQ_BANDS.map(() => 0);

export interface EqChain {
  filters: BiquadFilterNode[];
  outputGain: GainNode;
}

export function createMasteringEqChain(
  context: BaseAudioContext,
  source: AudioNode,
  bandGains: readonly number[],
  postEqGain: number,
): EqChain {
  const filters = MASTERING_EQ_BANDS.map(({ frequency }, index) => {
    const filter = context.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = frequency;
    // A Q of 1.4 gives the ISO bands useful musical overlap without making
    // adjacent sliders sound like isolated notch filters.
    filter.Q.value = 1.4;
    filter.gain.value = bandGains[index] ?? 0;
    return filter;
  });

  let previous: AudioNode = source;
  for (const filter of filters) {
    previous.connect(filter);
    previous = filter;
  }

  const outputGain = context.createGain();
  outputGain.gain.value = dbToLinear(postEqGain);
  previous.connect(outputGain);

  return { filters, outputGain };
}

export function updateMasteringEqChain(
  chain: EqChain,
  bandGains: readonly number[],
  postEqGain: number,
  now = 0,
): void {
  chain.filters.forEach((filter, index) => {
    const gain = bandGains[index] ?? 0;
    filter.gain.setTargetAtTime(gain, now, 0.01);
  });
  chain.outputGain.gain.setTargetAtTime(dbToLinear(postEqGain), now, 0.01);
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export async function decodeAudioUrl(
  context: BaseAudioContext,
  url: string,
): Promise<AudioBuffer> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Could not load mastered audio (HTTP ${response.status}).`);
  }
  const bytes = await response.arrayBuffer();
  return context.decodeAudioData(bytes.slice(0));
}

/**
 * Render the browser EQ into a standalone WAV. This deliberately uses an
 * OfflineAudioContext so the downloaded file matches what the After preview
 * plays, rather than merely saving the un-EQ'd server result.
 */
export async function renderMasteringEqWav(
  url: string,
  bandGains: readonly number[],
  postEqGain: number,
): Promise<Blob> {
  const decodeContext = new AudioContext();
  try {
    const decoded = await decodeAudioUrl(decodeContext, url);
    const offline = new OfflineAudioContext(
      decoded.numberOfChannels,
      decoded.length,
      decoded.sampleRate,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    const chain = createMasteringEqChain(offline, source, bandGains, postEqGain);
    chain.outputGain.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    return audioBufferToWav(rendered);
  } finally {
    await decodeContext.close().catch(() => {});
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channelCount = buffer.numberOfChannels;
  const frameCount = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const view = new DataView(new ArrayBuffer(44 + dataSize));

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channelCount, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: channelCount }, (_, index) =>
    buffer.getChannelData(index),
  );
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}