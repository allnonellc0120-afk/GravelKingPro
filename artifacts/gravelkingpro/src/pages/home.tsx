import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { useAuth } from "@workspace/replit-auth-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Scissors, Mic2, Wand2, Layers, ChevronRight, Play,
  CheckCircle2, Lock, LogIn, Zap, History, Clock, Radio,
  Server, Wifi, WifiOff, User, LogOut, FileText, Activity,
  Settings2, AlertCircle,
} from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { generateKernelReport } from "@/lib/generateReport";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

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

const FEATURES = [
  {
    icon: <Mic2 className="w-6 h-6 text-purple-400" />,
    title: "Voice Removal",
    description: "Strip vocals from any stereo track using center-channel cancellation. Get a clean instrumental in seconds.",
    badge: "1 Free Use",
    badgeColor: "border-sky-500/40 text-sky-400",
    href: "/studio",
    cta: "Try it free",
  },
  {
    icon: <Scissors className="w-6 h-6 text-emerald-400" />,
    title: "Stem Splitting",
    description: "Separate bass, midrange, highs, and instrumental stems — download each as a clean WAV file.",
    badge: "1 Free Use",
    badgeColor: "border-sky-500/40 text-sky-400",
    href: "/studio",
    cta: "Try it free",
  },
  {
    icon: <Wand2 className="w-6 h-6 text-sky-400" />,
    title: "Audio Mastering",
    description: "6 professional presets: Normal (free), Broadcast, Vinyl, Podcast, Club, and Film. One click to a polished master.",
    badge: "Normal Free",
    badgeColor: "border-emerald-500/40 text-emerald-400",
    href: "/studio",
    cta: "Master now",
  },
  {
    icon: <Layers className="w-6 h-6 text-amber-400" />,
    title: "Mix Studio",
    description: "Multi-track editor with speed/pitch control, noise reduction, 5 voice effects, and layer mixing.",
    badge: "Pro",
    badgeColor: "border-amber-500/40 text-amber-400",
    href: "/mix",
    cta: "Open Studio",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    color: "border-border/30",
    features: ["Basic kernel analysis", "1 free voice/stem split", "Normal mastering preset", "Audio preview"],
  },
  {
    name: "GravelKing Splits",
    price: "$9.99",
    period: "/mo",
    color: "border-emerald-500/40 bg-emerald-500/5",
    highlight: true,
    badge: "Most Popular",
    badgeColor: "bg-emerald-500 text-black",
    features: ["Unlimited voice removal", "Unlimited stem splitting", "All 6 mastering presets", "Download all stems as WAV", "Processing history"],
  },
  {
    name: "GravelKing Pro",
    price: "$39.99",
    period: "/mo",
    color: "border-amber-500/40 bg-amber-500/5",
    badge: "Full Studio",
    badgeColor: "bg-amber-500 text-black",
    features: ["Everything in Splits", "Full Mix Studio access", "Waveform visualization", "Kernel metrics & PDF reports", "Priority support"],
  },
];

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

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-12">

        {/* ── Hero ── */}
        <div className="text-center space-y-5 pt-4">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-amber-400">
            <Zap className="w-3.5 h-3.5" /> Server-side audio processing — your files never leave our servers
          </div>
          <h1 className="text-4xl font-bold tracking-tight leading-tight">
            Professional audio tools,<br />
            <span className="text-amber-500">no plugin required.</span>
          </h1>
          <p className="text-muted-foreground text-base max-w-xl mx-auto">
            GravelKingPro handles voice removal, stem splitting, mastering, and multi-track mixing entirely on the server. Upload a file — done in seconds.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/studio">
              <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold h-11 px-6">
                <Play className="w-4 h-4 mr-2 fill-current" /> Open Studio — It's Free
              </Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline" className="h-11 px-6 border-border/40">
                See Pricing <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
          {!isAuthenticated && (
            <p className="text-xs text-muted-foreground">
              <button onClick={login} className="text-amber-500 underline underline-offset-2 cursor-pointer">Sign in</button> to save your processing history and unlock your free trial.
            </p>
          )}
        </div>

        {/* ── Features ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">What you can do</h2>
            <Link href="/studio" className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1">
              Open Studio <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                <Link href={f.href}>
                  <Card className="border-border/30 bg-card/40 hover:border-border/60 hover:bg-card/60 transition-all cursor-pointer h-full group">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="w-10 h-10 rounded-lg bg-secondary/60 flex items-center justify-center">
                          {f.icon}
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${f.badgeColor}`}>{f.badge}</Badge>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1 group-hover:text-amber-400 transition-colors">{f.title}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-amber-500 font-medium">
                        {f.cta} <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Pricing Strip ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Simple pricing</h2>
            <Link href="/pricing" className="text-xs text-amber-500 hover:text-amber-400 flex items-center gap-1">
              Full details <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map((plan, i) => (
              <motion.div key={plan.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
                <Card className={`border h-full ${plan.color}`}>
                  <CardContent className="p-5 space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{plan.name}</span>
                        {plan.badge && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${plan.badgeColor}`}>{plan.badge}</span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-0.5">
                        <span className="text-2xl font-bold">{plan.price}</span>
                        {plan.period && <span className="text-xs text-muted-foreground">{plan.period}</span>}
                      </div>
                    </div>
                    <ul className="space-y-1.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Link href="/pricing">
                      <Button
                        variant={plan.highlight ? "default" : "outline"}
                        size="sm"
                        className={`w-full text-xs ${plan.highlight ? "bg-emerald-500 hover:bg-emerald-600 text-black font-semibold" : plan.badge === "Full Studio" ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10" : ""}`}
                      >
                        {plan.price === "Free" ? "Get Started" : `Get ${plan.name.replace("GravelKing ", "")}`}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="border-t border-border/20 pt-6">
          <p className="text-xs text-muted-foreground text-center mb-6 uppercase tracking-wider font-medium">Kernel Dashboard</p>

          {/* Auth row */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">Run a kernel analysis or view your processing history below.</p>
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  {user?.profileImageUrl
                    ? <img src={user.profileImageUrl} className="w-7 h-7 rounded-full" alt="avatar" />
                    : <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center"><User className="w-4 h-4 text-muted-foreground" /></div>
                  }
                  <span className="text-sm text-muted-foreground hidden sm:block">{user?.firstName ?? user?.email ?? "Account"}</span>
                  <Button variant="ghost" size="sm" onClick={logout} className="text-xs text-muted-foreground h-8 px-2">
                    <LogOut className="w-3.5 h-3.5 mr-1" />Log out
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={login} className="h-8 text-xs">
                  <LogIn className="w-3.5 h-3.5 mr-1.5" />Log in to save history
                </Button>
              )}
            </div>
          </div>

          {/* Routing banner */}
          {routing && (
            <Card className="border-border/40 bg-card/30 mb-4">
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6">
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
        </div>

      </motion.div>
    </Layout>
  );
}
