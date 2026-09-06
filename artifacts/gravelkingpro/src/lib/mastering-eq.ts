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
const MASTERING_EQ_Q = 1.4;

export type MasteringDownloadPath = "server" | "eq-render";

export type MasteringEqExportStage = "loading" | "decoding" | "rendering" | "encoding";

export interface MasteringEqProgress {
  stage: MasteringEqExportStage;
  progress: number;
  detail: string;
}

export class MasteringEqResourceError extends Error {
  readonly code = "INSUFFICIENT_RESOURCES";

  constructor(message = "This device does not have enough resources to render the full-length fine-tuned WAV.") {
    super(message);
    this.name = "MasteringEqResourceError";
  }
}

export function isMasteringEqResourceError(error: unknown): error is MasteringEqResourceError {
  return error instanceof MasteringEqResourceError;
}

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
    filter.Q.value = MASTERING_EQ_Q;
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

export function isMasteringEqActive(
  bandGains: readonly number[],
  postEqGain: number,
): boolean {
  return bandGains.some((gain) => gain !== 0) || postEqGain !== 0;
}

export function getMasteringDownloadPath(
  bandGains: readonly number[],
  postEqGain: number,
): MasteringDownloadPath {
  return isMasteringEqActive(bandGains, postEqGain) ? "eq-render" : "server";
}

export async function decodeAudioUrl(
  context: BaseAudioContext,
  url: string,
  onProgress?: (update: MasteringEqProgress) => void,
): Promise<AudioBuffer> {
  onProgress?.({
    stage: "loading",
    progress: 6,
    detail: "Loading the full mastered track…",
  });
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Could not load mastered audio (HTTP ${response.status}).`);
  }
  const bytes = await response.arrayBuffer();
  onProgress?.({
    stage: "decoding",
    progress: 18,
    detail: "Decoding the full-length audio…",
  });
  try {
    const decoded = await context.decodeAudioData(bytes.slice(0));
    onProgress?.({
      stage: "decoding",
      progress: 38,
      detail: "Audio decoded — preparing the EQ render…",
    });
    return decoded;
  } catch (error) {
    if (isLikelyResourceError(error)) throw new MasteringEqResourceError();
    throw error;
  }
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
  onProgress?: (update: MasteringEqProgress) => void,
): Promise<Blob> {
  const decodeContext = new AudioContext();
  try {
    try {
      const decoded = await decodeAudioUrl(decodeContext, url, onProgress);
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
      onProgress?.({
        stage: "rendering",
        progress: 44,
        detail: "Rendering the fine-tuned audio…",
      });

      let renderProgress = 44;
      const renderProgressId = setInterval(() => {
        renderProgress = Math.min(88, renderProgress + 2);
        onProgress?.({
          stage: "rendering",
          progress: renderProgress,
          detail: "Rendering the fine-tuned audio…",
        });
      }, 750);
      let rendered: AudioBuffer;
      try {
        rendered = await offline.startRendering();
      } finally {
        clearInterval(renderProgressId);
      }

      onProgress?.({
        stage: "encoding",
        progress: 90,
        detail: "Encoding a downloadable WAV…",
      });
      return await audioBufferToWav(rendered, onProgress);
    } catch (error) {
      if (error instanceof MasteringEqResourceError || isLikelyResourceError(error)) {
        throw new MasteringEqResourceError();
      }
      throw error;
    }
  } finally {
    await decodeContext.close().catch(() => {});
  }
}

async function audioBufferToWav(
  buffer: AudioBuffer,
  onProgress?: (update: MasteringEqProgress) => void,
): Promise<Blob> {
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
    // Encoding used to run as one large synchronous loop. Yielding between
    // chunks lets mobile browsers keep painting the progress UI and respond
    // to system interruptions while long tracks are being saved.
    if (frame > 0 && frame % 16_384 === 0) {
      onProgress?.({
        stage: "encoding",
        progress: 90 + Math.round((frame / frameCount) * 9),
        detail: "Encoding a downloadable WAV…",
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  onProgress?.({
    stage: "encoding",
    progress: 99,
    detail: "Finishing the WAV file…",
  });
  return new Blob([view], { type: "audio/wav" });
}

function isLikelyResourceError(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return /memory|allocation|array buffer|quota|resource/i.test(`${name} ${message}`);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}