import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Activity, AlertCircle, CheckCircle2, ChevronRight, FileText,
  Lock, Play, Settings2, Radio, Server, Wifi, WifiOff, Zap,
  LogIn, LogOut, User, History, Clock,
} from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { generateKernelReport } from "@/lib/generateReport";

type RoutingConfig = {
  mode: "local" | "remote_with_fallback";
  remoteUrl: string | null;
  remoteStatus: "online" | "offline" | "not_configured";
  localKernel: "active";
  authConfigured: boolean;
};

type LiveEvent = {
  routing: "remote" | "local";
  parity: string;
  efficiency: string;
  decayRate: string;
  sampleCount: string;
  timestamp: string;
  remoteUrl: string | null;
};

type HistoryRun = {
  id: number;
  routing: string;
  parity: string;
  efficiency: number | null;
  decayRate: number | null;
  sampleCount: number | null;
  fileName: string | null;
  createdAt: string;
};

export default function Home() {
  const { isPro, results, setResults, hasRun, setHasRun } = useAppState();
  const { user, isAuthenticated, login, logout } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [multiplier, setMultiplier] = useState([0.75]);
  const [sliceSize, setSliceSize] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [routing, setRouting] = useState<RoutingConfig | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [sseConnected, setSseConnected] = useState(false);
  const [history, setHistory] = useState<HistoryRun[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetch("/api/kernel/routing").then((r) => r.json()).then(setRouting).catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetch("/api/kernel/history", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => setHistory(d.runs ?? []))
        .catch(() => {});
    }
  }, [isAuthenticated, hasRun]);

  useEffect(() => {
    const es = new EventSource("/api/kernel/telemetry");
    eventSourceRef.current = es;
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);
    es.onmessage = (e) => {
      try {
        const event: LiveEvent = JSON.parse(e.data);
        setLiveEvents((prev) => [event, ...prev].slice(0, 10));
      } catch { /* ignore */ }
    };
    return () => { es.close(); setSseConnected(false); };
  }, []);

  const handleRun = async () => {
    setIsRunning(true);
    setProgress(0);
    setHasRun(false);
    setError(null);

    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 8, 90);
      setProgress(currentProgress);
    }, 150);

    try {
      const response = await fetch("/api/kernel/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ multiplier: multiplier[0], slice_size: parseInt(sliceSize) }),
      });

      const json = await response.json();
      clearInterval(interval);
      setProgress(100);

      if (!response.ok || !json.success) throw new Error(json.error || "Kernel returned an error.");

      const { stats } = json.data;
      const parityStatus: "VALIDATED" | "KERNEL_VIOLATION" = json.status;

      setResults({
        throughput: `${stats.originalSum} → ${stats.carvedSum.toFixed(2)}`,
        stability: parityStatus === "VALIDATED" ? "100%" : "FAILED",
        efficiency: `${(stats.efficiency * 100).toFixed(1)}%`,
        decayRate: `${(stats.decayRate * 100).toFixed(1)}%`,
        originalSum: stats.originalSum,
        carvedSum: stats.carvedSum,
        parityStatus,
        multiplier: multiplier[0],
        sliceSize: parseInt(sliceSize),
        runDate: new Date().toLocaleString(),
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

  const handleDownload = () => {
    if (!results) return;
    generateKernelReport({
      multiplier: results.multiplier,
      sliceSize: results.sliceSize,
      throughput: results.throughput,
      stability: results.stability,
      efficiency: results.efficiency,
      decayRate: results.decayRate,
      originalSum: results.originalSum,
      carvedSum: results.carvedSum,
      parityStatus: results.parityStatus,
      runDate: results.runDate,
    });
    toast({ title: "Report downloaded", description: "Your PDF is ready." });
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
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">

        {/* Value Proposition + Auth Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Professional audio carving,{" "}
              <span className="text-amber-500">server-side and private.</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload any audio file. The GravelKing kernel processes it on secure servers — your algorithm never leaves the machine.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                {user?.profileImageUrl ? (
                  <img src={user.profileImageUrl} className="w-7 h-7 rounded-full" alt="avatar" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <span className="text-sm text-muted-foreground hidden sm:block">
                  {user?.firstName ?? user?.email ?? "Account"}
                </span>
                <Button variant="ghost" size="sm" onClick={logout} className="text-xs text-muted-foreground h-8 px-2">
                  <LogOut className="w-3.5 h-3.5 mr-1" />Log out
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={login} className="h-8 text-xs">
                <LogIn className="w-3.5 h-3.5 mr-1.5" />Log in to save history
              </Button>
            )}
          </div>
        </div>

        {/* Routing Telemetry Banner */}
        {routing && (
          <Card className="border-border/40 bg-card/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium">Kernel Routing</span>
                  <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${sseConnected ? "bg-emerald-500/10 text-emerald-400" : "bg-secondary text-muted-foreground"}`}>
                    <Zap className="w-3 h-3" />{sseConnected ? "Live" : "Connecting..."}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs bg-secondary/60 rounded-md px-2.5 py-1.5">
                    <Server className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-400 font-medium">Local — Active</span>
                  </div>
                  <span className="text-muted-foreground text-xs">→</span>
                  {routing.mode === "remote_with_fallback" ? (
                    <div className={`flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1.5 border ${routing.remoteStatus === "online" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
                      {routing.remoteStatus === "online" ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                      <span className="font-medium">Remote — {routing.remoteStatus === "online" ? "Online" : "Offline (local fallback)"}</span>
                      {routing.authConfigured && <Badge variant="outline" className="text-[10px] px-1 py-0 border-emerald-500/30 text-emerald-400 ml-1">Auth ✓</Badge>}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs bg-secondary/40 border border-border/30 rounded-md px-2.5 py-1.5 text-muted-foreground">
                      <WifiOff className="w-3.5 h-3.5" /><span>Remote — Not configured</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1 text-sm font-normal">Ready</Badge>
            )}
            {results && hasRun && (
              <Badge variant="outline" className={results.parityStatus === "VALIDATED" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-3 py-1 text-sm font-normal" : "bg-red-500/10 text-red-500 border-red-500/20 px-3 py-1 text-sm font-normal"}>
                {results.parityStatus === "VALIDATED" ? "Parity Validated" : "Parity Violation"}
              </Badge>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Controls */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-amber-500" />Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Signal Strength</label>
                  <span className="text-sm text-muted-foreground font-mono">{multiplier[0].toFixed(2)}</span>
                </div>
                <Slider value={multiplier} onValueChange={setMultiplier} max={2.0} min={0.1} step={0.01} disabled={isRunning} data-testid="slider-multiplier" />
                <p className="text-xs text-muted-foreground">Controls amplitude carving on the kernel output</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Buffer Size</label>
                <Select value={sliceSize} onValueChange={setSliceSize} disabled={isRunning}>
                  <SelectTrigger data-testid="select-buffersize"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — minimal segments</SelectItem>
                    <SelectItem value="2">2 — standard (default)</SelectItem>
                    <SelectItem value="4">4 — extended</SelectItem>
                    <SelectItem value="8">8 — deep buffer</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Subsegment allocation per stem nest</p>
              </div>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold h-12" onClick={handleRun} disabled={isRunning} data-testid="button-run">
                {isRunning ? <>Processing kernel...</> : <><Play className="w-4 h-4 mr-2 fill-current" />Run Analysis</>}
              </Button>
              {isRunning && (
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Running gravelking_opt...</span><span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Telemetry */}
          <Card className="border-border/40 bg-card/40 relative overflow-hidden">
            {!hasRun && !isRunning && liveEvents.length === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/50 backdrop-blur-[2px]">
                <p className="text-muted-foreground text-sm font-medium mb-4">No data to display</p>
                <Button variant="outline" onClick={handleRun} data-testid="button-run-empty">Start Analysis</Button>
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
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                      {([
                        { label: "Signal Throughput", value: results.throughput },
                        { label: "Stability", value: results.stability },
                        { label: "Efficiency", value: results.efficiency },
                        { label: "Decay Rate", value: results.decayRate },
                      ] as { label: string; value: string }[]).map((metric) => (
                        <div key={metric.label} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/50">
                          <span className="text-sm font-medium text-muted-foreground">{metric.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-emerald-400">{metric.value}</span>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          </div>
                        </div>
                      ))}
                      <Button variant="secondary" className="w-full mt-2" onClick={handleDownload} data-testid="button-download-report">
                        <FileText className="w-4 h-4 mr-2" />Download PDF Report
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Event Stream */}
        {liveEvents.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-border/40 bg-card/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />Live Event Stream
                  <Badge variant="outline" className="text-xs ml-auto border-emerald-500/30 text-emerald-400">
                    {liveEvents.length} event{liveEvents.length !== 1 ? "s" : ""}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  <AnimatePresence initial={false}>
                    {liveEvents.map((event, i) => (
                      <motion.div key={event.timestamp + i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/40 border border-border/40 font-mono text-xs">
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold ${event.routing === "remote" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                          {event.routing.toUpperCase()}
                        </span>
                        <span className="text-muted-foreground shrink-0">{new Date(event.timestamp).toLocaleTimeString()}</span>
                        <span className="text-foreground/70 truncate">
                          eff={event.efficiency} · decay={event.decayRate} · samples={event.sampleCount} · parity={event.parity}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Processing History */}
        {isAuthenticated && history.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-border/40 bg-card/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-500" />Processing History
                  <Badge variant="outline" className="text-xs ml-auto">{history.length} runs</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {history.map((run) => (
                    <div key={run.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/40 border border-border/40 text-xs">
                      <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${run.routing === "remote" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                        {run.routing.toUpperCase()}
                      </span>
                      <span className={`shrink-0 font-medium ${run.parity === "VALIDATED" ? "text-emerald-400" : "text-red-400"}`}>{run.parity}</span>
                      <span className="text-muted-foreground truncate flex-1">{run.fileName ?? "kernel analysis"}</span>
                      <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                        <Clock className="w-3 h-3" />
                        {new Date(run.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {isAuthenticated && history.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-2">
            Your run history will appear here after your first analysis.
          </div>
        )}

        {!isPro && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-amber-500" />
              <p className="text-sm text-amber-500/90 font-medium">You're on the free plan — unlock full metrics and unlimited runs.</p>
            </div>
            <Link href="/pricing" className="text-sm font-semibold text-amber-500 hover:text-amber-400 flex items-center" data-testid="link-upgrade-banner">
              Upgrade <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
}
