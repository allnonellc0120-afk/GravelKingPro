/**
 * GRAVELKING IP EMBED SYSTEM
 * MLK v3 DSP Kernel (TypeScript)
 * 
 * Purpose: 3-band amplitude transform to prepare audio for LSB watermark embedding.
 * Makes the LSB payload statistically indistinguishable from natural dither.
 * 
 * Decoupled from crypto layer — kernel only shapes the signal.
 * 
 * @version 3.5.0
 * @author GravelKing Productions / All One LLC
 */

export interface MLKConfig {
  sampleRate: number;
  lowBandGain?: number;
  midBandGain?: number;
  highBandGain?: number;
  drive?: number;
}

export class MLKv3Kernel {
  private sampleRate: number;
  private lowBandGain: number;
  private midBandGain: number;
  private highBandGain: number;
  private drive: number;

  constructor(config: MLKConfig) {
    this.sampleRate = config.sampleRate;
    this.lowBandGain = config.lowBandGain ?? 1.0;
    this.midBandGain = config.midBandGain ?? 1.0;
    this.highBandGain = config.highBandGain ?? 1.0;
    this.drive = config.drive ?? 0.15;
  }

  /**
   * 3-Band Amplitude Transform
   * Prepares signal for LSB embedding by shaping amplitude across bands.
   */
  public process(input: Float32Array): Float32Array {
    const output = new Float32Array(input.length);

    // Simple 3-band split using basic filters (can be upgraded to Linkwitz-Riley later)
    const low = this.lowPass(input, 250);
    const mid = this.bandPass(input, 250, 4000);
    const high = this.highPass(input, 4000);

    for (let i = 0; i < input.length; i++) {
      let sample = 
        low[i] * this.lowBandGain +
        mid[i] * this.midBandGain +
        high[i] * this.highBandGain;

      // Soft saturation to mask LSB changes
      if (this.drive > 0.01) {
        sample = Math.tanh(sample * (1 + this.drive * 4)) / (1 + this.drive * 0.4);
      }

      output[i] = Math.max(-1, Math.min(1, sample));
    }

    return output;
  }

  // ==================== FILTER HELPERS ====================

  private lowPass(input: Float32Array, cutoff: number): Float32Array {
    const output = new Float32Array(input.length);
    const rc = 1.0 / (cutoff * 2 * Math.PI);
    const dt = 1.0 / this.sampleRate;
    const alpha = dt / (rc + dt);

    output[0] = input[0];
    for (let i = 1; i < input.length; i++) {
      output[i] = output[i - 1] + alpha * (input[i] - output[i - 1]);
    }
    return output;
  }

  private highPass(input: Float32Array, cutoff: number): Float32Array {
    const output = new Float32Array(input.length);
    const rc = 1.0 / (cutoff * 2 * Math.PI);
    const dt = 1.0 / this.sampleRate;
    const alpha = rc / (rc + dt);

    output[0] = input[0];
    for (let i = 1; i < input.length; i++) {
      output[i] = alpha * (output[i - 1] + input[i] - input[i - 1]);
    }
    return output;
  }

  private bandPass(input: Float32Array, lowCutoff: number, highCutoff: number): Float32Array {
    const low = this.lowPass(input, highCutoff);
    return this.highPass(low, lowCutoff);
  }

  /**
   * Get current configuration (for logging / verification)
   */
  public getConfig(): MLKConfig {
    return {
      sampleRate: this.sampleRate,
      lowBandGain: this.lowBandGain,
      midBandGain: this.midBandGain,
      highBandGain: this.highBandGain,
      drive: this.drive,
    };
  }
}

// ==================== USAGE EXAMPLE ====================
/*
// Example usage in Node.js or browser with Web Audio API buffer
const kernel = new MLKv3Kernel({
  sampleRate: 44100,
  lowBandGain: 0.95,
  midBandGain: 1.05,
  highBandGain: 1.1,
  drive: 0.12
});

const processed = kernel.process(audioFloat32Array);
// Then pass 'processed' to LSB embed layer
*/
