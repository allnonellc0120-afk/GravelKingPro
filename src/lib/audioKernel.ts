export interface KernelStats {
  originalSum: number;
  carvedSum: number;
  decayRate: number;
  efficiency: number;
  sampleCount: number;
  channelCount: number;
}

export function gravelking_opt_audio(
  samples: Float32Array,
  multiplier: number = 0.75,
  slice_size: number = 2
): { processed: Float32Array; stats: KernelStats } {
  const dataArray = Array.from(samples);
  const nested: number[][] = [];
  for (let i = 0; i < dataArray.length; i += slice_size) {
    nested.push(dataArray.slice(i, i + slice_size));
  }
  const carved = nested.map(nest => nest.map(val => val * multiplier));
  const processedArr = carved.flat();
  const processed = new Float32Array(processedArr);
  const originalSum = dataArray.reduce((a, b) => a + Math.abs(b), 0);
  const carvedSum = processedArr.reduce((a, b) => a + Math.abs(b), 0);
  return {
    processed,
    stats: {
      originalSum,
      carvedSum,
      decayRate: 1 - multiplier,
      efficiency: originalSum > 0 ? carvedSum / originalSum : 0,
      sampleCount: samples.length,
      channelCount: 1,
    },
  };
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const bufferSize = 44 + dataSize;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export function getWaveformPoints(samples: Float32Array, points: number = 200): number[] {
  const blockSize = Math.floor(samples.length / points);
  const result: number[] = [];
  for (let i = 0; i < points; i++) {
    let max = 0;
    for (let j = 0; j < blockSize; j++) {
      const val = Math.abs(samples[i * blockSize + j] || 0);
      if (val > max) max = val;
    }
    result.push(max);
  }
  return result;
}
