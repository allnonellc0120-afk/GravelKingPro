export type GkaMonitorTuning = {
  saturation: number;
  subharmonic: number;
};

export type GkaMonitorGraph = {
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
  analyser: AnalyserNode;
  nodes: AudioNode[];
  reportedLatency: {
    baseLatencyMs: number | null;
    outputLatencyMs: number | null;
    quantumMs: number;
  };
  // Compatibility shape for the two existing monitor widgets. We deliberately
  // leave the legacy estimate empty: capture/device latency is not measurable.
  softwareLatency: {
    baseLatencyMs: number | null;
    outputLatencyMs: number | null;
    quantumMs: number;
    estimatedSoftwareRoundTripMs: number | null;
    under10Ms: boolean | null;
  };
};

export function createGkaMonitorContext(): AudioContext {
  return new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
}

export function readReportedMonitorLatency(ctx: AudioContext): GkaMonitorGraph["reportedLatency"] {
  const baseLatencyMs = Number.isFinite(ctx.baseLatency) ? ctx.baseLatency * 1000 : null;
  const outputLatencyMs =
    "outputLatency" in ctx && Number.isFinite(ctx.outputLatency)
      ? ctx.outputLatency * 1000
      : null;
  const quantumMs = (128 / ctx.sampleRate) * 1000;
  return { baseLatencyMs, outputLatencyMs, quantumMs };
}

export async function buildGkaMonitorGraph(
  ctx: AudioContext,
  stream: MediaStream,
  tuning: GkaMonitorTuning,
  onProcessorWarning?: (message: string) => void,
): Promise<GkaMonitorGraph> {
  const workletUrl = new URL(`${import.meta.env.BASE_URL}gka-monitor-worklet.js`, window.location.href);
  await ctx.audioWorklet.addModule(workletUrl.href);

  const source = ctx.createMediaStreamSource(stream);
  const processor = new AudioWorkletNode(ctx, "gka-monitor-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: "clamped-max",
    processorOptions: tuning,
  });
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;

  // One explicit low-latency path: mic -> GKA DSP -> analyser -> output.
  source.connect(processor);
  processor.connect(analyser);
  analyser.connect(ctx.destination);
  processor.port.onmessage = (event: MessageEvent<{ type?: string; message?: string }>) => {
    if (event.data?.type === "quantum-overflow") {
      const message = event.data.message ?? "AudioWorklet render quantum exceeded 256 samples.";
      console.error("[GKA monitor] refusing oversized AudioWorklet render quantum", event.data);
      onProcessorWarning?.(message);
    }
  };

  const reportedLatency = readReportedMonitorLatency(ctx);
  console.info("[GKA monitor] browser-reported latency", {
    ...reportedLatency,
    basis: "AudioContext baseLatency/outputLatency; microphone, driver, and hardware round-trip latency are not measured",
    renderQuantumTargetSamples: 128,
    maximumAcceptedRenderQuantumSamples: 256,
    route: "MediaStreamSource -> GKA AudioWorkletNode -> AnalyserNode -> AudioContext.destination",
  });

  return {
    source,
    processor,
    analyser,
    nodes: [source, processor, analyser],
    reportedLatency,
    softwareLatency: { ...reportedLatency, estimatedSoftwareRoundTripMs: null, under10Ms: null },
  };
}