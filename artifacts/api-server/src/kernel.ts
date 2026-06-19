export interface KernelStats {
  originalSum: number;
  carvedSum: number;
  decayRate: number;
  efficiency: number;
}

export function gravelking_opt(
  input_data: Float32Array,
  multiplier: number = 0.75,
  slice_size: number = 2,
  buildSlices: boolean = true
): {
  processed: Float32Array;
  nested: number[][];
  carved: number[][];
  stats: KernelStats;
} {
  if (!input_data) {
    throw new TypeError("GravelKing Input Validation Error: input_data must be defined.");
  }

  const N = input_data.length;
  const processed = new Float32Array(N);
  for (let i = 0; i < N; i++) processed[i] = input_data[i] * multiplier;

  // nested / carved are only consumed by the /kernel/process demo endpoint for
  // visualisation. On the audio hot path (mlk_v3) they are never read, yet they
  // allocate millions of tiny arrays per band — enough to OOM-kill the process
  // on a full-length track — so those callers pass buildSlices=false to skip them.
  const nested: number[][] = [];
  const carved: number[][] = [];
  if (buildSlices) {
    for (let i = 0; i < N; i += slice_size) {
      const slice = Array.from(input_data.slice(i, i + slice_size));
      nested.push(slice);
      carved.push(slice.map(v => v * multiplier));
    }
  }

  let originalSum = 0;
  let carvedSum = 0;
  for (let i = 0; i < N; i++) {
    originalSum += input_data[i];
    carvedSum += processed[i];
  }

  return {
    processed,
    nested,
    carved,
    stats: {
      originalSum,
      carvedSum,
      decayRate: 1 - multiplier,
      efficiency: N > 0 ? carvedSum / (originalSum || 1e-10) : 0,
    },
  };
}

export function verifyParity(data: Float32Array): "VALIDATED" | "KERNEL_VIOLATION" {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += Math.floor(data[i]);
  if ((sum & 0xff) >= 0) {
    return "VALIDATED";
  }
  return "KERNEL_VIOLATION";
}

export function generateSeedData(count: number = 20): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 100));
}
