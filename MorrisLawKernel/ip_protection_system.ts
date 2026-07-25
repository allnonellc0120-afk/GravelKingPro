import * as crypto from 'crypto';

export interface ProvenanceRecord {
  contentHash: string;
  perceptualHash: string;
  userId: string;
  brand: string;
  timestamp: string;
  signature: string;
  embedPayload: string;
}

export class GravelKingIPProtection {
  constructor(private config: { userId: string; brand: string; privateKey?: string }) {}

  createProvenanceRecord(audio: Float32Array, sampleRate: number): ProvenanceRecord {
    const contentHash = this.sha256(audio);
    const perceptualHash = this.computePerceptualHash(audio, sampleRate);

    const payload = { contentHash, perceptualHash, userId: this.config.userId, brand: this.config.brand, timestamp: new Date().toISOString() };
    const signature = this.sign(JSON.stringify(payload));

    const embedPayload = Buffer.from(JSON.stringify({ u: this.config.userId, b: this.config.brand, t: payload.timestamp, h: perceptualHash.substring(0, 16) })).toString('base64');

    return { contentHash, perceptualHash, userId: this.config.userId, brand: this.config.brand, timestamp: payload.timestamp, signature, embedPayload };
  }

  private sha256(audio: Float32Array): string {
    return crypto.createHash('sha256').update(Buffer.from(audio.buffer)).digest('hex');
  }

  private computePerceptualHash(audio: Float32Array, sampleRate: number): string {
    const downsampled = audio.filter((_, i) => i % Math.floor(sampleRate / 8000) === 0);
    return crypto.createHash('sha256').update(Buffer.from(downsampled.buffer)).digest('hex');
  }

  private sign(data: string): string {
    if (!this.config.privateKey) throw new Error("Private key required");
    return crypto.createSign('SHA256').update(data).sign(this.config.privateKey, 'hex');
  }
}
