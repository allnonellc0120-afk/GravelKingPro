const GKA_TARGET_QUANTUM = 128;
const GKA_MAX_QUANTUM = 256;

class GkaMonitorProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const tuning = options.processorOptions ?? {};
    this.saturation = Math.max(0, Math.min(2, Number(tuning.saturation) || 0));
    this.subharmonic = Math.max(0, Math.min(0.2, Number(tuning.subharmonic) || 0));
    this.previousDetector = 0;
    this.detectorEnvelope = 0;
    this.samplesSinceCrossing = 0;
    this.lastPeriodSamples = 0;
    this.subPhase = 0;
    this.lowPassState = [];
    this.midPassState = [];
    this.lastOverflowReport = -Infinity;
    this.port.onmessage = (event) => {
      if (event.data?.type === "tuning") {
        this.saturation = Math.max(0, Math.min(2, Number(event.data.saturation) || 0));
        this.subharmonic = Math.max(0, Math.min(0.2, Number(event.data.subharmonic) || 0));
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    const frameCount = output[0]?.length ?? input[0]?.length ?? 0;

    if (frameCount > GKA_MAX_QUANTUM) {
      if (currentFrame - this.lastOverflowReport > sampleRate / 2) {
        this.lastOverflowReport = currentFrame;
        this.port.postMessage({
          type: "quantum-overflow",
          samples: frameCount,
          targetSamples: GKA_TARGET_QUANTUM,
          maximumSamples: GKA_MAX_QUANTUM,
          message: `AudioWorklet supplied ${frameCount} samples; GKA monitor accepts at most ${GKA_MAX_QUANTUM}. Audio output was silenced.`,
        });
      }
      for (const channel of output) channel.fill(0);
      return false;
    }

    const detector = input[0];
    if (!detector || output.length === 0) return true;
    const minPeriod = Math.floor(sampleRate / 500);
    const maxPeriod = Math.ceil(sampleRate / 65);
    const subFrequency = this.lastPeriodSamples > 0 ? sampleRate / (this.lastPeriodSamples * 2) : 0;
    const targetIncrement = (2 * Math.PI * subFrequency) / sampleRate;
    const lowCoefficient = 1 - Math.exp((-2 * Math.PI * 180) / sampleRate);
    const midCoefficient = 1 - Math.exp((-2 * Math.PI * 2800) / sampleRate);

    for (let frame = 0; frame < frameCount; frame += 1) {
      const sample = detector[frame] ?? 0;
      const envelopeCoefficient = Math.abs(sample) > this.detectorEnvelope ? 0.12 : 0.006;
      this.detectorEnvelope += envelopeCoefficient * (Math.abs(sample) - this.detectorEnvelope);
      this.samplesSinceCrossing += 1;

      // Positive-going crossings provide a light-weight pitch-period tracker.
      // Requiring a small crossing level avoids triggering on near-silence.
      if (this.previousDetector <= 0 && sample > 0.006) {
        if (this.samplesSinceCrossing >= minPeriod && this.samplesSinceCrossing <= maxPeriod) {
          this.lastPeriodSamples = this.samplesSinceCrossing;
        }
        this.samplesSinceCrossing = 0;
      }
      this.previousDetector = sample;

      const sub = this.lastPeriodSamples
        ? Math.sin(this.subPhase) * this.subharmonic * Math.max(0, Math.min(1, (this.detectorEnvelope - 0.008) / 0.06))
        : 0;
      this.subPhase += targetIncrement;
      if (this.subPhase >= 2 * Math.PI) this.subPhase -= 2 * Math.PI;

      for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
        const channel = output[channelIndex];
        const dry = input[Math.min(channelIndex, input.length - 1)]?.[frame] ?? sample;
        const lowPrevious = this.lowPassState[channelIndex] ?? 0;
        const midPrevious = this.midPassState[channelIndex] ?? 0;
        const low = lowPrevious + lowCoefficient * (dry - lowPrevious);
        const throughLow = midPrevious + midCoefficient * (dry - midPrevious);
        const mid = throughLow - low;
        const high = dry - throughLow;
        this.lowPassState[channelIndex] = low;
        this.midPassState[channelIndex] = throughLow;

        // GKA multi-band saturation: add controlled harmonic density by band,
        // with less drive in the high band to keep sibilants from getting harsh.
        const lowDrive = 1 + this.saturation * 2.7;
        const midDrive = 1 + this.saturation * 2.1;
        const highDrive = 1 + this.saturation * 1.2;
        const lowSaturated = Math.tanh(low * lowDrive) / Math.tanh(lowDrive);
        const midSaturated = Math.tanh(mid * midDrive) / Math.tanh(midDrive);
        const highSaturated = Math.tanh(high * highDrive) / Math.tanh(highDrive);
        const saturated = lowSaturated + midSaturated + highSaturated;
        const mixed = saturated * (1 - this.subharmonic) + sub;
        channel[frame] = Math.max(-0.97, Math.min(0.97, mixed * 0.92));
      }
    }

    return true;
  }
}

registerProcessor("gka-monitor-processor", GkaMonitorProcessor);