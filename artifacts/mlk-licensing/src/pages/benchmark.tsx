import { Layout } from "@/components/layout";
import { useState, useRef, useEffect } from "react";
import { useRunMlkBenchmark, useGetMlkLicenseStatus, getGetMlkLicenseStatusQueryKey } from "@workspace/api-client-react";
import { Terminal as TerminalIcon, Play, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const METRIC_GUIDE: { term: string; desc: string }[] = [
  {
    term: "Matrix Size (N²)",
    desc: "The kernel multiplies two N×N matrices of 64-bit numbers (a DGEMM). Each run performs 2·N³ floating-point operations — a 4096² run is ~137 billion ops — so larger N stresses cache and memory bandwidth much harder.",
  },
  {
    term: "Avg GFLOPS",
    desc: "Sustained throughput: billions of floating-point operations per second, averaged across every timed iteration. This is the headline 'how fast is my hardware' number.",
  },
  {
    term: "Peak GFLOPS",
    desc: "Your single fastest iteration — the hardware's ceiling when nothing else is competing for the cores.",
  },
  {
    term: "Min GFLOPS",
    desc: "Your slowest iteration. The gap between Min and Peak shows how much OS noise, thermal throttling, or memory contention is costing you.",
  },
  {
    term: "Std Dev GFLOPS",
    desc: "How tightly the iterations cluster. A low value means deterministic, repeatable performance — exactly what the kernel's CPU affinity and memory-locking are designed to deliver.",
  },
  {
    term: "Avg Time",
    desc: "Average wall-clock seconds for one full matrix multiply. Lower is better; it is simply 2·N³ divided by your GFLOPS.",
  },
];

const OPTIMIZATIONS: { name: string; desc: string }[] = [
  {
    name: "CPU affinity",
    desc: "The benchmark process is pinned to the detected set of cores with sched_setaffinity, so the scheduler keeps the work on those cores instead of migrating it mid-run and cooling the caches.",
  },
  {
    name: "NUMA-aware memory binding",
    desc: "When the host exposes more than one NUMA node (and libnuma is present), memory is bound to the local node so the CPU never pays the latency penalty of reaching across sockets. A single-node host reports SINGLE NODE.",
  },
  {
    name: "Locked memory pages (mmap + mlock)",
    desc: "A large buffer is pinned in physical RAM so the OS can never swap it to disk, eliminating page-fault stalls during the timed loop.",
  },
  {
    name: "Vectorized FP64 GEMM (BLAS)",
    desc: "The multiply runs through OpenBLAS's hand-tuned SIMD GEMM kernels, which dispatch to the widest vector unit your CPU advertises (AVX-512 processes 8 doubles per instruction) to saturate the floating-point units. The detected ISA is shown in the Environment panel.",
  },
  {
    name: "Warm-up pass",
    desc: "One untimed multiply runs first to fill caches and spin up the BLAS thread pool, so the measured iterations reflect true steady-state speed instead of cold-start overhead.",
  },
  {
    name: "Thread-count tuning",
    desc: "OpenMP / OpenBLAS / MKL thread counts are set to match the detected core count — no oversubscription, no idle cores.",
  },
];

export default function Benchmark() {
  const { data: licenseStatus } = useGetMlkLicenseStatus({ query: { queryKey: getGetMlkLicenseStatusQueryKey() } });
  const { mutate: runBenchmark, isPending } = useRunMlkBenchmark();
  const [output, setOutput] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const isDemo = !licenseStatus?.active;

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  const handleRun = () => {
    setOutput(["Initializing MLK V3.5 Environment...", "Checking license entitlement..."]);
    setResult(null);
    
    // Simulate terminal delay
    setTimeout(() => {
      if (isDemo) {
        setOutput(prev => [...prev, "WARN: No active license found. Running in DEMO mode (512×512, 3 iterations)."]);
      } else {
        setOutput(prev => [...prev, "OK: Full execution unlocked. Detecting hardware + applying kernel optimizations."]);
      }
      
      setTimeout(() => {
        setOutput(prev => [...prev, "Setting CPU affinity...", "Locking memory pages (mmap)...", "Running warm-up pass...", "Executing FP64 DGEMM loops..."]);
        
        runBenchmark({
          data: {
            matrixSize: isDemo ? 512 : 4096,
            iterations: isDemo ? 3 : 8
          }
        }, {
          onSuccess: (data) => {
            setOutput(prev => [...prev, "Execution complete. Aggregating metrics..."]);
            setTimeout(() => {
              setResult(data);
              setOutput(prev => [...prev, JSON.stringify(data, null, 2)]);
            }, 500);
          },
          onError: (err: any) => {
            setOutput(prev => [...prev, `ERROR: Benchmark failed. ${err.message || ''}`]);
          }
        });
      }, 800);
    }, 600);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto py-8">
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold uppercase mb-2">Live Benchmark</h1>
            <p className="text-muted-foreground font-mono text-sm max-w-xl">
              Execute MLK V3.5 against dedicated cloud instances in real-time.
            </p>
          </div>
          
          <button
            onClick={handleRun}
            disabled={isPending}
            className="h-12 px-8 flex items-center bg-primary text-primary-foreground font-bold uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? (
              <Loader2 className="mr-3 w-5 h-5 animate-spin" />
            ) : (
              <Play className="mr-3 w-5 h-5" />
            )}
            {isPending ? "Executing..." : "Run Benchmark"}
          </button>
        </div>

        {isDemo && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-400 rounded-none">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="uppercase font-bold tracking-wide">Demo Mode Active</AlertTitle>
            <AlertDescription className="font-mono text-sm">
              You are running the unauthenticated version. Matrix size is clamped to 512×512 with 3 iterations. <a href="/activate" className="underline font-bold">Activate a license</a> for full 4096×4096 execution with all kernel optimizations.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col">
            <div className="bg-zinc-950 border border-zinc-800 flex-1 min-h-[400px] flex flex-col shadow-xl">
              <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center text-zinc-400 font-mono text-xs">
                  <TerminalIcon className="w-4 h-4 mr-2" />
                  root@mlk-bench-node-01:~#
                </div>
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
                </div>
              </div>
              <div 
                ref={terminalRef}
                className="p-4 font-mono text-sm text-zinc-300 flex-1 overflow-y-auto whitespace-pre-wrap leading-relaxed"
              >
                {output.length === 0 ? (
                  <div className="text-zinc-600 italic">Waiting for execution command...</div>
                ) : (
                  <>
                    {output.map((line, i) => (
                      <div key={i} className={line.startsWith('ERROR') ? 'text-red-400' : line.startsWith('WARN') ? 'text-amber-400' : line.startsWith('{') ? 'text-emerald-400 mt-4' : ''}>
                        {line}
                      </div>
                    ))}
                    {isPending && <span className="terminal-cursor">_</span>}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="border bg-card p-6">
              <h3 className="uppercase font-bold text-sm text-muted-foreground mb-4 font-mono border-b pb-2">Execution Metrics</h3>
              {result ? (
                <div className="space-y-6">
                  <div>
                    <div className="text-xs uppercase font-mono text-muted-foreground mb-1">Avg Performance</div>
                    <div className="text-3xl font-mono font-bold text-accent data-value">{result.gflops.toFixed(2)} <span className="text-sm text-muted-foreground">GFLOPS</span></div>
                  </div>
                  <div>
                    <div className="text-xs uppercase font-mono text-muted-foreground mb-1">Peak Performance</div>
                    <div className="text-2xl font-mono font-bold data-value">{result.peakGflops.toFixed(2)} <span className="text-sm text-muted-foreground">GFLOPS</span></div>
                  </div>
                  <div className="pt-4 border-t grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] uppercase font-mono text-muted-foreground mb-1">Matrix</div>
                      <div className="font-mono text-sm font-bold">{result.matrixSize}²</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-mono text-muted-foreground mb-1">Time</div>
                      <div className="font-mono text-sm font-bold">{result.avgTimeSec.toFixed(4)}s</div>
                    </div>
                  </div>
                  {result.consultingNote && (
                    <div className="pt-4 border-t text-xs font-mono text-primary bg-primary/5 p-3">
                      {result.consultingNote}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center border border-dashed text-muted-foreground text-sm font-mono">
                  AWAITING DATA
                </div>
              )}
            </div>

            <div className="border bg-card p-6">
              <h3 className="uppercase font-bold text-sm text-muted-foreground mb-4 font-mono border-b pb-2">Environment</h3>
              <ul className="space-y-3 font-mono text-xs">
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">CPU</span>
                  <span className="font-bold text-right">{result?.cpuModel ?? "Run benchmark to detect"}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Cores</span>
                  <span className="font-bold text-right">{result?.cores ? `${result.cores} logical` : "—"}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Clock</span>
                  <span className="font-bold text-right">{result?.cpuFreqMhz ? `${(result.cpuFreqMhz / 1000).toFixed(2)} GHz` : "—"}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Compute</span>
                  <span className="font-bold text-right">CPU · FP64 DGEMM</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">BLAS</span>
                  <span className="font-bold text-right">{result?.blasBackend ?? "OpenBLAS / AVX-512"}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">NUMA</span>
                  <span className="font-bold text-right">{result ? (result.numaAware ? `ENABLED (${result.numaNodes} node${result.numaNodes === 1 ? "" : "s"})` : "SINGLE NODE") : "—"}</span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">Memory</span>
                  <span className="font-bold text-right">{result ? (result.mmapLocked ? "PAGES LOCKED" : "HEAP") : "—"}</span>
                </li>
              </ul>
              <p className="mt-4 text-[10px] font-mono text-muted-foreground leading-relaxed border-t pt-3">
                Specs are read live from the host running the kernel — no GPU is used; this is a pure FP64 CPU benchmark.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 border bg-card p-6 md:p-8">
          <h2 className="uppercase font-bold text-lg mb-1">Understanding Your Results</h2>
          <p className="text-sm text-muted-foreground font-mono mb-6">What every number in the metrics panel actually measures.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            {METRIC_GUIDE.map((m) => (
              <div key={m.term} className="border-l-2 border-accent pl-4">
                <div className="font-mono font-bold text-sm uppercase tracking-wide">{m.term}</div>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 border bg-card p-6 md:p-8">
          <h2 className="uppercase font-bold text-lg mb-1">How MLK V3.5 Optimizes Your Hardware</h2>
          <p className="text-sm text-muted-foreground font-mono mb-6">The exact techniques the kernel applies on every run to squeeze peak throughput from the CPU.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
            {OPTIMIZATIONS.map((o, i) => (
              <div key={o.name} className="flex gap-4">
                <div className="font-mono font-bold text-accent text-sm shrink-0 w-6">{String(i + 1).padStart(2, "0")}</div>
                <div>
                  <div className="font-mono font-bold text-sm">{o.name}</div>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{o.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
