import { useState } from "react";
import { Layout } from "@/components/layout";
import { ToolHelp } from "@/components/tool-help";
import { useAppState } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Cpu, Zap, Lock, CheckCircle2, Gauge, Sparkles, Server,
  Smartphone, Monitor, ArrowRight, Lightbulb, BarChart2, ShieldCheck, Loader2,
} from "lucide-react";

type Phase = "ready" | "done";

interface DeviceInfo {
  cores: number | null;
  memoryGb: number | null;
  browser: string;
  platform: string;
  isMobile: boolean;
}

interface ServerBench {
  gflops: number;
  peakGflops: number;
  matrixSize: number;
  demo: boolean;
}

const TUNED_STRENGTH = 0.75;

function detectDevice(): DeviceInfo {
  const nav = navigator as unknown as { deviceMemory?: number };
  const ua = navigator.userAgent;
  let browser = "your browser";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/safari/i.test(ua)) browser = "Safari";
  const isMobile = /mobi|android|iphone|ipad|ipod/i.test(ua);
  let platform = isMobile ? "Mobile device" : "Desktop";
  if (/iphone|ipad|ipod/i.test(ua)) platform = "iOS";
  else if (/android/i.test(ua)) platform = "Android";
  else if (/mac/i.test(navigator.platform)) platform = "macOS";
  else if (/win/i.test(navigator.platform)) platform = "Windows";
  else if (/linux/i.test(navigator.platform)) platform = "Linux";
  return {
    cores: navigator.hardwareConcurrency || null,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    browser,
    platform,
    isMobile,
  };
}

function ConfigRow({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/30 bg-card/40 p-3">
      <div className="mt-0.5 shrink-0 text-emerald-400">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-emerald-300/90 font-mono break-words">{value}</p>
        {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
      </div>
    </div>
  );
}

function DeviceStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/20 bg-card/30 p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-mono text-foreground/90">{value}</p>
    </div>
  );
}

export default function Optimizer() {
  const { isPro, tier, hasSplits, isLoadingSubscription, sepStrength, setSepStrength } = useAppState();
  const unlocked = isPro || tier === "node_auditor";

  const [phase, setPhase] = useState<Phase>("ready");
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [bench, setBench] = useState<ServerBench | null>(null);
  const [benchState, setBenchState] = useState<"idle" | "running" | "done" | "unavailable">("idle");

  const planName =
    tier === "node_auditor" ? "Node Auditor"
    : tier === "monthly" ? "Pro Plus (Studio)"
    : tier === "weekly" ? "Weekly"
    : "Free";

  const formatLabel = hasSplits ? "WAV · lossless 44.1 kHz" : "MP3 · 320 kbps";
  const limitLabel = hasSplits ? "Unlimited runs" : "Free mastering preview";

  function runOptimize() {
    setDevice(detectDevice());
    // Auto-apply the one setting we can safely tune: the tuned separation strength.
    // It persists and is read by Voice Removal and Studio. You can fine-tune it below.
    setSepStrength(TUNED_STRENGTH);
    setPhase("done");
  }

  async function runBenchmark() {
    setBenchState("running");
    try {
      const res = await fetch("/api/mlk/benchmark/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ matrixSize: 4096, iterations: 8 }),
      });
      if (!res.ok) throw new Error("unavailable");
      const data = await res.json() as { gflops: number; peakGflops: number; matrixSize: number; demo: boolean };
      setBench({
        gflops: data.gflops,
        peakGflops: data.peakGflops,
        matrixSize: data.matrixSize,
        demo: !!data.demo,
      });
      setBenchState("done");
    } catch {
      setBench(null);
      setBenchState("unavailable");
    }
  }

  // ── Loading state (subscription resolving) ────────────────────────────────
  if (isLoadingSubscription) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto py-24 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Checking your plan…
        </div>
      </Layout>
    );
  }

  // ── Locked (paid feature) ─────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold tracking-tight">MLK V3.5 Quality Optimizer</h1>
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">Pro Plus</Badge>
          </div>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-12 flex flex-col items-center text-center gap-5">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Lock className="w-7 h-7 text-amber-400" />
              </div>
              <div className="space-y-2 max-w-md">
                <p className="font-semibold">A Pro Plus feature</p>
                <p className="text-sm text-muted-foreground">
                  The Quality Optimizer tunes your separation settings for your plan, gives
                  honest recommendations to improve speed and quality, and runs a live
                  throughput benchmark of the servers that process your audio.
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 w-full max-w-xl text-left">
                {[
                  { icon: <Sparkles className="w-4 h-4 text-amber-400" />, t: "Auto-tuned settings", d: "Best separation settings for your plan, applied to your account" },
                  { icon: <Lightbulb className="w-4 h-4 text-amber-400" />, t: "Honest recommendations", d: "Device + plan tips — no fabricated claims" },
                  { icon: <Server className="w-4 h-4 text-amber-400" />, t: "Live server benchmark", d: "Real throughput of our processing servers" },
                ].map((f) => (
                  <div key={f.t} className="rounded-lg border border-border/30 bg-card/40 p-3 space-y-1">
                    {f.icon}
                    <p className="text-sm font-medium">{f.t}</p>
                    <p className="text-xs text-muted-foreground">{f.d}</p>
                  </div>
                ))}
              </div>
              <Link href="/pricing">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                  See plans <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // ── Unlocked ──────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h1 className="text-2xl font-bold tracking-tight">MLK V3.5 Quality Optimizer</h1>
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">{planName}</Badge>
            <ToolHelp
              title="Quality Optimizer"
              summary="Applies the best separation settings your plan allows and gives honest, specific recommendations to get the most out of GravelKing."
              steps={[
                "Press Optimize — we detect your device and apply the recommended settings to your account.",
                "Review the applied configuration and fine-tune separation strength if you want.",
                "Optionally run a live benchmark of our processing servers.",
              ]}
              note="Your audio is processed on our servers, so results are the same on any device. Your device specs only affect the in-browser live Studio/DAW."
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Honest tuning — we apply the best settings your plan allows and tell you exactly
            what does and doesn't move the needle. No fabricated metrics.
          </p>
        </div>

        {phase === "ready" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="py-12 flex flex-col items-center text-center gap-5">
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Gauge className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="space-y-2 max-w-md">
                  <p className="font-semibold">Optimize your setup</p>
                  <p className="text-sm text-muted-foreground">
                    We'll detect your device, apply the recommended separation settings to
                    your account, and show honest recommendations for your plan.
                  </p>
                </div>
                <Button onClick={runOptimize} className="bg-emerald-600 hover:bg-emerald-700" data-testid="button-optimize">
                  <Zap className="w-4 h-4 mr-1.5" /> Optimize
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            {/* Applied configuration */}
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Applied to your account
                </CardTitle>
                <CardDescription>The best settings your {planName} plan allows are active.</CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-3">
                <ConfigRow
                  icon={<Sparkles className="w-4 h-4" />}
                  label="Separation engine"
                  value="Neural AI (Demucs)"
                  note="Primary on every run, with an instant on-server fallback if the AI engine is busy."
                />
                <ConfigRow
                  icon={<ShieldCheck className="w-4 h-4" />}
                  label="Output format"
                  value={formatLabel}
                  note={hasSplits ? "Lossless downloads on your plan." : "Free tier outputs MP3. Upgrade for lossless WAV."}
                />
                <ConfigRow
                  icon={<Gauge className="w-4 h-4" />}
                  label="Run allowance"
                  value={limitLabel}
                />
                <ConfigRow
                  icon={<Cpu className="w-4 h-4" />}
                  label="Separation strength"
                  value={sepStrength.toFixed(2)}
                  note="Applied to Voice Removal and Studio. Tuned default — adjust below."
                />
              </CardContent>
            </Card>

            {/* Fine-tune separation strength */}
            <Card className="border-border/30 bg-card/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" /> Fine-tune separation strength
                </CardTitle>
                <CardDescription>
                  Controls how aggressively the MLK v3 kernel carves the separated audio. This changes the
                  character of the result, not the processing speed. {TUNED_STRENGTH.toFixed(2)} is our tuned default.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Lighter carve</span>
                  <span className="text-sm font-mono text-emerald-300">{sepStrength.toFixed(2)}</span>
                  <span className="text-sm text-muted-foreground">Deeper carve</span>
                </div>
                <Slider
                  value={[sepStrength]}
                  onValueChange={(v) => setSepStrength(v[0])}
                  min={0.1}
                  max={2.0}
                  step={0.01}
                  data-testid="slider-optimizer-strength"
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="border-border/40" onClick={() => setSepStrength(TUNED_STRENGTH)}>
                    Reset to recommended
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card className="border-border/30 bg-card/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400" /> Recommendations
                </CardTitle>
                <CardDescription>Specific, honest ways to get better and faster results.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {!hasSplits && (
                  <div className="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                    <ArrowRight className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Upgrade for lossless WAV + unlimited runs</p>
                      <p className="text-xs text-muted-foreground">
                        You already get neural AI separation on every run. A paid plan unlocks lossless
                        WAV output and removes run limits — the biggest available quality upgrade.{" "}
                        <Link href="/pricing" className="text-amber-400 hover:underline">See plans</Link>.
                      </p>
                    </div>
                  </div>
                )}
                {device?.isMobile && (
                  <div className="flex items-start gap-3 rounded-lg border border-border/30 p-3">
                    <Smartphone className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Use a desktop browser for the live Studio</p>
                      <p className="text-xs text-muted-foreground">
                        Every audio tool works on mobile, but the live Studio/DAW (real-time mixing)
                        runs smoother on a desktop browser.
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3 rounded-lg border border-border/30 p-3">
                  <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Start from the highest-quality source</p>
                    <p className="text-xs text-muted-foreground">
                      Separation is cleanest from a WAV or FLAC source. A low-bitrate MP3 limits the
                      result no matter which engine runs.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border/30 p-3">
                  <Server className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Your device never bottlenecks quality</p>
                    <p className="text-xs text-muted-foreground">
                      Processing runs on our servers, so you get identical results on any device.
                      Keep individual files reasonably short for the fastest turnaround.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detected device */}
            {device && (
              <Card className="border-border/30 bg-card/40">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Monitor className="w-4 h-4 text-sky-400" /> Your device
                  </CardTitle>
                  <CardDescription>Detected in your browser — affects only the in-browser live Studio/DAW.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <DeviceStat icon={<Cpu className="w-3.5 h-3.5" />} label="CPU cores" value={device.cores ? String(device.cores) : "Not reported"} />
                  <DeviceStat icon={<BarChart2 className="w-3.5 h-3.5" />} label="Memory" value={device.memoryGb ? `~${device.memoryGb} GB` : "Not reported"} />
                  <DeviceStat icon={<Monitor className="w-3.5 h-3.5" />} label="Platform" value={device.platform} />
                  <DeviceStat icon={<Sparkles className="w-3.5 h-3.5" />} label="Browser" value={device.browser} />
                </CardContent>
              </Card>
            )}

            {/* Optional server benchmark */}
            <Card className="border-border/30 bg-card/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" /> Processing-server benchmark
                </CardTitle>
                <CardDescription>
                  A live DGEMM throughput test of the GravelKing servers that process your audio —
                  not your device.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {benchState === "done" && bench && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <DeviceStat icon={<Zap className="w-3.5 h-3.5" />} label="Avg throughput" value={`${bench.gflops.toFixed(1)} GFLOPS`} />
                    <DeviceStat icon={<Gauge className="w-3.5 h-3.5" />} label="Peak" value={`${bench.peakGflops.toFixed(1)} GFLOPS`} />
                    <DeviceStat icon={<Cpu className="w-3.5 h-3.5" />} label="Matrix" value={`${bench.matrixSize}²`} />
                  </div>
                )}
                {benchState === "done" && bench?.demo && (
                  <p className="text-xs text-muted-foreground">Sample benchmark (small matrix) — representative, not a full production run.</p>
                )}
                {benchState === "unavailable" && (
                  <p className="text-xs text-muted-foreground">The benchmark runner is momentarily unavailable. Try again shortly.</p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border/40"
                  onClick={() => void runBenchmark()}
                  disabled={benchState === "running"}
                  data-testid="button-run-benchmark"
                >
                  {benchState === "running"
                    ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Running…</>
                    : <><BarChart2 className="w-3.5 h-3.5 mr-1.5" /> {bench ? "Run again" : "Run benchmark"}</>}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
