/**
 * Browser-side audio compressor — decodes any audio file, resamples to a lower
 * sample rate (mono), and exports a WAV blob.  This lets large tracks sail
 * through the ~30 MB production proxy limit while keeping the file
 * recognizable enough for the server to master / split / convert it.
 */

interface CompressOptions {
  /** Target sample rate in Hz. Default: 22050 (quarter size of 44.1k stereo). */
  targetRate?: number;
  /** Target mono (true) or keep stereo (false). Default: true. */
  mono?: boolean;
  /** Optional progress callback: 0–100. */
  onProgress?: (pct: number) => void;
}

/**
 * Encode an AudioBuffer as a 16-bit PCM WAV file and return a Blob.
 */
function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;

  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  let offset = 0;

  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset++, s.charCodeAt(i));
    }
  };

  writeString("RIFF");
  view.setUint32(offset, fileSize, true); offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2; // PCM
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, byteRate, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true); offset += 4;

  // Write interleaved PCM data
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channels[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Compress an audio File to a smaller WAV suitable for upload.
 * Returns a File with the same base name + "_compressed.wav".
 */
export async function compressAudioFile(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  const { targetRate = 22050, mono = true, onProgress } = options;

  onProgress?.(5);

  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(15);

  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
  onProgress?.(35);

  const duration = decoded.duration;
  const channels = mono ? 1 : decoded.numberOfChannels;

  // Resample via OfflineAudioContext (browser-native, reliable)
  const offlineCtx = new OfflineAudioContext(channels, Math.ceil(duration * targetRate), targetRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start();
  onProgress?.(50);

  const rendered = await offlineCtx.startRendering();
  onProgress?.(85);

  const wavBlob = encodeWav(rendered);
  onProgress?.(95);

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const compressedFile = new File([wavBlob], `${baseName}_compressed.wav`, { type: "audio/wav" });
  onProgress?.(100);

  // Clean up
  await ctx.close().catch(() => {});

  return compressedFile;
}

/**
 * Quick check: should we compress this file before uploading?
 * Returns true if the file is likely to hit the production proxy limit.
 */
export function shouldCompress(file: File, limitBytes = 30 * 1024 * 1024): boolean {
  return file.size > limitBytes;
}
