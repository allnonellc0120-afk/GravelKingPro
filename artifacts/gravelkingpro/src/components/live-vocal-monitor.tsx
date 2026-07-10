import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, CheckCircle2, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  VOCAL_PRESETS,
  buildEffectChain,
  type VocalPresetId,
  type VocalPreset,
} from "@/lib/daw/vocalPresets";

interface Props {
  /**
   * Called whenever the active preset changes.
   * Receives the active VocalPreset when monitoring starts, null when it stops.
   * The parent can forward this to the recorder so the same preset is baked
   * into the recording.
   */
  onPresetChange?: (preset: VocalPreset | null) => void;
  /**
   * Bump this (e.g. increment a counter) right before a take starts to force
   * this preview stream closed. The recorder opens its own mic stream for the
   * take, and some browsers (notably iOS Safari) get flaky with two
   * concurrent getUserMedia streams on the same device — closing the preview
   * first avoids that contention. Safe to call even if already inactive.
   */
  stopSignal?: number;
}

export function LiveVocalMonitor({ onPresetChange, stopSignal }: Props) {
  const [active, setActive] = useState(false);
  const [preset, setPreset] = useState<VocalPresetId>("raw");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const ctxRef    = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);

  const stopMonitor = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    streamRef.current = null;
    ctxRef.current    = null;
    analyserRef.current = null;
    setActive(false);
    setLevel(0);
    onPresetChange?.(null);
  }, [onPresetChange]);

  const startMonitor = useCallback(async (presetId: VocalPresetId) => {
    stopMonitor();
    setError(null);
    const p = VOCAL_PRESETS.find(v => v.id === presetId)!;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      // Route through shared effect chain to speakers (ctx.destination).
      const analyser = buildEffectChain(ctx, source, p, ctx.destination);
      analyserRef.current = analyser;
      setActive(true);
      onPresetChange?.(p);

      // Level meter + canvas RAF
      const data = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        analyserRef.current?.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 8));

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx2d = canvas.getContext("2d")!;
        const W = canvas.width, H = canvas.height;
        ctx2d.clearRect(0, 0, W, H);
        ctx2d.strokeStyle = p.accent;
        ctx2d.lineWidth   = 1.5;
        ctx2d.beginPath();
        const slice = W / data.length;
        for (let i = 0; i < data.length; i++) {
          const y = ((data[i] - 128) / 128) * (H / 2) + H / 2;
          i === 0 ? ctx2d.moveTo(0, y) : ctx2d.lineTo(i * slice, y);
        }
        ctx2d.stroke();
      };
      draw();
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name;
      const msg  = (e as { message?: string })?.message ?? "Unknown error";
      setError(name === "NotAllowedError" ? "Microphone access denied — allow it in your browser settings." : msg);
      onPresetChange?.(null);
    }
  }, [stopMonitor, onPresetChange]);

  const handleToggle = useCallback(async (presetId: VocalPresetId) => {
    if (active && preset === presetId) { stopMonitor(); return; }
    setPreset(presetId);
    await startMonitor(presetId);
  }, [active, preset, startMonitor, stopMonitor]);

  useEffect(() => () => stopMonitor(), [stopMonitor]);

  // A take is about to start — release this preview stream so the recorder's
  // own mic capture doesn't contend with it (see stopSignal doc above).
  const firstStopSignal = useRef(true);
  useEffect(() => {
    if (firstStopSignal.current) { firstStopSignal.current = false; return; }
    stopMonitor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopSignal]);

  const p = VOCAL_PRESETS.find(v => v.id === preset)!;

  return (
    <div className="space-y-3">
      {/* Active indicator + waveform canvas */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live · {p.label}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-amber-400/80">
                <Headphones className="w-3 h-3" />
                Baked into recording
              </span>
            </div>
            <canvas
              ref={canvasRef}
              width={320}
              height={40}
              className="w-full rounded-lg bg-black/40 border border-border/20"
              style={{ height: 40 }}
            />
            <div className="flex gap-0.5 items-end h-2">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-all duration-75"
                  style={{
                    height: `${Math.max(15, Math.min(100, level * 100 - i * 3))}%`,
                    background: i < 16 ? p.accent : i < 21 ? "#f59e0b" : "#ef4444",
                    opacity: level * 24 > i ? 1 : 0.15,
                  }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preset grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {VOCAL_PRESETS.map((vp) => {
          const isActive = active && preset === vp.id;
          return (
            <button
              key={vp.id}
              onClick={() => void handleToggle(vp.id)}
              className={`relative flex flex-col items-center gap-0.5 rounded-xl p-2.5 border text-[11px] font-medium transition-all ${
                isActive
                  ? "border-transparent text-white scale-[1.02]"
                  : "border-border/40 text-muted-foreground hover:border-white/20 hover:text-white"
              }`}
              style={isActive ? { background: vp.bg, boxShadow: `0 0 12px ${vp.glow}` } : {}}
              title={vp.description}
            >
              {isActive && (
                <CheckCircle2 className="absolute top-1.5 right-1.5 w-3 h-3" style={{ color: vp.accent }} />
              )}
              <span className="text-base leading-none">{vp.emoji}</span>
              <span>{vp.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active monitoring controls */}
      {active && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            Use headphones to avoid feedback. Effect will be baked into your take.
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={stopMonitor}
            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-white"
          >
            <MicOff className="w-3 h-3" /> Stop
          </Button>
        </div>
      )}

      {!active && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Mic className="w-3 h-3 shrink-0" />
          <span>Pick a preset to hear yourself live. The selected effect will be baked into your recording.</span>
        </div>
      )}

      {error && (
        <p className="text-[10px] text-red-400 bg-red-500/10 rounded-lg px-2.5 py-2">{error}</p>
      )}
    </div>
  );
}
