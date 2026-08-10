import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowRight, CheckCircle2, Clock3, FileCheck2, Fullscreen, LockKeyhole, Minimize2, RefreshCw, Server, ShieldCheck, TriangleAlert, XCircle, Zap } from "lucide-react";
import { Layout } from "@/components/layout";
import { AdminGate, useAdminAuth } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type HealthState = "checking" | "ok" | "error";

interface Health {
  state: HealthState;
  statusCode: number | null;
  latencyMs: number | null;
  serverMs: number | null;
  checkedAt: Date | null;
  message?: string;
}

interface KernelBenchResult {
  measuredAt: string;
  fixture: { durationS: number; bytes: number; kind: string };
  kernel: string;
  engine: string;
  completedLocally: boolean;
  runs: Array<{ run: number; processingMs: number; engine: string; numba: boolean; completedAt: string }>;
  summary: { runs: number; minMs: number; medianMs: number; maxMs: number; realtimeMultiplier: number | null };
  note: string;
}

interface E2eBenchResult {
  measuredAt: string;
  fixture: { durationS: number; bytes: number; kind: string };
  endpoint: string;
  kernelEngine: string | null;
  outputBytes: number;
  timings: {
    totalMs: number;
    uploadAndParseMs: number | null;
    kernelMs: number | null;
    serverOtherMs: number | null;
    serverTotalMs: number | null;
    networkAndResponseMs: number | null;
  };
  note: string;
}

type BenchState<T> =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: T }
  | { status: "error"; error: string };

async function postBenchmark<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string } & T;
  if (!res.ok || json.success === false) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json;
}

function fmtMs(v: number | null | undefined): string {
  return v == null ? "—" : `${v.toLocaleString()} ms`;
}

function EvidenceBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "good" | "warn" | "neutral" }) {
  const styles = {
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    neutral: "border-border/50 bg-secondary/30 text-muted-foreground",
  };
  return <Badge variant="outline" className={styles[tone]}>{children}</Badge>;
}

function JumpLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-md border border-border/50 bg-secondary/20 px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-amber-500/50 hover:text-amber-300"
    >
      {children}
    </a>
  );
}

function Metric({ value, label, detail }: { value: string; label: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-secondary/20 p-5">
      <div className="text-3xl font-mono font-bold tracking-tight text-foreground">{value}</div>
      <div className="mt-2 text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</div>
    </div>
  );
}

function SectionLabel({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-amber-500">{eyebrow}</div>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function IntegrationDemoDashboard() {
  const { logout } = useAdminAuth();
  const [screenShare, setScreenShare] = useState(false);
  const [health, setHealth] = useState<Health>({
    state: "checking",
    statusCode: null,
    latencyMs: null,
    serverMs: null,
    checkedAt: null,
  });
  const [kernelBench, setKernelBench] = useState<BenchState<KernelBenchResult>>({ status: "idle" });
  const [e2eBench, setE2eBench] = useState<BenchState<E2eBenchResult>>({ status: "idle" });

  const runKernelBench = useCallback(async () => {
    setKernelBench({ status: "running" });
    try {
      setKernelBench({ status: "done", result: await postBenchmark<KernelBenchResult>("/api/admin/benchmark/kernel") });
    } catch (err) {
      setKernelBench({ status: "error", error: err instanceof Error ? err.message : "Benchmark failed" });
    }
  }, []);

  const runE2eBench = useCallback(async () => {
    setE2eBench({ status: "running" });
    try {
      setE2eBench({ status: "done", result: await postBenchmark<E2eBenchResult>("/api/admin/benchmark/e2e") });
    } catch (err) {
      setE2eBench({ status: "error", error: err instanceof Error ? err.message : "Test failed" });
    }
  }, []);

  const checkHealth = useCallback(async () => {
    const started = performance.now();
    setHealth((current) => ({ ...current, state: "checking", message: undefined }));
    try {
      const response = await fetch("/api/healthz", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const latencyMs = Math.round(performance.now() - started);
      const body = (await response.json().catch(() => ({}))) as { serverMs?: number };
      setHealth({
        state: response.ok ? "ok" : "error",
        statusCode: response.status,
        latencyMs,
        serverMs: typeof body.serverMs === "number" ? body.serverMs : null,
        checkedAt: new Date(),
        message: response.ok ? undefined : `HTTP ${response.status}`,
      });
    } catch (error) {
      setHealth({
        state: "error",
        statusCode: null,
        latencyMs: Math.round(performance.now() - started),
        serverMs: null,
        checkedAt: new Date(),
        message: error instanceof Error ? error.message : "Network error",
      });
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    const timer = window.setInterval(() => void checkHealth(), 15_000);
    return () => window.clearInterval(timer);
  }, [checkHealth]);

  const healthLabel = health.state === "ok" ? "API healthy" : health.state === "checking" ? "Checking API" : "API check failed";
  const healthIcon = health.state === "ok"
    ? <CheckCircle2 className="h-7 w-7" />
    : health.state === "checking"
      ? <RefreshCw className="h-7 w-7 animate-spin" />
      : <XCircle className="h-7 w-7" />;
  const healthColor = health.state === "ok" ? "text-emerald-300" : health.state === "checking" ? "text-amber-300" : "text-red-300";

  return (
    <Layout hideChrome={screenShare}>
      <main className={`mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 ${screenShare ? "max-w-7xl py-10 sm:px-10 lg:py-14" : ""}`}>
        {!screenShare && <AdminNav />}

        <header className="flex flex-col justify-between gap-5 border-b border-border/40 pb-7 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-500">
              <Zap className="h-4 w-4" /> Partner integration brief
            </div>
            <h1 className={`mt-3 max-w-3xl font-black tracking-tight text-foreground ${screenShare ? "text-5xl sm:text-7xl" : "text-4xl sm:text-5xl"}`}>
              A fast, verifiable audio API.
            </h1>
            <p className={`mt-3 max-w-2xl leading-relaxed text-muted-foreground ${screenShare ? "text-lg sm:text-xl" : "text-base"}`}>
              A screen-share view for Joel and Sink Tank: what is live, what has been measured, and what must be completed before a production handoff.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setScreenShare((current) => !current)}
              className="shrink-0 gap-2"
              aria-pressed={screenShare}
            >
              {screenShare ? <Minimize2 className="h-4 w-4" /> : <Fullscreen className="h-4 w-4" />}
              {screenShare ? "Exit screen-share" : "Screen-share mode"}
            </Button>
            <Button variant="outline" onClick={() => void checkHealth()} disabled={health.state === "checking"} className="shrink-0 gap-2">
              <RefreshCw className={health.state === "checking" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Check now
            </Button>
          </div>
        </header>

        <nav aria-label="Demo sections" className="flex flex-wrap gap-2">
          <JumpLink href="#live">Live check</JumpLink>
          <JumpLink href="#benchmark">Live benchmark</JumpLink>
          <JumpLink href="#evidence">Historical evidence</JumpLink>
          <JumpLink href="#capacity">Capacity boundary</JumpLink>
          <JumpLink href="#ip-validation">IP verification</JumpLink>
          <JumpLink href="#pilot">Pilot plan</JumpLink>
        </nav>

        <section id="live" className="scroll-mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className={`border-2 ${health.state === "ok" ? "border-emerald-500/35" : health.state === "error" ? "border-red-500/35" : "border-amber-500/30"} bg-card/60`}>
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <div className={healthColor}>{healthIcon}</div>
                <EvidenceBadge tone={health.state === "ok" ? "good" : health.state === "error" ? "warn" : "neutral"}>
                  Live check
                </EvidenceBadge>
              </div>
              <div className={`mt-6 text-4xl font-black tracking-tight ${healthColor}`}>{healthLabel}</div>
              <div className="mt-2 font-mono text-sm text-muted-foreground">GET /api/healthz</div>
              <div className="mt-8 grid grid-cols-3 gap-5 border-t border-border/40 pt-5">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">HTTP status</div>
                  <div className="mt-1 text-2xl font-mono font-bold">{health.statusCode ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Browser → API round trip</div>
                  <div className="mt-1 text-2xl font-mono font-bold">{health.latencyMs == null ? "—" : `${health.latencyMs} ms`}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Server handler time</div>
                  <div className="mt-1 text-2xl font-mono font-bold">{health.serverMs == null ? "—" : `${health.serverMs} ms`}</div>
                </div>
              </div>
              <div className="mt-5 text-xs text-muted-foreground">
                Last checked: {health.checkedAt ? health.checkedAt.toLocaleTimeString() : "waiting"}
                {health.message ? ` · ${health.message}` : ""}
                {" · "}Round trip includes network + proxy; server handler time is what the API itself spent. Neither is kernel processing speed.
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl"><Server className="h-5 w-5 text-amber-500" /> Integration surface</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Partner ingestion</div>
                <div className="mt-2 font-mono text-sm text-foreground">POST /api/v1/ingest</div>
                <div className="mt-1 text-xs text-muted-foreground">Multipart audio in, mastered audio out, certificate header returned.</div>
              </div>
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Public verification</div>
                <div className="mt-2 font-mono text-sm text-foreground">POST /api/v1/verify</div>
                <div className="mt-1 text-xs text-muted-foreground">WAV upload in, structured warrant result out. No partner key required.</div>
              </div>
              <div className="flex items-start gap-3 text-sm text-muted-foreground">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                <span>The ingestion alias is key-gated before upload parsing. This demo never displays the key.</span>
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="benchmark" className="scroll-mt-6 space-y-4">
          <SectionLabel eyebrow="Live measurement" title="Measure the kernel and the partner path now">
            <EvidenceBadge tone="neutral">Runs against this server, on demand</EvidenceBadge>
          </SectionLabel>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="border-border/50 bg-card/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl"><Zap className="h-5 w-5 text-amber-500" /> Kernel processing benchmark</CardTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Runs the real Morris Law Kernel v3.5 execution path (the same remote-first / local-fallback selection mastering uses) on a bounded generated WAV fixture. Kernel time only — no network or upload.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={() => void runKernelBench()} disabled={kernelBench.status === "running"} className="gap-2 bg-amber-500 font-semibold text-black hover:bg-amber-600">
                  {kernelBench.status === "running" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                  {kernelBench.status === "running" ? "Measuring… (runs 3 passes)" : "Run kernel benchmark"}
                </Button>
                {kernelBench.status === "error" && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Benchmark failed: {kernelBench.error}. No result is shown because no measurement completed.</div>
                )}
                {kernelBench.status === "done" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <Metric value={fmtMs(kernelBench.result.summary.minMs)} label="Min" detail={`${kernelBench.result.summary.runs} runs`} />
                      <Metric value={fmtMs(kernelBench.result.summary.medianMs)} label="Median" detail="kernel processing" />
                      <Metric value={fmtMs(kernelBench.result.summary.maxMs)} label="Max" detail="per run" />
                    </div>
                    <div className="rounded-lg border border-border/40 bg-secondary/20 p-4 text-sm leading-relaxed text-muted-foreground">
                      <div><strong className="text-foreground">{kernelBench.result.summary.realtimeMultiplier == null ? "—" : `${kernelBench.result.summary.realtimeMultiplier}× realtime`}</strong> on a {kernelBench.result.fixture.durationS}s fixture ({(kernelBench.result.fixture.bytes / 1024).toFixed(0)} KB, {kernelBench.result.fixture.kind}).</div>
                      <div className="mt-1">Engine: <span className="font-mono text-xs text-amber-300">{kernelBench.result.engine}{kernelBench.result.runs.some((r) => r.numba) ? " (numba)" : ""}</span> · {kernelBench.result.completedLocally ? "completed locally" : "completed remotely"} · measured {new Date(kernelBench.result.measuredAt).toLocaleTimeString()}</div>
                      <div className="mt-1 text-xs">{kernelBench.result.note}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl"><ArrowRight className="h-5 w-5 text-violet-400" /> End-to-end partner path</CardTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Sends the fixture through the real <span className="font-mono text-xs text-amber-300">POST /api/v1/ingest</span> partner route (key-gated, multipart, mastered WAV back) and splits the wall-clock time.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={() => void runE2eBench()} disabled={e2eBench.status === "running"} variant="outline" className="gap-2">
                  {e2eBench.status === "running" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
                  {e2eBench.status === "running" ? "Processing fixture…" : "Run partner-path test"}
                </Button>
                {e2eBench.status === "error" && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">Test failed: {e2eBench.error}. No result is shown because no measurement completed.</div>
                )}
                {e2eBench.status === "done" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Metric value={fmtMs(e2eBench.result.timings.uploadAndParseMs)} label="Upload + parse" detail="multipart receive" />
                      <Metric value={fmtMs(e2eBench.result.timings.kernelMs)} label="Kernel" detail="MLK v3.5 processing" />
                      <Metric value={fmtMs(e2eBench.result.timings.networkAndResponseMs)} label="Response + network" detail="stream back" />
                      <Metric value={fmtMs(e2eBench.result.timings.totalMs)} label="Total" detail="wall clock" />
                    </div>
                    <div className="rounded-lg border border-border/40 bg-secondary/20 p-4 text-xs leading-relaxed text-muted-foreground">
                      {e2eBench.result.fixture.durationS}s fixture → {(e2eBench.result.outputBytes / 1024).toFixed(0)} KB mastered WAV · engine <span className="font-mono text-amber-300">{e2eBench.result.kernelEngine ?? "unknown"}</span> · measured {new Date(e2eBench.result.measuredAt).toLocaleTimeString()} · {e2eBench.result.note}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="evidence" className="scroll-mt-6 space-y-4">
          <SectionLabel eyebrow="Historical evidence" title="Earlier load-test results (not live data)">
            <EvidenceBadge tone="warn">Recorded Aug 4, 2026 · scripted load test</EvidenceBadge>
          </SectionLabel>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            These counts come from a scripted load test run against the development server on August 4, 2026. They show the API held up under repetition at that time — they are <strong className="text-foreground">not</strong> measurements from this session. Use the live cards above for current numbers.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric value="1,000 / 1,000" label="Health requests returned 200" detail="Historical: repeated health probes completed cleanly (Aug 4, 2026 load test)." />
            <Metric value="500 / 500" label="MLK v3 processing returned 200" detail="Historical: audio processing path remained available through the run (Aug 4, 2026 load test)." />
            <Metric value="1,000 / 1,000" label="Raw processing returned 200" detail="Historical: baseline API processing completed without failed responses (Aug 4, 2026 load test)." />
            <Metric value="200 / 200" label="Invalid payloads returned 400" detail="Historical: bad input was rejected cleanly rather than crashing (Aug 4, 2026 load test)." />
            <Metric value="200 / 200" label="Missing routes returned 404" detail="Historical: unknown paths returned expected not-found responses (Aug 4, 2026 load test)." />
            <Metric value="74 / 74" label="Automated API checks passed" detail="Historical: whitepaper, studio, pricing, download, and security checks (Aug 4, 2026 suite)." />
          </div>
        </section>

        <section id="capacity" className="scroll-mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-amber-500/25 bg-amber-500/[0.04]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl"><TriangleAlert className="h-5 w-5 text-amber-400" /> Current capacity boundary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <div>
                  <div className="text-5xl font-black font-mono text-amber-300">3</div>
                  <div className="mt-1 text-sm font-semibold">simultaneous mastering lanes</div>
                </div>
                <div>
                  <div className="text-5xl font-black font-mono text-foreground">300</div>
                  <div className="mt-1 text-sm font-semibold">partner requests / 10 minutes</div>
                </div>
              </div>
              <div className="mt-6 rounded-lg border border-amber-500/20 bg-background/30 p-4 text-sm leading-relaxed text-muted-foreground">
                Partner stress test: <strong className="text-foreground">3 requests processed</strong> and <strong className="text-foreground">27 returned clean HTTP 503</strong> because the three-job concurrency cap was full. That is honest back-pressure, not 500-track queue readiness.
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-amber-300"><Clock3 className="h-4 w-4" /> Synchronous processing today · queue, retries, job IDs, and callbacks are the next production gate.</div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/60">
            <CardHeader><CardTitle className="flex items-center gap-2 text-xl"><Activity className="h-5 w-5 text-violet-400" /> Performance context</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>A separate DSP benchmark historically measured approximately <strong className="text-foreground">109× realtime</strong> on its own test environment (recorded before Aug 10, 2026 — not this server, not this session).</p>
              <p><strong className="text-foreground">That is not an end-to-end API SLA.</strong> Run the live kernel benchmark above to get the current, measured multiplier on this hardware. Network time, file upload, concurrency, and worker capacity still need production measurement.</p>
              <div className="flex items-center gap-2"><EvidenceBadge tone="warn">Historical / context</EvidenceBadge><span>Not a live measurement</span></div>
            </CardContent>
          </Card>
        </section>

        <section id="ip-validation" className="scroll-mt-6 space-y-4">
          <SectionLabel eyebrow="IP validation" title="The certificate uses two anchors, not one claim">
            <EvidenceBadge tone="good">Explainable to partners</EvidenceBadge>
          </SectionLabel>
          <Card className="border-border/50 bg-card/60">
            <CardContent className="grid gap-4 p-6 md:grid-cols-4">
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-4"><FileCheck2 className="h-5 w-5 text-amber-400" /><div className="mt-3 font-semibold">SHA-256</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Creates a fingerprint from the source content, artist handle, and certificate ID.</p></div>
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-4"><ShieldCheck className="h-5 w-5 text-violet-400" /><div className="mt-3 font-semibold">Anchor A</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">A nominator is embedded in the lossless audio LSB stream.</p></div>
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-4"><LockKeyhole className="h-5 w-5 text-emerald-400" /><div className="mt-3 font-semibold">Anchor B</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">The denominator stays on the server and is never transmitted in the file.</p></div>
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-4"><CheckCircle2 className="h-5 w-5 text-blue-400" /><div className="mt-3 font-semibold">HMAC-SHA256</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Binds both anchors and produces INTACT, TAMPERED, or NO_WATERMARK.</p></div>
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["INTACT", "Anchor A, Anchor B, and the HMAC binding all agree.", "good"],
              ["TAMPERED", "An anchor is missing, malformed, or no longer matches the proof.", "warn"],
              ["NO_WATERMARK", "No GravelKing signal anchor is present in the submitted file.", "neutral"],
            ].map(([verdict, explanation, tone]) => (
              <div key={verdict} className="rounded-xl border border-border/50 bg-secondary/20 p-4">
                <EvidenceBadge tone={tone as "good" | "warn" | "neutral"}>{verdict}</EvidenceBadge>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{explanation}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pilot" className="scroll-mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-border/50 bg-card/60">
            <CardHeader>
              <CardTitle className="text-xl">Partner integration summary</CardTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">Intended use: Sink Tank submits audio for mastering, receives the output and certificate ID, then uses public verification to confirm the issued signal.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border/40 bg-secondary/20 p-4 text-sm leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Supported flow:</strong> key-gated <span className="font-mono text-xs text-amber-300">POST /api/v1/ingest</span> → mastered WAV + headers → public <span className="font-mono text-xs text-amber-300">POST /api/v1/verify</span>.
              </div>
              {[
                ["10 tracks", "Confirm auth, file shape, output headers, and certificate handling."],
                ["50 tracks", "Measure real end-to-end latency and observe back-pressure."],
                ["100 tracks", "Decide whether queueing and retry work must precede expansion."],
              ].map(([name, detail], index) => (
                <div key={name} className="flex gap-3 rounded-lg border border-border/40 bg-secondary/20 p-4">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-black">{index + 1}</div>
                  <div><div className="font-semibold">{name}</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-red-500/25 bg-red-500/[0.03]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl"><FileCheck2 className="h-5 w-5 text-red-300" /> Remaining handoff gates</CardTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">These are next steps, not completed evidence.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                "Publish and verify /api/v1/ingest and /api/v1/verify on the public deployment.",
                "Confirm the x-api-key gate rejects missing and invalid keys before accepting bytes.",
                "Run a real production audio smoke test and confirm output headers and certificate behavior.",
                "Add queueing, retries, job IDs, idempotency, and callbacks before promising a 500-track batch.",
              ].map((gate) => <div key={gate} className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground"><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-red-300" />{gate}</div>)}
            </CardContent>
          </Card>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-5 text-xs text-muted-foreground">
          <span>Prepared for partner discussion · evidence is labeled by status.</span>
          <Button variant="ghost" size="sm" onClick={logout}>Lock admin area</Button>
        </footer>
      </main>
    </Layout>
  );
}

export default function AdminIntegrationDemo() {
  return (
    <AdminGate title="API Integration Pilot" description="Enter your admin key to access the partner demo surface.">
      <IntegrationDemoDashboard />
    </AdminGate>
  );
}