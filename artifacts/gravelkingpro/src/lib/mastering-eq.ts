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

export class MasteringEqExportCancelledError extends Error {
  readonly code = "EXPORT_CANCELLED";

  constructor() {
    super("Fine-tuned export cancelled.");
    this.name = "MasteringEqExportCancelledError";
  }
}

export function isMasteringEqExportCancelled(error: unknown): boolean {
  if (error instanceof MasteringEqExportCancelledError) return true;
  if (!error || typeof error !== "object") return false;
  return (error as { name?: unknown }).name === "AbortError";
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
  signal?: AbortSignal,
): Promise<AudioBuffer> {
  throwIfAborted(signal);
  onProgress?.({
    stage: "loading",
    progress: 6,
    detail: "Loading the full mastered track…",
  });
  let response: Response;
  try {
    response = await fetch(url, { credentials: "include", signal });
  } catch (error) {
    if (signal?.aborted) throw new MasteringEqExportCancelledError();
    throw error;
  }
  if (!response.ok) {
    throw new Error(`Could not load mastered audio (HTTP ${response.status}).`);
  }
  const bytes = await awaitWithAbort(response.arrayBuffer(), signal);
  throwIfAborted(signal);
  onProgress?.({
    stage: "decoding",
    progress: 18,
    detail: "Decoding the full-length audio…",
  });
  try {
    const decoded = await awaitWithAbort(
      context.decodeAudioData(bytes.slice(0)),
      signal,
    );
    throwIfAborted(signal);
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
  options?: { signal?: AbortSignal },
): Promise<Blob> {
  const signal = options?.signal;
  throwIfAborted(signal);
  let decodeContext: AudioContext | null = null;
  let decodeClosePromise: Promise<void> | null = null;
  let source: AudioBufferSourceNode | null = null;
  let chain: EqChain | null = null;
  let decodedBuffer: AudioBuffer | null = null;
  let renderProgressId: ReturnType<typeof setInterval> | null = null;

  const closeDecodeContext = (): Promise<void> | null => {
    if (!decodeContext || decodeClosePromise) return decodeClosePromise;
    decodeClosePromise = decodeContext.close().catch(() => {});
    return decodeClosePromise;
  };

  // OfflineAudioContext has no close()/abort() API. Explicitly detach every
  // node and buffer we own so an aborted full-length render does not keep its
  // decoded audio alive until the browser eventually collects the context.
  const releaseResources = (): void => {
    if (renderProgressId !== null) {
      clearInterval(renderProgressId);
      renderProgressId = null;
    }
    if (source) {
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
      source.buffer = null;
    }
    if (chain) {
      for (const filter of chain.filters) {
        try { filter.disconnect(); } catch { /* already disconnected */ }
      }
      try { chain.outputGain.disconnect(); } catch { /* already disconnected */ }
    }
    source = null;
    chain = null;
    decodedBuffer = null;
    // close() is asynchronous, but calling it from the abort listener starts
    // releasing the decode context before the in-flight decode promise settles.
    void closeDecodeContext();
  };

  const handleAbort = () => releaseResources();
  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    decodeContext = new AudioContext();
    try {
      decodedBuffer = await decodeAudioUrl(decodeContext, url, onProgress, signal);
      throwIfAborted(signal);
      const renderContext = new OfflineAudioContext(
        decodedBuffer.numberOfChannels,
        decodedBuffer.length,
        decodedBuffer.sampleRate,
      );
      const renderSource = renderContext.createBufferSource();
      source = renderSource;
      renderSource.buffer = decodedBuffer;
      chain = createMasteringEqChain(renderContext, renderSource, bandGains, postEqGain);
      chain.outputGain.connect(renderContext.destination);
      renderSource.start(0);
      onProgress?.({
        stage: "rendering",
        progress: 44,
        detail: "Rendering the fine-tuned audio…",
      });

      let renderProgress = 44;
      renderProgressId = setInterval(() => {
        if (signal?.aborted) return;
        renderProgress = Math.min(88, renderProgress + 2);
        onProgress?.({
          stage: "rendering",
          progress: renderProgress,
          detail: "Rendering the fine-tuned audio…",
        });
      }, 750);
      let rendered: AudioBuffer;
      try {
        rendered = await awaitWithAbort(renderContext.startRendering(), signal, () => {
          releaseResources();
        });
      } finally {
        if (renderProgressId !== null) {
          clearInterval(renderProgressId);
          renderProgressId = null;
        }
      }

      throwIfAborted(signal);
      // The offline graph is no longer needed once rendering has produced its
      // buffer. Release it before the potentially long synchronous WAV encode.
      releaseResources();
      onProgress?.({
        stage: "encoding",
        progress: 90,
        detail: "Encoding a downloadable WAV…",
      });
      return await audioBufferToWav(rendered, onProgress, signal);
    } catch (error) {
      if (signal?.aborted || isMasteringEqExportCancelled(error)) {
        throw new MasteringEqExportCancelledError();
      }
      if (error instanceof MasteringEqResourceError || isLikelyResourceError(error)) {
        throw new MasteringEqResourceError();
      }
      throw error;
    }
  } finally {
    signal?.removeEventListener("abort", handleAbort);
    releaseResources();
    if (decodeClosePromise) await decodeClosePromise;
  }
}

async function audioBufferToWav(
  buffer: AudioBuffer,
  onProgress?: (update: MasteringEqProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);
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
    if (frame % 16_384 === 0) throwIfAborted(signal);
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
      await awaitWithAbort(new Promise<void>((resolve) => setTimeout(resolve, 0)), signal);
    }
  }

  throwIfAborted(signal);
  onProgress?.({
    stage: "encoding",
    progress: 99,
    detail: "Finishing the WAV file…",
  });
  return new Blob([view], { type: "audio/wav" });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new MasteringEqExportCancelledError();
}

async function awaitWithAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
  onAbort?: () => void,
): Promise<T> {
  if (signal?.aborted) {
    onAbort?.();
    throw new MasteringEqExportCancelledError();
  }
  if (!signal) return promise;

  return await new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener("abort", handleAbort);
    const handleAbort = () => {
      onAbort?.();
      cleanup();
      reject(new MasteringEqExportCancelledError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
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