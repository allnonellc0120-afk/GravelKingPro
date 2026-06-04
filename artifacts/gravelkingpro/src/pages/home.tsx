import { useState } from "react";
import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, CheckCircle2, ChevronRight, FileText, Lock, Play, Settings2 } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const { isPro, results, setResults, hasRun, setHasRun } = useAppState();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [multiplier, setMultiplier] = useState([0.75]);
  const [sliceSize, setSliceSize] = useState("2");
  const [parityStatus, setParityStatus] = useState<"VALIDATED" | "KERNEL_VIOLATION" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleRun = async () => {
    setIsRunning(true);
    setProgress(0);
    setHasRun(false);
    setError(null);
    setParityStatus(null);

    // Animate progress while waiting for the API
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 8, 90);
      setProgress(currentProgress);
    }, 150);

    try {
      const response = await fetch("/api/kernel/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          multiplier: multiplier[0],
          slice_size: parseInt(sliceSize),
        }),
      });

      const json = await response.json();

      clearInterval(interval);
      setProgress(100);

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Kernel returned an error.");
      }

      const { stats } = json.data;

      setParityStatus(json.status);
      setResults({
        throughput: `${stats.originalSum.toLocaleString()} → ${stats.carvedSum.toFixed(2)}`,
        stability: json.status === "VALIDATED" ? "100%" : "FAILED",
        efficiency: `${(stats.efficiency * 100).toFixed(1)}%`,
        decayRate: `${(stats.decayRate * 100).toFixed(1)}%`,
        originalSum: stats.originalSum,
        carvedSum: stats.carvedSum,
      });
      setHasRun(true);
    } catch (err: any) {
      clearInterval(interval);
      setProgress(0);
      setError(err.message || "Could not reach the GravelKing kernel.");
      toast({ title: "Kernel error", description: err.message, variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  const getStatusDisplay = () => {
    if (error) return { label: "Error", color: "text-red-500", dot: "bg-red-500" };
    if (isRunning) return { label: "Running", color: "text-blue-400", dot: "bg-blue-400 animate-pulse" };
    if (hasRun) return { label: "Complete", color: "text-emerald-500", dot: "bg-emerald-500" };
    return { label: "Standby", color: "text-amber-500", dot: "bg-amber-500" };
  };

  const status = getStatusDisplay();

  return (
    <Layout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl mx-auto space-y-6"
      >
        {/* Status Card */}
        <Card className="border-border/40 bg-card/40">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <Activity className={`w-6 h-6 ${status.color}`} />
              </div>
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-1">System Status</h2>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${status.dot}`} />
                  <span className="text-xl font-semibold tracking-tight">{status.label}</span>
                </div>
              </div>
            </div>
            {!isRunning && !hasRun && !error && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1 text-sm font-normal">
                Ready
              </Badge>
            )}
            {parityStatus && hasRun && (
              <Badge
                variant="outline"
                className={
                  parityStatus === "VALIDATED"
                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1 text-sm font-normal"
                    : "bg-red-500/10 text-red-500 border-red-500/20 px-3 py-1 text-sm font-normal"
                }
              >
                {parityStatus === "VALIDATED" ? "Parity Validated" : "Parity Violation"}
              </Badge>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Controls */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-amber-500" />
                Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Signal Strength</label>
                  <span className="text-sm text-muted-foreground font-mono">{multiplier[0].toFixed(2)}</span>
                </div>
                <Slider
                  value={multiplier}
                  onValueChange={setMultiplier}
                  max={2.0}
                  min={0.1}
                  step={0.01}
                  disabled={isRunning}
                  data-testid="slider-multiplier"
                />
                <p className="text-xs text-muted-foreground">Controls amplitude carving on the kernel output</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Buffer Size</label>
                <Select value={sliceSize} onValueChange={setSliceSize} disabled={isRunning}>
                  <SelectTrigger data-testid="select-buffersize">
                    <SelectValue placeholder="Select buffer size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — minimal segments</SelectItem>
                    <SelectItem value="2">2 — standard (default)</SelectItem>
                    <SelectItem value="4">4 — extended</SelectItem>
                    <SelectItem value="8">8 — deep buffer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Subsegment allocation per stem nest</p>
              </div>

              <Button
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold h-12 mt-4"
                onClick={handleRun}
                disabled={isRunning}
                data-testid="button-run"
              >
                {isRunning ? (
                  <>Processing kernel...</>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2 fill-current" />
                    Run Analysis
                  </>
                )}
              </Button>

              {isRunning && (
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Running gravelking_opt...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 mt-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          <Card className="border-border/40 bg-card/40 relative overflow-hidden">
            {!hasRun && !isRunning && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/50 backdrop-blur-[2px]">
                <p className="text-muted-foreground text-sm font-medium mb-4">No data to display</p>
                <Button variant="outline" onClick={handleRun} data-testid="button-run-empty">
                  Start Analysis
                </Button>
              </div>
            )}

            <CardHeader>
              <CardTitle className="text-lg">Telemetry</CardTitle>
              <CardDescription>Live kernel output metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 min-h-[220px]">
                <AnimatePresence>
                  {results && !isRunning && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-3"
                    >
                      {[
                        { label: "Signal Throughput", value: results.throughput },
                        { label: "Stability", value: results.stability },
                        { label: "Efficiency", value: results.efficiency },
                        { label: "Decay Rate", value: results.decayRate },
                      ].map((metric) => (
                        <div
                          key={metric.label}
                          className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/50"
                        >
                          <span className="text-sm font-medium text-muted-foreground">{metric.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-emerald-400">{metric.value}</span>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          </div>
                        </div>
                      ))}

                      <Button
                        variant="secondary"
                        className="w-full mt-2"
                        onClick={() =>
                          toast({ title: "Report ready", description: "Your analysis report is downloading." })
                        }
                        data-testid="button-download-report"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Download Report
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upgrade Banner */}
        {!isPro && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-amber-500" />
              <p className="text-sm text-amber-500/90 font-medium">
                You're on the free plan — unlock full metrics and unlimited runs.
              </p>
            </div>
            <Link
              href="/pricing"
              className="text-sm font-semibold text-amber-500 hover:text-amber-400 flex items-center"
              data-testid="link-upgrade-banner"
            >
              Upgrade <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
}
