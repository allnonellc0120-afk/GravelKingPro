export class RobustWatermarkEmbedder {
  constructor(private sampleRate: number, private strength = 0.003) {}

  embed(audio: Float32Array, payload: string): Float32Array {
    const output = new Float32Array(audio);
    const bits = this.stringToBits(payload);
    const period = Math.floor(this.sampleRate * 0.25);

    for (let i = 0; i < bits.length; i++) {
      const bit = bits[i];
      const start = (i * period) % (output.length - period);
      for (let j = 0; j < period; j++) {
        const idx = start + j;
        if (idx >= output.length) break;
        const delay = Math.floor(this.sampleRate * 0.012);
        if (idx > delay) output[idx] += output[idx - delay] * this.strength * (bit ? 1 : -1);
        output[idx] += (Math.random() - 0.5) * this.strength * 0.5 * (bit ? 1 : -1);
      }
    }
    return output.map(v => Math.max(-1, Math.min(1, v)));
  }

  private stringToBits(str: string): number[] {
    const bits: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      for (let j = 7; j >= 0; j--) bits.push((code >> j) & 1);
    }
    return bits;
  }
}
