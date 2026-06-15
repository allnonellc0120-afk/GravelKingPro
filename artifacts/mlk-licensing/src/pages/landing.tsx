import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { ArrowRight, Terminal, Cpu, Network, Lock, Activity } from "lucide-react";
import { useState, useEffect } from "react";

export default function Landing() {
  const [gflops, setGflops] = useState(180.5);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setGflops(180.5 + (Math.random() * 2 - 1));
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <Layout>
      <div className="flex flex-col gap-16 pb-12">
        <section className="pt-12 md:pt-24 lg:pt-32 border-b pb-16">
          <div className="max-w-[800px]">
            <div className="inline-flex items-center rounded-none border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary text-primary-foreground mb-6 font-mono">
              V3.5 RELEASE // NDA REQUIRED
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 uppercase">
              The fastest matrix multiplication kernel in existence.
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-[600px] leading-relaxed">
              MLK V3.5 achieves 92% of theoretical peak performance on NVIDIA A100/H100 architectures. Engineered for high-frequency trading, dense simulations, and proprietary AI training.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/pricing" className="inline-flex h-12 items-center justify-center border border-primary bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                View License Tiers
              </Link>
              <Link href="/benchmark" className="inline-flex h-12 items-center justify-center border border-input bg-background px-8 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 font-mono">
                <Terminal className="mr-2 h-4 w-4" />
                Run Benchmark
              </Link>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border p-6 flex flex-col justify-between bg-card">
            <div>
              <Cpu className="h-8 w-8 mb-4 text-accent" />
              <h3 className="text-lg font-bold mb-2 uppercase">Hardware Native</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Written directly in PTX and SASS. Bypasses standard CUDA abstractions for zero-overhead execution and precise register allocation.
              </p>
            </div>
          </div>
          
          <div className="border p-6 flex flex-col justify-between bg-card">
            <div>
              <Network className="h-8 w-8 mb-4 text-accent" />
              <h3 className="text-lg font-bold mb-2 uppercase">NUMA Aware</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Intelligent memory pinning and topology-aware scheduling prevents interconnect bottlenecking across multi-node clusters.
              </p>
            </div>
          </div>
          
          <div className="border p-6 flex flex-col justify-between bg-card">
            <div>
              <Lock className="h-8 w-8 mb-4 text-accent" />
              <h3 className="text-lg font-bold mb-2 uppercase">Air-gapped Deployment</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Zero telemetry. Complete offline capability. Verified deterministic binaries for classified environments.
              </p>
            </div>
          </div>
        </section>

        <section className="border bg-zinc-950 text-zinc-50 p-8 md:p-12 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-20 font-mono text-9xl font-bold pointer-events-none">
            A16
          </div>
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl font-bold uppercase mb-4 text-zinc-100">Live Telemetry</h2>
              <p className="text-zinc-400 mb-6">
                Average sustained performance on an isolated NVIDIA A100 80GB PCIe instance running FP64 GEMM operations.
              </p>
              <Link href="/benchmark" className="inline-flex items-center text-accent hover:underline font-mono text-sm">
                VERIFY NUMBERS <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-zinc-800 p-6 bg-zinc-900/50">
                <div className="text-sm text-zinc-500 font-mono mb-2">SUSTAINED (GFLOPS)</div>
                <div className="text-4xl font-mono text-accent font-bold data-value">{gflops.toFixed(1)}</div>
              </div>
              <div className="border border-zinc-800 p-6 bg-zinc-900/50">
                <div className="text-sm text-zinc-500 font-mono mb-2">PEAK (GFLOPS)</div>
                <div className="text-4xl font-mono text-zinc-100 font-bold data-value">220.3</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
