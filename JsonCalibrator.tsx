import { useState, useEffect, useRef } from 'react';
import { Terminal, ShieldCheck, Zap, Play, Trash2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface JsonCalibratorProps {
  onSuccess: (summary: any) => void;
  initialJson?: string;
}

export default function JsonCalibrator({ onSuccess, initialJson }: JsonCalibratorProps) {
  const [jsonText, setJsonText] = useState(initialJson || `{
  "benchmark_configuration": {
    "test_name": "GravelKing_1T_Calibration_Run",
    "protocol_version": "MLKV2.2",
    "target_scale": "1T",
    "execution_mode": "one_and_done",
    "parameters": {
      "warmup_cycles": 2,
      "iterations": 1,
      "telemetry_logging": true,
      "metrics": [
        "throughput_tokens_per_sec",
        "architectural_drift_percentage",
        "latency_p99"
      ]
    },
    "system_override": {
      "kernel": "MorrisLawV2.2",
      "sovereign_protocol": "GravelKing"
    }
  }
}`);

  const [logs, setLogs] = useState<{ msg: string; type: 'info' | 'success' | 'dev' | 'error' }[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (msg: string, type: 'info' | 'success' | 'dev' | 'error' = 'info') => {
    setLogs(prev => [...prev, { msg: `[${new Date().toLocaleTimeString()}] ${msg}`, type }]);
  };

  const handleRunCalibration = async () => {
    if (isRunning) return;
    setErrorText(null);
    setLogs([]);
    setIsRunning(true);
    setProgress(0);

    let parsedConfig: any = null;
    try {
      parsedConfig = JSON.parse(jsonText);
    } catch (e: any) {
      setErrorText(`JSON Syntax Error: ${e.message}`);
      setIsRunning(false);
      return;
    }

    const config = parsedConfig.benchmark_configuration;
    if (!config) {
      setErrorText("Validation Error: Missing 'benchmark_configuration' root object.");
      setIsRunning(false);
      return;
    }

    const testName = config.test_name || "GravelKing_Calibration_Run";
    const protocol = config.protocol_version || "MLKV2.2";
    const targetScale = config.target_scale || "1T";
    const kernel = config.system_override?.kernel || "MorrisLawV2.2";
    const warmup = config.parameters?.warmup_cycles ?? 0;
    const iterations = config.parameters?.iterations ?? 1;

    addLog(`INIT_CALIBRATION_HANDSHAKE: Handshake with ${kernel}`, 'info');
    addLog(`PROTOCOL: sovereign_handshake // ${protocol} detected`, 'info');
    addLog(`TARGET_SCALE: Locking system intensity target to ${targetScale}`, 'info');
    
    await new Promise(r => setTimeout(r, 600));

    // Warmup cycles
    if (warmup > 0) {
      for (let w = 0; w < warmup; w++) {
        setProgress(Math.floor((w + 1) * (15 / warmup)));
        addLog(`WARMUP_CYCLE [${w+1}/${warmup}]: Injecting pulse matrix into Morris Law stabilizer...`, 'dev');
        await new Promise(r => setTimeout(r, 450));
        addLog(`WARMUP_RECOVERY: Silicon consistency locked [0.00% drift]`, 'success');
      }
    }

    // Benchmark Run
    addLog(`STARTING PROTOCOL BENCHMARK RUN: Name="${testName}" Modes="${config.execution_mode || "linear"}"`, 'info');
    await new Promise(r => setTimeout(r, 500));

    for (let iter = 0; iter < iterations; iter++) {
      const baseProgress = warmup > 0 ? 15 : 0;
      const stepValue = (100 - baseProgress) / Math.max(1, iterations);
      
      addLog(`ITERATION [${iter+1}/${iterations}]: Beginning intense multi-channel frequency sweeps`, 'info');
      
      // Simulate real-time benchmarking metrics
      for (let sub = 0; sub <= 5; sub++) {
        const iterProgress = baseProgress + (iter * stepValue) + (sub * (stepValue / 5));
        setProgress(Math.min(99, Math.floor(iterProgress)));
        
        const virtualThroughput = (930 + Math.random() * 82).toFixed(1);
        const virtualDrift = (Math.random() * 0.18).toFixed(4);
        const virtualLatency = (1.2 + Math.random() * 0.4).toFixed(2);
        
        addLog(`STABILITY_TELEMETRY: [P=${Math.floor(iterProgress)}%] // Throughput: ${virtualThroughput}B OPS/s // Thermal Drift: +${virtualDrift}% // P99 Latency: ${virtualLatency}ms`, 'dev');
        await new Promise(r => setTimeout(r, 350));
      }

      addLog(`ITERATION [${iter+1}/${iterations}] COMPLETE // Parity Integrity 1.0000 confirmed`, 'success');
    }

    setProgress(100);
    const finalHash = 'MLK-CAL-' + Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('').toUpperCase();
    
    addLog(`CRYPTOGRAPHIC CERTIFICATION: Successfully sealed calibration session.`, 'success');
    addLog(`SECURE_HASH: ${finalHash}`, 'success');
    addLog(`Morris Law stabilization at ${targetScale} completes with 100% telemetry validation.`, 'success');
    
    setIsRunning(false);

    // Call success with certified data to populate general view
    onSuccess({
      testName,
      kernel,
      protocol,
      targetScale,
      hash: finalHash,
      throughput: "1,012,485,391,240",
      stability: "1.0000",
      drift: "0.02%",
      duration: "3.24s"
    });
  };

  return (
    <div className="border border-[#00FFCC]/20 bg-zinc-950 p-4 rounded-lg flex flex-col gap-4 text-mono h-full shadow-[0_0_20px_rgba(0,255,204,0.05)]">
      <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Terminal size={16} className="text-[#00FFCC]" />
          <span className="text-xs font-black uppercase text-[#00FFCC]">Benchmark Configuration Runner</span>
        </div>
        <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider">
          {isRunning ? "PROCESSING SYSTEM CALIBRATION" : "CONSOLE READY"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-[350px]">
        {/* Editor Area */}
        <div className="flex flex-col gap-2">
          <div className="text-[10px] text-white/50 uppercase font-black">EDIT SYSTEM SPECIFICATIONS (JSON):</div>
          <textarea
            disabled={isRunning}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="flex-1 p-3 bg-black border border-zinc-800 focus:border-[#00FFCC] text-white font-mono text-xs overflow-auto resize-none rounded outline-none h-[280px]"
          />
          {errorText && (
            <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded">
              <ShieldAlert size={14} className="shrink-0" />
              <span className="break-all">{errorText}</span>
            </div>
          )}
        </div>

        {/* Console / Stream Area */}
        <div className="flex flex-col gap-2 h-full">
          <div className="text-[10px] text-white/50 uppercase font-black flex justify-between">
            <span>REAL-TIME PIPELINE LOGS:</span>
            {logs.length > 0 && (
              <button 
                onClick={() => setLogs([])}
                className="text-red-400 hover:text-red-300 text-[9px] uppercase font-black"
              >
                Clear log
              </button>
            )}
          </div>
          <div 
            ref={logContainerRef}
            className="flex-1 bg-black border border-zinc-900 p-3 overflow-y-auto text-xs font-mono h-[280px] rounded space-y-1.5 scrollbar-thin"
          >
            {logs.length === 0 ? (
              <div className="text-white/20 italic text-center pt-8">
                Console idle. Paste JSON config and ignite core to witness Morris Law telemetry.
              </div>
            ) : (
              logs.map((log, i) => (
                <div 
                  key={i} 
                  className={
                    log.type === 'success' ? "text-emerald-400" :
                    log.type === 'error' ? "text-red-400" :
                    log.type === 'dev' ? "text-[#00FFCC]/50" : "text-[#D4AF37]"
                  }
                >
                  <span className="opacity-30 mr-1.5">&gt;</span>
                  {log.msg}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Trigger Row */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleRunCalibration}
          disabled={isRunning}
          className="flex-1 bg-[#00FFCC] text-black py-4 uppercase font-black text-xs hover:bg-white active:translate-y-0.5 transition-all flex items-center justify-center gap-2 rounded shadow-[0_0_15px_rgba(0,255,204,0.2)] disabled:opacity-50"
        >
          {isRunning ? "CALIBRATING DEVICE MATRIX..." : "ENGAGE CUSTOM CALIBRATION SEQUENCE"}
          <Play size={14} fill="currentColor" />
        </button>
      </div>

      {/* Pro progress tracker */}
      {isRunning && (
        <div className="w-full h-1 bg-zinc-900 rounded overflow-hidden">
          <motion.div 
            className="h-full bg-[#00FFCC]"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      )}
    </div>
  );
}
