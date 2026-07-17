import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, AlertCircle, RefreshCw, Volume2 } from "lucide-react";

type APIResponse = {
  success: boolean;
  mlk: boolean;
  timing: {
    timeMs: number;
    sampleCount: number;
    realtimeRatio: number | null;
  };
  metrics: {
    rms: number;
    peak: number;
    gainChangeDb: number;
    efficiency: number;
    parity: string;
  };
  error?: string;
};

type RunResult = {
  mlk: boolean;
  parity: string;
  peak: number;
  rms: number;
  efficiency: number;
  gainChangeDb: number;
  realtimeRatio: number | null;
  timeMs: number;
};

function normalise(resp: APIResponse): RunResult {
  return {
    mlk: resp.mlk,
    parity: resp.metrics.parity,
    peak: resp.metrics.peak,
    rms: resp.metrics.rms,
    efficiency: resp.metrics.efficiency * 100,
    gainChangeDb: resp.metrics.gainChangeDb,
    realtimeRatio: resp.timing.realtimeRatio,
    timeMs: resp.timing.timeMs,
  };
}

function parityBadge(parity: string) {
  if (parity === "MLK_V3_VALIDATED")
    return { label: "VALIDATED", cls: "bg-emerald-500/20 text-emerald-400" };
  if (parity === "BASELINE")
    return { label: "BASELINE", cls: "bg-secondary text-muted-foreground" };
  return { label: "VIOLATION", cls: "bg-red-500/20 text-red-400" };
}

const METRICS: {
  key: keyof Omit<RunResult, "mlk" | "parity">;
  label: string;
  fmt: (v: number | null) => string;
  winnerIs: "lower" | "higher" | null;
}[] = [
  { key: "peak", label: "Peak Level", fmt: (v) => (v == null ? "—" : v.toFixed(3)), winnerIs: "lower" },
  { key: "rms", label: "RMS Level", fmt: (v) => (v == null ? "—" : v.toFixed(4)), winnerIs: null },
  { key: "efficiency", label: "Headroom Efficiency", fmt: (v) => (v == null ? "—" : v.toFixed(1) + "%"), winnerIs: "higher" },
  { key: "gainChangeDb", label: "Gain Adjustment", fmt: (v) => (v == null || v === 0 ? "None" : v.toFixed(2) + " dB"), winnerIs: null },
  { key: "realtimeRatio", label: "Realtime Ratio", fmt: (v) => (v == null ? "N/A" : v.toFixed(1) + "x"), winnerIs: null },
];

function ResultColumn({
  result,
  other,
  active,
}: {
  result: RunResult;
  other: RunResult | null;
  active: boolean;
}) {
  const isMLK = result.mlk;
  const badge = parityBadge(result.parity);

  return (
    <div
      className={`flex-1 rounded-xl border p-4 space-y-3 transition-all duration-300 ${
        active
          ? isMLK
            ? "border-amber-500/50 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.08)]"
            : "border-slate-400/40 bg-slate-500/5"
          : "border-border/25 bg-card/15 opacity-55"
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-extrabold ${isMLK ? "text-amber-400" : "text-slate-300"}`}>
            {isMLK ? "MLK v3" : "RAW"}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {result.timeMs < 1 ? "<1ms" : result.timeMs.toFixed(0) + "ms"}
        </span>
      </div>

      {/* Metrics */}
      <div className="space-y-1.5">
        {METRICS.map((m) => {
          const val = result[m.key] as number | null;
          const otherVal = other ? (other[m.key] as number | null) : null;
          const isBetter =
            m.winnerIs !== null && val !== null && otherVal !== null
              ? m.winnerIs === "lower"
                ? val < otherVal
                : val > otherVal
              : false;
          return (
            <div
              key={m.key}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs ${
                isBetter
                  ? "bg-amber-500/10 border border-amber-500/20"
                  : "bg-secondary/30 border border-border/15"
              }`}
            >
              <span className="text-muted-foreground">{m.label}</span>
              <span className={`font-mono font-bold ${isBetter ? "text-amber-400" : "text-foreground"}`}>
                {m.fmt(val)}
                {isBetter && <span className="ml-1 text-[9px]">✓</span>}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        {isMLK
          ? "Three-band amplitude carving · Phase-coherent recombination · 0.92 ceiling"
          : "Unprocessed signal · No kernel applied · Raw dynamic range"}
      </p>
    </div>
  );
}

export function MLKComparison() {
  const [mlkOn, setMlkOn] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [rawResult, setRawResult] = useState<RunResult | null>(null);
  const [mlkResult, setMlkResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playingBefore, setPlayingBefore] = useState(false);
  const [playingAfter, setPlayingAfter] = useState(false);
  const beforeRef = useRef<HTMLAudioElement>(null);
  const afterRef = useRef<HTMLAudioElement>(null);

  const togglePlay = async (side: "before" | "after") => {
    const mine = side === "before" ? beforeRef.current : afterRef.current;
    const other = side === "before" ? afterRef.current : beforeRef.current;
    if (!mine) return;
    if (!mine.paused) {
      mine.pause();
    } else {
      other?.pause();
      await mine.play().catch(() => {});
    }
  };

  const runSingle = async (mlk: boolean): Promise<RunResult> => {
    const res = await fetch("/api/kernel/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlk }),
    });
    if (!res.ok) throw new Error("Kernel request failed");
    const json: APIResponse = await res.json();
    if (!json.success) throw new Error(json.error || "Kernel error");
    return normalise(json);
  };

  const handleToggle = async (on: boolean) => {
    setMlkOn(on);
    setIsRunning(true);
    setError(null);
    try {
      const result = await runSingle(on);
      if (on) setMlkResult(result);
      else setRawResult(result);
    } catch (err: any) {
      setError(err.message || "Kernel error");
    } finally {
      setIsRunning(false);
    }
  };

  const handleRunBoth = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const [raw, mlk] = await Promise.all([runSingle(false), runSingle(true)]);
      setRawResult(raw);
      setMlkResult(mlk);
    } catch (err: any) {
      setError(err.message || "Kernel error");
    } finally {
      setIsRunning(false);
    }
  };

  const hasRaw = rawResult !== null;
  const hasMlk = mlkResult !== null;
  const hasBoth = hasRaw && hasMlk;
  const hasAny = hasRaw || hasMlk;

  return (
    <div className="space-y-4">
      {/* Header + toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">MLK v3 — Live Before / After</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toggle MLK v3 ON or OFF — runs that mode through the kernel instantly.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold ${!mlkOn ? "text-foreground" : "text-muted-foreground"}`}>
            RAW
          </span>
          <Switch
            checked={mlkOn}
            onCheckedChange={handleToggle}
            disabled={isRunning}
            className="data-[state=checked]:bg-amber-500"
          />
          <span className={`text-xs font-semibold ${mlkOn ? "text-amber-400" : "text-muted-foreground"}`}>
            MLK v3
          </span>
          {isRunning && (
            <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
          )}
        </div>
      </div>

      {/* Current mode indicator */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
        mlkOn
          ? "border-amber-500/30 bg-amber-500/8 text-amber-400"
          : "border-border/30 bg-secondary/20 text-muted-foreground"
      }`}>
        <span className="font-semibold">{mlkOn ? "MLK v3 ON" : "RAW (no kernel)"}</span>
        <span className="opacity-60">·</span>
        <span>{mlkOn ? "three-band amplitude carving active" : "signal passed through unmodified"}</span>
        {isRunning && <span className="ml-auto">processing…</span>}
        {!isRunning && !hasAny && (
          <span className="ml-auto opacity-60">flip toggle or press Run Demo to process</span>
        )}
        {!isRunning && hasAny && !hasBoth && (
          <button
            onClick={handleRunBoth}
            className="ml-auto text-amber-400 hover:text-amber-300 underline underline-offset-2"
          >
            run other side too →
          </button>
        )}
        {!isRunning && hasBoth && (
          <button
            onClick={handleRunBoth}
            className="ml-auto opacity-60 hover:opacity-100 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> rerun both
          </button>
        )}
      </div>

      {/* ── Audio demo — hear the difference ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Before", sub: "Raw upload", src: "/demo_original.wav", playing: playingBefore, side: "before" as const, accent: "border-border/40 bg-secondary/20", btnCls: "border border-border/40 text-foreground hover:bg-secondary/60" },
          { label: "After", sub: "MLK v3 Mastered", src: "/demo_mastered.wav", playing: playingAfter, side: "after" as const, accent: "border-amber-500/30 bg-amber-500/5", btnCls: "bg-amber-500 hover:bg-amber-600 text-black" },
        ].map(({ label, sub, src, playing, side, accent, btnCls }) => (
          <div key={label} className={`rounded-lg border p-3 space-y-2 ${accent}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">{label}</p>
                <p className="text-[10px] text-muted-foreground">{sub}</p>
              </div>
              <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <button
              onClick={() => togglePlay(side)}
              className={`w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-colors ${btnCls}`}
            >
              {playing
                ? <><Pause className="w-3.5 h-3.5" /> Pause</>
                : <><Play className="w-3.5 h-3.5 fill-current" /> Play {label}</>}
            </button>
          </div>
        ))}
      </div>
      <audio ref={beforeRef} src="/demo_original.wav" preload="none"
        onPlay={() => setPlayingBefore(true)} onPause={() => setPlayingBefore(false)} onEnded={() => setPlayingBefore(false)} />
      <audio ref={afterRef} src="/demo_mastered.wav" preload="none"
        onPlay={() => setPlayingAfter(true)} onPause={() => setPlayingAfter(false)} onEnded={() => setPlayingAfter(false)} />

      {/* Initial run prompt */}
      {!hasAny && (
        <div className="flex flex-col items-center gap-3 py-8 border border-dashed border-border/40 rounded-xl bg-secondary/10">
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Flip the toggle above to run one mode, or run both simultaneously for a full side-by-side comparison.
          </p>
          <Button
            onClick={handleRunBoth}
            disabled={isRunning}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-10 px-8"
          >
            <Play className="w-4 h-4 mr-2 fill-current" />
            {isRunning ? "Running…" : "Run Demo — Both Sides"}
          </Button>
        </div>
      )}

      {/* Single result (only one side run yet) */}
      {hasAny && !hasBoth && (
        <AnimatePresence mode="wait">
          <motion.div
            key={hasRaw ? "raw-only" : "mlk-only"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ResultColumn
              result={(hasRaw ? rawResult : mlkResult)!}
              other={null}
              active={true}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* Side-by-side both results */}
      {hasBoth && (
        <AnimatePresence>
          <motion.div
            key="both"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <ResultColumn result={rawResult!} other={mlkResult} active={!mlkOn} />

            <div className="flex sm:flex-col items-center justify-center gap-1 shrink-0">
              <div className="h-px sm:h-full sm:w-px flex-1 bg-border/30" />
              <Badge variant="outline" className="text-[10px] shrink-0 border-border/40 text-muted-foreground px-2">
                VS
              </Badge>
              <div className="h-px sm:h-full sm:w-px flex-1 bg-border/30" />
            </div>

            <ResultColumn result={mlkResult!} other={rawResult} active={mlkOn} />
          </motion.div>
        </AnimatePresence>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
