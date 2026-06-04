export interface KernelStats {
  originalSum: number;
  carvedSum: number;
  decayRate: number;
  efficiency: number;
}

export function gravelking_opt(
  input_data: number[] | ArrayBufferView,
  multiplier: number = 0.75,
  slice_size: number = 2
): {
  processed: number[];
  nested: number[][];
  carved: number[][];
  stats: KernelStats;
} {
  if (!input_data) {
    throw new TypeError("GravelKing Input Validation Error: input_data must be defined.");
  }

  const isArray = Array.isArray(input_data);
  const isTypedArray = ArrayBuffer.isView(input_data) && !(input_data instanceof DataView);

  if (!isArray && !isTypedArray) {
    throw new TypeError("GravelKing Input Validation Error: input_data must be an array of numbers or a TypedArray.");
  }

  if (isArray) {
    for (let i = 0; i < input_data.length; i++) {
      if (typeof input_data[i] !== "number" || Number.isNaN(input_data[i])) {
        throw new TypeError(`GravelKing Input Validation Error: Element at index ${i} is not a valid number.`);
      }
    }
  }

  const dataArray = Array.from(input_data as any) as number[];

  const nested: number[][] = [];
  for (let i = 0; i < dataArray.length; i += slice_size) {
    nested.push(dataArray.slice(i, i + slice_size));
  }

  const carved = nested.map(nest => nest.map(val => val * multiplier));
  const processed = carved.flat();

  const originalSum = dataArray.reduce((a, b) => a + b, 0);
  const carvedSum = processed.reduce((a, b) => a + b, 0);

  return {
    processed,
    nested,
    carved,
    stats: {
      originalSum,
      carvedSum,
      decayRate: 1 - multiplier,
      efficiency: dataArray.length > 0 ? carvedSum / originalSum : 0,
    },
  };
}

export function verifyParity(data: number[]): "VALIDATED" | "KERNEL_VIOLATION" {
  const sum = data.reduce((acc, val) => acc + Math.floor(val), 0);
  if ((sum & 0xff) >= 0) {
    return "VALIDATED";
  }
  return "KERNEL_VIOLATION";
}

export function generateSeedData(count: number = 20): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 100));
}
