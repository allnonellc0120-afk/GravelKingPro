import { useState, useEffect, useRef } from 'react';
import { Microscope, Play, ShieldCheck, Activity, Dna, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function GenomicAnalysis() {
  const [isAnalysesActive, setIsAnalysesActive] = useState(false);
  const [codonProgress, setCodonProgress] = useState(0);
  const [matchPercentage, setMatchPercentage] = useState(0.00);
  const [basePairsCount, setBasePairsCount] = useState(0);
  const [foldingStage, setFoldingStage] = useState<'IDLE' | 'ALIGNING' | 'FOLDING_PROTEINS' | 'SEALING_PARITY' | 'COMPLETE'>('IDLE');
  const [alignmentsLog, setAlignmentsLog] = useState<string[]>([]);
  
  // Simulated dynamic codons scrolling
  const [codonStream, setCodonStream] = useState<string>('');
  
  useEffect(() => {
    const chars = ['A', 'T', 'G', 'C', '-'];
    const timer = setInterval(() => {
      setCodonStream(prev => {
        const nextChar = chars[Math.floor(Math.random() * chars.length)];
        return (prev + nextChar).slice(-120);
      });
    }, 45);
    return () => clearInterval(timer);
  }, []);

  const runGenomicAlignment = async () => {
    if (isAnalysesActive) return;
    setIsAnalysesActive(true);
    setFoldingStage('ALIGNING');
    setMatchPercentage(0.00);
    setBasePairsCount(0);
    setAlignmentsLog([]);

    const logStatements = [
      "GENETIC_ALIGNER: Pulling codon slices from localized sequence ledger...",
      "CODING_THREAD: Scanning chromosomes 1-22 for matching loci sequences...",
      "PARITY_LOCK: Anchored double-helix markers inside Morris Law registers.",
      "ALIGN_DECK: Found alignment highpoint. Sequence similarity surging...",
      "PROTEIN_FOLD: Transitioning base pairs to 3D folding coordinate calculations..."
    ];

    for (let index = 0; index < logStatements.length; index++) {
      setAlignmentsLog(prev => [logStatements[index], ...prev]);
      setCodonProgress((index + 1) * 20);
      setBasePairsCount(prev => prev + Math.floor(Math.random() * 450000) + 100000);
      setMatchPercentage(prev => parseFloat((prev + Math.random() * 19.5).toFixed(2)));
      await new Promise(r => setTimeout(r, 650));
    }

    setFoldingStage('FOLDING_PROTEINS');
    setAlignmentsLog(prev => ["PROTEIN_FOLD_ENGINE: Initializing local protein folding coordinates...", ...prev]);
    await new Promise(r => setTimeout(r, 900));

    setFoldingStage('SEALING_PARITY');
    setAlignmentsLog(prev => ["CRYPTOGRAPHIC_SLA: Generating secure checksum parity check in dual-channels...", ...prev]);
    await new Promise(r => setTimeout(r, 700));

    // Finish
    setFoldingStage('COMPLETE');
    setMatchPercentage(99.98);
    setCodonProgress(100);
    setBasePairsCount(2489241);
    setIsAnalysesActive(false);
    setAlignmentsLog(prev => ["GENOMIC_COMPLETE: Sequence aligned and proteins folded perfectly with zero calibration drift.", ...prev]);
  };

  return (
    <div className="border border-orange-500/20 bg-zinc-950 p-4 rounded-lg flex flex-col gap-4 text-mono shadow-[0_0_20px_rgba(249,115,22,0.05)]">
      <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Microscope size={16} className="text-orange-500" />
          <span className="text-xs font-black uppercase text-orange-500">Genomic Analysis Sovereign Sector</span>
        </div>
        <div className="text-[10px] text-white/40 font-bold uppercase tracking-wider">
          Morris Law DNA Assembly Quorum: LOCKED
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Real-time ticker stream */}
        <div className="md:col-span-2 bg-black border border-zinc-900 rounded p-4 flex flex-col justify-between h-[220px]">
          <div>
            <div className="text-[9px] text-white/40 font-black uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Sequencer Base-Pair codeline:</span>
              <span className="text-orange-500 font-bold">1T DUAL-STREAM CHANNEL</span>
            </div>
            
            {/* The codon rolling string ticker */}
            <div className="bg-zinc-950/80 p-3 font-mono text-[11px] text-orange-400 break-all select-all border border-zinc-850 rounded leading-relaxed min-h-[44px]">
              {codonStream || "STREAMING CODON INVARIANTS..."}
            </div>
          </div>

          {/* Running indicators */}
          <div className="grid grid-cols-2 gap-3 mt-4 border-t border-zinc-900 pt-3 text-xs">
            <div>
              <div className="text-[9px] text-white/40 uppercase font-black">Base Pairs Aligned</div>
              <div className="text-base font-black text-white">{basePairsCount.toLocaleString()} bps</div>
            </div>
            <div>
              <div className="text-[9px] text-white/40 uppercase font-black">Genomic Accuracy</div>
              <div className="text-base font-black text-emerald-400">{matchPercentage.toFixed(2)}%</div>
            </div>
          </div>
        </div>

        {/* Dashboard control side block */}
        <div className="border border-zinc-900 bg-zinc-950 p-3 rounded flex flex-col justify-between">
          <div className="space-y-4">
            <div className="bg-black p-2.5 border border-zinc-900 rounded">
              <div className="text-[9px] text-white/40 uppercase font-black mb-1">State Machine Mode:</div>
              <div className="text-xs uppercase font-black text-[#00FFCC] animate-pulse">
                {foldingStage === 'IDLE' ? '// STANDBY' :
                 foldingStage === 'ALIGNING' ? '// DNA ALIGNMENT IN PROGRESS' :
                 foldingStage === 'FOLDING_PROTEINS' ? '// ALGORITHM: 3D_PROTEIN_FOLDING' :
                 foldingStage === 'SEALING_PARITY' ? '// SECURE CORE SEALING' :
                 '// COMPLETE'}
              </div>
            </div>

            <div className="p-2 bg-black border border-zinc-900 rounded text-[9px] leading-relaxed text-white/40 font-black">
              Using local GPU registers, GravelKing processes full protein alignments without cloud computing.
            </div>
          </div>

          <button
            onClick={runGenomicAlignment}
            disabled={isAnalysesActive}
            className="w-full bg-orange-500/10 border border-orange-500/50 text-orange-500 hover:bg-orange-500 hover:text-black py-3 text-xs font-black uppercase tracking-wider rounded transition-all flex items-center justify-center gap-2"
          >
            <Dna size={14} />
            {isAnalysesActive ? "CALCULATING FOLDOUT..." : "SEQUENCE & FOLD GENOME"}
          </button>
        </div>
      </div>

      {codonProgress > 0 && codonProgress < 100 && (
        <div className="w-full h-1 bg-zinc-900 rounded overflow-hidden">
          <motion.div 
            className="h-full bg-orange-500"
            animate={{ width: `${codonProgress}%` }}
          />
        </div>
      )}

      {/* Genome alignment log console */}
      <div className="bg-black/90 p-2.5 border border-zinc-900 rounded space-y-1 text-[9px] text-orange-400/80 font-mono">
        <div className="font-bold uppercase text-white/40 border-b border-zinc-900 pb-1 mb-1">
          Genomic Pipeline Logs
        </div>
        {alignmentsLog.length === 0 ? (
          <div className="text-white/20 italic">Standby... Start genome sequencing to fill logs with Morris Law telemetry.</div>
        ) : (
          alignmentsLog.slice(0, 3).map((l, i) => (
            <div key={`genomic-log-${i}`} className="truncate">
              <span className="opacity-30 mr-1.5">&gt;</span>
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
