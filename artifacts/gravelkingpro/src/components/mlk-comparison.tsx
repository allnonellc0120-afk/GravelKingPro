import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Zap, AlertCircle, RefreshCw } from "lucide-react";

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
  label: string;
  parity: string;
  peak: number;
  efficiency: number;
  gainChangeDb: number;
  realtimeRatio: number | null;
  timeMs: number;
};

function normalise(resp: APIResponse): RunResult {
  return {
    label: resp.mlk ? "MLK v3" : "RAW",
    parity: resp.metrics.parity,
    peak: resp.metrics.peak,
    efficiency: resp.metrics.efficiency * 100,
    gainChangeDb: resp.metrics.gainChangeDb,
    realtimeRatio: resp.timing.realtimeRatio,
    timeMs: resp.timing.timeMs,
  };
}

const METRICS: {
  key: keyof Omit<RunResult, "label" | "parity">;
  label: string;
  fmt: (v: number | null) => string;
  winnerIs: "lower" | "higher" | null;
}[] = [
  {
    key: "peak",
    label: "Peak Level",
    fmt: (v) => (v === null ? "—" : v.toFixed(3)),
    winnerIs: "lower",
  },
  {
    key: "efficiency",
    label: "Headroom Efficiency",
    fmt: (v) => (v === null ? "—" : v.toFixed(1) + "%"),
    winnerIs: "higher",
  },
  {
    key: "realtimeRatio",
    label: "Realtime Ratio",
    fmt: (v) => (v === null ? "N/A" : v.toFixed(1) + "x"),
    winnerIs: null,
  },
  {
    key: "gainChangeDb",
    label: "Gain Adjustment",
    fmt: (v) => (v === null || v === 0 ? "None" : v.toFixed(2) + " dB"),
    winnerIs: null,
  },
];

function ResultColumn({
  result,
  other,
  focused,
}: {
  result: RunResult;
  other: RunResult;
  focused: boolean;
}) {
  const isMLK = result.label === "MLK v3";

  return (
    <motion.div
      layout
      className={`flex-1 rounded-xl border p-4 space-y-3 transition-colors duration-300 ${
        focused
          ? isMLK
            ? "border-amber-500/50 bg-amber-500/5"
            : "border-slate-500/40 bg-slate-500/5"
          : "border-border/30 bg-card/20 opacity-70"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-bold ${isMLK ? "text-amber-400" : "text-muted-foreground"}`}
          >
            {result.label}
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
              result.parity === "MLK_V3_VALIDATED"
                ? "bg-amber-500/20 text-amber-400"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {result.parity === "MLK_V3_VALIDATED" ? "VALIDATED" : "BASELINE"}
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {result.timeMs < 1 ? "<1" : result.timeMs.toFixed(0)} ms
        </span>
      </div>

      {/* Metrics */}
      <div className="space-y-2">
        {METRICS.map((m) => {
          const val = result[m.key] as number | null;
          const otherVal = other[m.key] as number | null;
          const isBetter =
            m.winnerIs !== null && val !== null && otherVal !== null
              ? m.winnerIs === "lower"
                ? val < otherVal
                : val > otherVal
              : false;
          return (
            <div
              key={m.key}
              className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                isBetter
                  ? "bg-amber-500/10 border border-amber-500/20"
                  : "bg-secondary/30 border border-border/20"
              }`}
            >
              <span className="text-xs text-muted-foreground">{m.label}</span>
              <span
                className={`font-mono text-xs font-bold ${
                  isBetter ? "text-amber-400" : "text-foreground"
                }`}
              >
                {m.fmt(val)}
                {isBetter && (
                  <span className="ml-1 text-amber-500 text-[9px]">✓</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Description */}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        {isMLK
          ? "Three-band amplitude carving · Phase-coherent recombination · 0.92 peak ceiling"
          : "Unprocessed signal · No kernel applied · Full dynamic range preserved"}
      </p>
    </motion.div>
  );
}

export function MLKComparison() {
  const [isRunning, setIsRunning] = useState(false);
  const [rawResult, setRawResult] = useState<RunResult | null>(null);
  const [mlkResult, setMlkResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusedSide, setFocusedSide] = useState<"raw" | "mlk">("mlk");

  const runDemo = async (mlk: boolean): Promise<RunResult> => {
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

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const [raw, mlk] = await Promise.all([runDemo(false), runDemo(true)]);
      setRawResult(raw);
      setMlkResult(mlk);
      setFocusedSide("mlk");
    } catch (err: any) {
      setError(err.message || "Could not run demo.");
    } finally {
      setIsRunning(false);
    }
  };

  const hasResults = rawResult !== null && mlkResult !== null;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">MLK v3 — Live Before / After</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Same audio sample, two paths. See exactly what the kernel changes.
          </p>
        </div>
        {hasResults && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Focus:</span>
            <div className="flex rounded-lg overflow-hidden border border-border/40">
              <button
                onClick={() => setFocusedSide("raw")}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${
                  focusedSide === "raw"
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                RAW
              </button>
              <button
                onClick={() => setFocusedSide("mlk")}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${
                  focusedSide === "mlk"
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                MLK v3
              </button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRun}
              disabled={isRunning}
              className="h-8 px-3 text-xs text-muted-foreground"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRunning ? "animate-spin" : ""}`} />
              {isRunning ? "Running…" : "Rerun"}
            </Button>
          </div>
        )}
      </div>

      {/* Before first run */}
      {!hasResults && (
        <div className="flex flex-col items-center gap-3 py-10 border border-dashed border-border/40 rounded-xl bg-secondary/10">
          <Zap className="w-8 h-8 text-amber-500/60" />
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            Hit <strong className="text-foreground">Run Demo</strong> to fire the built-in sample
            through both RAW and MLK v3 simultaneously — results appear side-by-side.
          </p>
          <Button
            onClick={handleRun}
            disabled={isRunning}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-10 px-8"
          >
            <Play className="w-4 h-4 mr-2 fill-current" />
            {isRunning ? "Running…" : "Run Demo"}
          </Button>
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>
      )}

      {/* Side-by-side results */}
      <AnimatePresence>
        {hasResults && rawResult && mlkResult && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <ResultColumn
              result={rawResult}
              other={mlkResult}
              focused={focusedSide === "raw"}
            />

            {/* VS divider */}
            <div className="flex sm:flex-col items-center justify-center gap-1 shrink-0">
              <div className="h-px sm:h-full sm:w-px flex-1 bg-border/30" />
              <Badge
                variant="outline"
                className="text-[10px] shrink-0 border-border/40 text-muted-foreground px-2"
              >
                VS
              </Badge>
              <div className="h-px sm:h-full sm:w-px flex-1 bg-border/30" />
            </div>

            <ResultColumn
              result={mlkResult}
              other={rawResult}
              focused={focusedSide === "mlk"}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error after run */}
      {error && hasResults && (
        <div className="flex items-center gap-2 text-xs text-red-400 pt-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
    </div>
  );
}
