import { useCallback, useEffect, useRef, useState } from "react";
import { Bluetooth, Headphones, Mic, MicOff, SlidersHorizontal } from "lucide-react";
import { buildGkaMonitorGraph, createGkaMonitorContext, type GkaMonitorGraph } from "@/lib/audio/gkaMonitor";

export type MonitorPreset = "raw" | "warm" | "room";

type LiveMonitorProps = {
  stopSignal?: number;
  onPresetChange?: (preset: MonitorPreset | null) => void;
};

const presets: Array<{
  id: MonitorPreset;
  label: string;
  description: string;
  saturation: number;
  subharmonic: number;
}> = [
  { id: "raw", label: "Dry", description: "Direct mic with subtle GKA saturation", saturation: 0.04, subharmonic: 0.025 },
  { id: "warm", label: "Warmth", description: "GKA vocal body + octave subharmonic", saturation: 0.42, subharmonic: 0.11 },
  { id: "room", label: "Tight room", description: "GKA warmth + gentle subharmonic", saturation: 0.28, subharmonic: 0.075 },
];

function looksBluetooth(label: string): boolean {
  return /bluetooth|airpods|wireless|buds|jabra|bose|sony\s*(wh|wf)|beats|galaxy\s*buds|pixel\s*buds/i.test(label);
}

export function LiveMonitor({ stopSignal, onPresetChange }: LiveMonitorProps) {
  const [active, setActive] = useState(false);
  const [presetId, setPresetId] = useState<MonitorPreset>("raw");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [bluetoothOutput, setBluetoothOutput] = useState<boolean | null>(null);
  const [latencyReport, setLatencyReport] = useState<string | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nodesRef = useRef<AudioNode[]>([]);
  const frameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stop = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    for (const node of nodesRef.current) {
      try { node.disconnect(); } catch { /* graph is already disconnected */ }
    }
    nodesRef.current = [];
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close();
    contextRef.current = null;
    analyserRef.current = null;
    setActive(false);
    setLevel(0);
    setBluetoothOutput(null);
    setLatencyReport(null);
    onPresetChange?.(null);
  }, [onPresetChange]);

  const start = useCallback(async (nextPreset: MonitorPreset) => {
    stop();
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Live mic monitoring is unavailable in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          latency: 0,
        } as MediaTrackConstraints,
      });
      const ctx = createGkaMonitorContext();
      streamRef.current = stream;
      contextRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const selected = presets.find((item) => item.id === nextPreset) ?? presets[0];
      const graph: GkaMonitorGraph = await buildGkaMonitorGraph(
        ctx,
        stream,
        { saturation: selected.saturation, subharmonic: selected.subharmonic },
        (message) => setError(message),
      );
      const { analyser } = graph;

      analyserRef.current = analyser;
      nodesRef.current = graph.nodes;
      const latency = graph.softwareLatency;
      setLatencyReport(
        `Browser software latency: base ${latency.baseLatencyMs?.toFixed(1) ?? "n/a"} ms · output ${latency.outputLatencyMs?.toFixed(1) ?? "n/a"} ms · quantum ${latency.quantumMs.toFixed(2)} ms · ${latency.estimatedSoftwareRoundTripMs == null ? "round-trip estimate unavailable" : `software round-trip estimate ${latency.estimatedSoftwareRoundTripMs.toFixed(1)} ms (${latency.under10Ms ? "under" : "over"} 10 ms)`}; hardware round-trip is not measured`,
      );
      setBluetoothOutput(
        typeof navigator.mediaDevices.enumerateDevices === "function"
          ? (await navigator.mediaDevices.enumerateDevices())
            .filter((device) => device.kind === "audiooutput")
            .some((device) => looksBluetooth(device.label))
          : null,
      );
      setActive(true);
      onPresetChange?.(nextPreset);

      const data = new Uint8Array(analyser.fftSize);
      const draw = () => {
        const current = analyserRef.current;
        if (!current) return;
        current.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const sample = (value - 128) / 128;
          sum += sample * sample;
        }
        const nextLevel = Math.min(1, Math.sqrt(sum / data.length) * 8);
        setLevel(nextLevel);
        const canvas = canvasRef.current;
        const context2d = canvas?.getContext("2d");
        if (context2d && canvas) {
          context2d.clearRect(0, 0, canvas.width, canvas.height);
          context2d.strokeStyle = "#f5c451";
          context2d.lineWidth = 1.5;
          context2d.beginPath();
          const slice = canvas.width / data.length;
          data.forEach((value, index) => {
            const y = ((value - 128) / 128) * (canvas.height / 2) + canvas.height / 2;
            if (index === 0) context2d.moveTo(0, y);
            else context2d.lineTo(index * slice, y);
          });
          context2d.stroke();
        }
        frameRef.current = requestAnimationFrame(draw);
      };
      draw();
    } catch (cause) {
      const name = cause && typeof cause === "object" && "name" in cause ? String(cause.name) : "";
      stop();
      setError(name === "NotAllowedError" ? "Microphone access denied. Allow mic access in your browser settings." : cause instanceof Error ? cause.message : "Could not start live monitoring.");
      onPresetChange?.(null);
    }
  }, [onPresetChange, stop]);

  useEffect(() => () => stop(), [stop]);
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) {
      firstSignal.current = false;
      return;
    }
    stop();
  }, [stop, stopSignal]);

  const preset = presets.find((item) => item.id === presetId) ?? presets[0];
  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3" aria-label="Live mic monitor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-amber-300" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/85">Monitor mic</p>
            <p className="text-[10px] text-white/45">Interactive-latency direct monitoring</p>
          </div>
        </div>
        <button
          type="button"
          aria-pressed={active}
          onClick={() => void (active ? stop() : start(presetId))}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${active ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300" : "border-amber-400/50 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"}`}
        >
          {active ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          {active ? "🎧 Monitor mic on" : "🎧 Monitor mic"}
        </button>
      </div>
      {active && (
        <div className="space-y-2 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-2">
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="flex items-center gap-1.5 text-emerald-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Live · {preset.label}</span>
            <span className="flex items-center gap-1 text-white/45"><Headphones className="h-3 w-3" />Wired headphones recommended</span>
          </div>
          <canvas ref={canvasRef} width={420} height={34} className="h-[34px] w-full rounded-lg border border-white/10 bg-black/35" />
          {latencyReport && <p className="text-[9px] text-white/45">{latencyReport}</p>}
          <div className="flex items-center gap-2">
            <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="rounded-full bg-amber-300 transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
            <span className="w-8 text-right font-mono text-[9px] text-white/45">{Math.round(level * 100)}</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5">
        {presets.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => { setPresetId(item.id); if (active) void start(item.id); }}
            className={`rounded-lg border px-2 py-2 text-left transition-colors ${presetId === item.id ? "border-amber-300/50 bg-amber-300/10 text-amber-200" : "border-white/10 text-white/50 hover:border-white/25 hover:text-white"}`}
          >
            <span className="block text-[11px] font-semibold">{item.label}</span>
            <span className="mt-0.5 block text-[9px] leading-tight text-current/60">{item.description}</span>
          </button>
        ))}
      </div>
      {bluetoothOutput && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-300/30 bg-sky-300/10 px-2.5 py-2 text-[10px] text-sky-100">
          <Bluetooth className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span><strong>Bluetooth output detected.</strong> Use wired headphones for tight timing and to prevent feedback.</span>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-400/10 px-2.5 py-2 text-[10px] text-red-300">{error}</p>}
      {!active && !error && <p className="flex items-center gap-1.5 text-[10px] text-white/45"><Mic className="h-3 w-3" />Your monitoring effects are separate from the pristine vocal take.</p>}
    </section>
  );
}

export default LiveMonitor;