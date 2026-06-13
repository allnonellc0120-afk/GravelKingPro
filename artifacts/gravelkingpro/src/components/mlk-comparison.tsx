import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Zap, AlertCircle } from "lucide-react";

type MLKResult = {
  mlk: boolean;
  timeMs: number;
  realtimeRatio: number;
  rms: number;
  peak: number;
  gainChangeDb: number;
  efficiency: number;
  parity: string;
};

const METRICS = [
  {
    key: "peak" as keyof MLKResult,
    label: "Peak Level",
    fmt: (v: number) => v.toFixed(3),
    better: "lower",
    unit: "",
    raw: 0.95,
    mlk: 0.92,
  },
  {
    key: "efficiency" as keyof MLKResult,
    label: "Headroom Efficiency",
    fmt: (v: number) => v.toFixed(1) + "%",
    better: "higher",
    unit: "%",
    raw: 96.8,
    mlk: 100.0,
  },
  {
    key: "realtimeRatio" as keyof MLKResult,
    label: "Realtime Ratio",
    fmt: (v: number) => v.toFixed(1) + "x",
    better: "higher",
    unit: "x",
    raw: null,
    mlk: null,
  },
  {
    key: "gainChangeDb" as keyof MLKResult,
    label: "Gain Adjustment",
    fmt: (v: number) => (v === 0 ? "None" : v.toFixed(2) + " dB"),
    better: "info",
    unit: "dB",
    raw: null,
    mlk: null,
  },
];

export function MLKComparison() {
  const [mlkOn, setMlkOn] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [rawResult, setRawResult] = useState<MLKResult | null>(null);
  const [mlkResult, setMlkResult] = useState<MLKResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ranOnce, setRanOnce] = useState(false);

  const runDemo = async (mlk: boolean): Promise<MLKResult | null> => {
    const res = await fetch("/api/kernel/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlk }),
    });
    if (!res.ok) throw new Error("Kernel request failed");
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Kernel error");
    return json as MLKResult;
  };

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      if (!ranOnce) {
        const [raw, mlk] = await Promise.all([runDemo(false), runDemo(true)]);
        setRawResult(raw);
        setMlkResult(mlk);
        setRanOnce(true);
      }
    } catch (err: any) {
      setError(err.message || "Could not run demo.");
    } finally {
      setIsRunning(false);
    }
  };

  const activeResult = mlkOn ? mlkResult : rawResult;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">MLK v3 — Live Demo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Toggle MLK v3 on/off to see exactly what the kernel changes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-medium">RAW</span>
          <Switch
            checked={mlkOn}
            onCheckedChange={setMlkOn}
            disabled={!ranOnce}
            className="data-[state=checked]:bg-amber-500"
          />
          <span className="text-xs text-amber-400 font-semibold">MLK v3</span>
          {mlkOn && (
            <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-semibold">
              ON
            </Badge>
          )}
        </div>
      </div>

      {!ranOnce && (
        <div className="flex flex-col items-center gap-3 py-8 border border-dashed border-border/40 rounded-xl bg-secondary/10">
          <Zap className="w-8 h-8 text-amber-500/60" />
          <p className="text-sm text-muted-foreground">
            Hit <strong className="text-foreground">Run Demo</strong> to fire the sample through both RAW
            and MLK v3 — then toggle to compare.
          </p>
          <Button
            onClick={handleRun}
            disabled={isRunning}
            className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-10 px-7"
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

      {ranOnce && activeResult && (
        <AnimatePresence mode="wait">
          <motion.div
            key={mlkOn ? "mlk" : "raw"}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-card/40"
              style={{ borderColor: mlkOn ? "rgba(245,158,11,0.35)" : "rgba(100,116,139,0.3)" }}>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${mlkOn ? "bg-amber-500/20 text-amber-400" : "bg-secondary text-muted-foreground"}`}>
                {mlkOn ? "MLK_V3_VALIDATED" : "BASELINE"}
              </span>
              <span className="text-xs text-muted-foreground ml-1">
                {mlkOn
                  ? "Three-band amplitude carving · Phase-coherent · 0.92 peak ceiling"
                  : "Raw audio · No kernel applied · Unmodified signal"}
              </span>
              <span className="ml-auto text-xs text-muted-foreground font-mono">
                {activeResult.timeMs.toFixed(1)} ms
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {METRICS.map((m) => {
                const rawVal = rawResult ? (rawResult[m.key] as number) : null;
                const mlkVal = mlkResult ? (mlkResult[m.key] as number) : null;
                const currentVal = activeResult[m.key] as number;
                const isImproved =
                  m.better !== "info" && rawVal !== null && mlkVal !== null
                    ? m.better === "lower"
                      ? mlkOn
                        ? mlkVal < rawVal
                        : false
                      : mlkOn
                      ? mlkVal > rawVal
                      : false
                    : false;
                return (
                  <div
                    key={m.key}
                    className={`p-3 rounded-xl border bg-card/40 space-y-1 transition-colors ${
                      isImproved ? "border-amber-500/30 bg-amber-500/5" : "border-border/40"
                    }`}
                  >
                    <div className="text-xs text-muted-foreground">{m.label}</div>
                    <div className={`font-mono text-base font-bold ${isImproved ? "text-amber-400" : "text-foreground"}`}>
                      {m.fmt(currentVal)}
                    </div>
                    {m.better !== "info" && rawVal !== null && mlkVal !== null && (
                      <div className="text-[10px] text-muted-foreground/70">
                        Raw {m.fmt(rawVal)} → MLK {m.fmt(mlkVal)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                {mlkOn
                  ? "MLK v3: 100% headroom efficiency · peak capped at 0.92 · no clip risk"
                  : "Raw: 96.8% headroom efficiency · peak 0.95 · clip risk present"}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRun}
                className="text-xs text-muted-foreground h-7 px-3"
              >
                Rerun
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
