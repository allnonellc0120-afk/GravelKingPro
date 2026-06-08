import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

type VocalPresetId = "raw" | "warm" | "broadcast" | "space" | "echo" | "studio";

interface VocalPreset {
  id: VocalPresetId;
  label: string;
  emoji: string;
  description: string;
  accent: string;
  glow: string;
  bg: string;
  lowGain: number;
  midGain: number;
  highGain: number;
  compThreshold: number;
  compRatio: number;
  reverbMix: number;
  echoDelay: number;
  echoMix: number;
}

const VOCAL_PRESETS: VocalPreset[] = [
  {
    id: "raw", label: "Raw", emoji: "🎤",
    description: "Clean pass-through — no processing",
    accent: "#94a3b8", glow: "rgba(148,163,184,0.2)", bg: "linear-gradient(135deg,#1e293b,#0f172a)",
    lowGain: 0, midGain: 0, highGain: 0,
    compThreshold: -3, compRatio: 1.05,
    reverbMix: 0, echoDelay: 0, echoMix: 0,
  },
  {
    id: "warm", label: "Warm", emoji: "🔥",
    description: "Gentle compression + low-end warmth",
    accent: "#f59e0b", glow: "rgba(245,158,11,0.2)", bg: "linear-gradient(135deg,#451a03,#1c0a00)",
    lowGain: 4, midGain: 0, highGain: -1,
    compThreshold: -20, compRatio: 3,
    reverbMix: 0.05, echoDelay: 0, echoMix: 0,
  },
  {
    id: "broadcast", label: "Broadcast", emoji: "📡",
    description: "Tight compression + presence boost",
    accent: "#3b82f6", glow: "rgba(59,130,246,0.2)", bg: "linear-gradient(135deg,#1e3a5f,#0c1a2e)",
    lowGain: -2, midGain: 2, highGain: 1,
    compThreshold: -15, compRatio: 6,
    reverbMix: 0.03, echoDelay: 0, echoMix: 0,
  },
  {
    id: "space", label: "Space", emoji: "🌌",
    description: "Airy reverb + air EQ boost",
    accent: "#8b5cf6", glow: "rgba(139,92,246,0.2)", bg: "linear-gradient(135deg,#2e1065,#13043a)",
    lowGain: 0, midGain: 0, highGain: 3,
    compThreshold: -18, compRatio: 3,
    reverbMix: 0.45, echoDelay: 0, echoMix: 0,
  },
  {
    id: "echo", label: "Echo", emoji: "🔁",
    description: "Slapback delay + lush reverb",
    accent: "#06b6d4", glow: "rgba(6,182,212,0.2)", bg: "linear-gradient(135deg,#083344,#021726)",
    lowGain: 0, midGain: 1, highGain: 1,
    compThreshold: -18, compRatio: 3,
    reverbMix: 0.3, echoDelay: 0.22, echoMix: 0.35,
  },
  {
    id: "studio", label: "Studio", emoji: "🎚️",
    description: "Full chain: EQ + comp + presence reverb",
    accent: "#22c55e", glow: "rgba(34,197,94,0.2)", bg: "linear-gradient(135deg,#052e16,#021a0d)",
    lowGain: 2, midGain: -1, highGain: 4,
    compThreshold: -12, compRatio: 8,
    reverbMix: 0.12, echoDelay: 0, echoMix: 0,
  },
];

export function LiveVocalMonitor() {
  const [active, setActive] = useState(false);
  const [preset, setPreset] = useState<VocalPresetId>("raw");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const ctxRef   = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef   = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const buildChain = useCallback((ctx: AudioContext, source: MediaStreamAudioSourceNode, p: VocalPreset) => {
    // 3-band EQ
    const low  = ctx.createBiquadFilter(); low.type  = "lowshelf";  low.frequency.value  = 200;  low.gain.value  = p.lowGain;
    const mid  = ctx.createBiquadFilter(); mid.type  = "peaking";   mid.frequency.value  = 2000; mid.Q.value     = 1.4; mid.gain.value = p.midGain;
    const high = ctx.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 8000; high.gain.value = p.highGain;

    // Compressor
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = p.compThreshold;
    comp.ratio.value     = p.compRatio;
    comp.knee.value      = 6;
    comp.attack.value    = 0.003;
    comp.release.value   = 0.15;

    // Limiter
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -1;
    limiter.ratio.value     = 20;
    limiter.knee.value      = 0;
    limiter.attack.value    = 0.001;
    limiter.release.value   = 0.05;

    // Analyser for metering
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Output gain
    const outGain = ctx.createGain();
    outGain.gain.value = 0.85;

    // Echo / delay
    if (p.echoDelay > 0 && p.echoMix > 0) {
      const delay  = ctx.createDelay(1.0);
      delay.delayTime.value = p.echoDelay;
      const dryGain  = ctx.createGain(); dryGain.gain.value  = 1 - p.echoMix;
      const wetGain  = ctx.createGain(); wetGain.gain.value  = p.echoMix;
      source.connect(low).connect(mid).connect(high).connect(comp);
      comp.connect(dryGain); comp.connect(delay); delay.connect(wetGain);
      dryGain.connect(limiter); wetGain.connect(limiter);
      limiter.connect(analyser); analyser.connect(outGain); outGain.connect(ctx.destination);
      return;
    }

    // Reverb (convolution)
    if (p.reverbMix > 0) {
      const irLength  = Math.floor(ctx.sampleRate * 2.5);
      const irBuffer  = ctx.createBuffer(2, irLength, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = irBuffer.getChannelData(ch);
        for (let i = 0; i < irLength; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLength, 2.5);
      }
      const convolver = ctx.createConvolver(); convolver.buffer = irBuffer;
      const dryGain   = ctx.createGain(); dryGain.gain.value   = 1 - p.reverbMix;
      const wetGain   = ctx.createGain(); wetGain.gain.value   = p.reverbMix;
      source.connect(low).connect(mid).connect(high).connect(comp);
      comp.connect(dryGain); comp.connect(convolver); convolver.connect(wetGain);
      dryGain.connect(limiter); wetGain.connect(limiter);
      limiter.connect(analyser); analyser.connect(outGain); outGain.connect(ctx.destination);
      return;
    }

    // Dry path
    source.connect(low).connect(mid).connect(high).connect(comp).connect(limiter).connect(analyser);
    analyser.connect(outGain).connect(ctx.destination);
  }, []);

  const stopMonitor = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    ctxRef.current?.close();
    streamRef.current = null;
    ctxRef.current   = null;
    analyserRef.current = null;
    setActive(false);
    setLevel(0);
  }, []);

  const startMonitor = useCallback(async (presetId: VocalPresetId) => {
    stopMonitor();
    setError(null);
    const p = VOCAL_PRESETS.find(v => v.id === presetId)!;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      buildChain(ctx, source, p);
      setActive(true);

      // Level meter RAF
      const data = new Uint8Array(analyserRef.current!.frequencyBinCount);
      const draw = () => {
        rafRef.current = requestAnimationFrame(draw);
        analyserRef.current?.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 8));

        // Canvas waveform
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
    } catch (e: any) {
      setError(e.name === "NotAllowedError" ? "Microphone access denied — allow it in your browser settings." : e.message);
    }
  }, [buildChain, stopMonitor]);

  const handleToggle = useCallback(async (presetId: VocalPresetId) => {
    if (active && preset === presetId) { stopMonitor(); return; }
    setPreset(presetId);
    await startMonitor(presetId);
  }, [active, preset, startMonitor, stopMonitor]);

  useEffect(() => () => stopMonitor(), [stopMonitor]);

  const p = VOCAL_PRESETS.find(v => v.id === preset)!;

  return (
    <div className="space-y-3">
      {/* Level bar */}
      <AnimatePresence>
        {active && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
              <span className="text-[10px] text-muted-foreground">{p.label} preset active — sing or speak into your mic</span>
            </div>
            <canvas ref={canvasRef} width={320} height={40} className="w-full rounded-lg bg-black/40 border border-border/20" style={{ height: 40 }} />
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

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">{error}</div>
      )}

      {/* Preset grid */}
      <div className="grid grid-cols-2 gap-2">
        {VOCAL_PRESETS.map((vp) => {
          const on = active && preset === vp.id;
          return (
            <button
              key={vp.id}
              onClick={() => handleToggle(vp.id)}
              style={{
                background: on ? vp.bg : "linear-gradient(135deg,#1e293b,#0f172a)",
                borderColor: on ? vp.accent : `${vp.accent}33`,
                boxShadow: on ? `0 0 18px ${vp.glow}, inset 0 1px 0 rgba(255,255,255,0.06)` : undefined,
              }}
              className="relative overflow-hidden flex items-center gap-2.5 text-left px-3 py-2.5 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xl shrink-0" style={{ background: `${vp.accent}22`, border: `1px solid ${vp.accent}44` }}>
                {on ? <Mic className="w-4 h-4 animate-pulse" style={{ color: vp.accent }} /> : <span>{vp.emoji}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold leading-tight" style={{ color: on ? vp.accent : "#f1f5f9" }}>{vp.label}</div>
                <div className="text-[9px] text-muted-foreground mt-0.5 leading-snug">{vp.description}</div>
              </div>
              {on && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: vp.accent }} />}
            </button>
          );
        })}
      </div>

      {active && (
        <Button variant="outline" size="sm" className="w-full gap-2 text-xs border-destructive/30 text-destructive hover:bg-destructive/10" onClick={stopMonitor}>
          <MicOff className="w-3.5 h-3.5" /> Stop Monitoring
        </Button>
      )}
    </div>
  );
}
