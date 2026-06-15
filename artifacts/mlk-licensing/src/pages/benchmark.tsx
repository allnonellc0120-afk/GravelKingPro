import { Layout } from "@/components/layout";
import { useState, useRef, useEffect } from "react";
import { useRunMlkBenchmark, useGetMlkLicenseStatus, getGetMlkLicenseStatusQueryKey } from "@workspace/api-client-react";
import { Terminal as TerminalIcon, Play, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
        setOutput(prev => [...prev, "WARN: No active license found. Running in DEMO mode (max matrix: 1024)."]);
      } else {
        setOutput(prev => [...prev, "OK: License verified. Unlocking full execution pipeline."]);
      }
      
      setTimeout(() => {
        setOutput(prev => [...prev, "Allocating pinned memory...", "Executing GEMM loops..."]);
        
        runBenchmark({
          data: {
            matrixSize: isDemo ? 1024 : 8192,
            iterations: isDemo ? 3 : 10
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
              You are running the unauthenticated version. Matrix size is clamped to 1024x1024 and NUMA optimizations are disabled. <a href="/activate" className="underline font-bold">Activate a license</a> for full 8192x8192 execution.
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
                <li className="flex justify-between">
                  <span className="text-muted-foreground">CPU</span>
                  <span className="font-bold text-right">AMD EPYC 9V33</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">GPU</span>
                  <span className="font-bold text-right">NVIDIA A100 80GB</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">OS</span>
                  <span className="font-bold text-right">Ubuntu 22.04 LTS</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-muted-foreground">NUMA</span>
                  <span className="font-bold text-right">{result?.numaAware ? 'ENABLED' : 'DISABLED'}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
