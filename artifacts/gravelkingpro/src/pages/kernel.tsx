import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Play, FileText, Activity, Settings2, AlertCircle, Lock,
  Radio, Server, Wifi, WifiOff, Zap, History, Clock, User,
  LogOut, Shield,
} from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { generateKernelReport } from "@/lib/generateReport";
import { MLKComparison } from "@/components/mlk-comparison";

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

export default function KernelDashboard() {
  const { isPro, tier, results, setResults, hasRun, setHasRun } = useAppState();
  const { user, isAuthenticated, logout } = useAuth();
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

  const isNodeAuditor = tier === "node_auditor";
  const hasAccess = isPro;

  useEffect(() => {
    if (!hasAccess) return;
    fetch("/api/kernel/routing").then((r) => r.json()).then(setRouting).catch(() => {});
  }, [hasAccess]);

  useEffect(() => {
    if (!hasAccess || !isAuthenticated) return;
    fetch("/api/kernel/history", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setHistory(d.runs ?? []))
      .catch(() => {});
  }, [hasAccess, isAuthenticated, hasRun]);

  useEffect(() => {
    if (!hasAccess) return;
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
  }, [hasAccess]);

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

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">

        {/* ── PUBLIC: MLK v3 Before/After Demo ── */}
        <Card className="border-amber-500/25 bg-amber-500/5">
          <CardContent className="p-5">
            <MLKComparison />
          </CardContent>
        </Card>

        {/* ── PRO GATE ── */}
        {!hasAccess ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 pt-2">
              <div className="h-px flex-1 bg-border/40" />
              <span className="text-xs text-muted-foreground px-3">Full Dashboard — Pro Only</span>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <div className="flex flex-col items-center text-center space-y-4 py-6">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Lock className="w-5 h-5 text-amber-500" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold">Kernel Dashboard</h2>
                <p className="text-sm text-muted-foreground max-w-md">
                  Live telemetry, routing config, processing history, and PDF audit reports — restricted to <strong className="text-amber-400">Studio</strong> and <strong className="text-amber-400">Node Auditor</strong> subscribers.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left w-full max-w-sm">
                {[
                  "Live SSE telemetry stream",
                  "Kernel routing config (local / remote)",
                  "Signal throughput & decay rate metrics",
                  "Full processing history",
                  "Downloadable PDF audit reports",
                  "Node Auditor: remote endpoint access",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/30 border border-border/30 text-xs">
                    <Shield className="w-3 h-3 text-amber-500 shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
              <Link href="/pricing">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-10 px-8">
                  Upgrade to Studio — $29.99/mo
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">Node Auditor ($499) includes remote kernel endpoint access.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-2xl font-bold tracking-tight">Kernel Dashboard</h1>
                  {isNodeAuditor
                    ? <Badge className="bg-amber-500 text-black text-[10px]">Node Auditor</Badge>
                    : <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">Pro</Badge>
                  }
                </div>
                <p className="text-muted-foreground text-sm">GravelKing Kernel — MLK v3 amplitude carving engine.</p>
              </div>
              <div className="flex items-center gap-2">
                {user?.profileImageUrl
                  ? <img src={user.profileImageUrl} className="w-7 h-7 rounded-full" alt="avatar" />
                  : <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center"><User className="w-4 h-4 text-muted-foreground" /></div>
                }
                <span className="text-sm text-muted-foreground hidden sm:block">{user?.firstName ?? user?.email ?? "Account"}</span>
                <Button variant="ghost" size="sm" onClick={logout} className="text-xs text-muted-foreground h-8 px-2">
                  <LogOut className="w-3.5 h-3.5 mr-1" />Log out
                </Button>
              </div>
            </div>

            {/* Routing banner */}
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
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs bg-secondary/40 border border-border/30 rounded-md px-2.5 py-1.5 text-muted-foreground">
                          <WifiOff className="w-3.5 h-3.5" /><span>Remote — Not configured</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {liveEvents.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5 max-h-32 overflow-y-auto">
                      {liveEvents.map((ev, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${ev.routing === "remote" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>{ev.routing.toUpperCase()}</span>
                          <span className={`shrink-0 font-medium ${ev.parity === "VALIDATED" ? "text-emerald-400" : "text-red-400"}`}>{ev.parity}</span>
                          <span>eff {ev.efficiency} · decay {ev.decayRate} · {ev.sampleCount} samples</span>
                          <span className="ml-auto shrink-0">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Kernel controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-border/40 bg-card/40">
                <CardContent className="p-5 space-y-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Settings2 className="w-4 h-4 text-amber-500" />
                    <span className="font-medium text-sm">Parameters</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-sm">Signal Strength</label>
                      <span className="text-sm text-muted-foreground font-mono">{multiplier[0].toFixed(2)}</span>
                    </div>
                    <Slider value={multiplier} onValueChange={setMultiplier} max={2.0} min={0.1} step={0.01} disabled={isRunning} data-testid="slider-multiplier" />
                    <p className="text-xs text-muted-foreground">Controls amplitude carving on the kernel output</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm">Buffer Size</label>
                    <Select value={sliceSize} onValueChange={setSliceSize} disabled={isRunning}>
                      <SelectTrigger data-testid="select-buffersize"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 — minimal segments</SelectItem>
                        <SelectItem value="2">2 — standard (default)</SelectItem>
                        <SelectItem value="4">4 — extended</SelectItem>
                        <SelectItem value="8">8 — deep buffer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold h-11" onClick={handleRun} disabled={isRunning} data-testid="button-run">
                    {isRunning ? "Processing kernel..." : <><Play className="w-4 h-4 mr-2 fill-current" />Run Analysis</>}
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

              <Card className="border-border/40 bg-card/40 relative overflow-hidden">
                {!hasRun && !isRunning && liveEvents.length === 0 && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/50 backdrop-blur-[2px]">
                    <Activity className="w-8 h-8 text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground text-sm font-medium mb-4">No data yet</p>
                    <Button variant="outline" onClick={handleRun} data-testid="button-run-empty">Start Analysis</Button>
                  </div>
                )}
                <CardContent className="p-5 space-y-3 min-h-[280px]">
                  <span className="font-medium text-sm">Telemetry</span>
                  <AnimatePresence>
                    {results && !isRunning && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 pt-2">
                        {([
                          { label: "Signal Throughput", value: results.throughput },
                          { label: "Stability", value: results.stability },
                          { label: "Efficiency", value: results.efficiency },
                          { label: "Decay Rate", value: results.decayRate },
                        ] as { label: string; value: string }[]).map((metric) => (
                          <div key={metric.label} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border/50">
                            <span className="text-sm text-muted-foreground">{metric.label}</span>
                            <span className="font-mono text-sm font-semibold text-emerald-400">{metric.value}</span>
                          </div>
                        ))}
                        <Button variant="secondary" className="w-full mt-2" onClick={handleDownload} data-testid="button-download-report">
                          <FileText className="w-4 h-4 mr-2" />Download PDF Report
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </div>

            {/* Processing history */}
            {isAuthenticated && history.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card className="border-border/40 bg-card/30">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <History className="w-4 h-4 text-amber-500" />
                      <span className="font-medium text-sm">Processing History</span>
                      <Badge variant="outline" className="text-xs ml-auto">{history.length} runs</Badge>
                    </div>
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {history.map((run) => (
                        <div key={run.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/40 border border-border/40 text-xs">
                          <span className={`shrink-0 px-1.5 py-0.5 rounded font-semibold ${run.routing === "remote" ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"}`}>
                            {run.routing.toUpperCase()}
                          </span>
                          <span className={`shrink-0 font-medium ${run.parity === "VALIDATED" ? "text-emerald-400" : "text-red-400"}`}>{run.parity}</span>
                          <span className="text-muted-foreground truncate flex-1">{run.fileName ?? "kernel analysis"}</span>
                          <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                            <Clock className="w-3 h-3" />{new Date(run.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </>
        )}

      </motion.div>
    </Layout>
  );
}
