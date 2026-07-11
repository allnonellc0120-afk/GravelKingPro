import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // File drags in
      setTimeout(() => setPhase(2), 2000), // File drops
      setTimeout(() => setPhase(3), 3000), // Preset highlights
      setTimeout(() => setPhase(4), 4000), // Progress starts
      setTimeout(() => setPhase(5), 7500), // Mastered
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  useEffect(() => {
    if (phase !== 4) return;
    let current = 0;
    const interval = setInterval(() => {
      current += 2;
      setProgress(Math.min(current, 100));
      if (current >= 100) clearInterval(interval);
    }, 60);
    return () => clearInterval(interval);
  }, [phase]);

  return (
    <motion.div className="absolute inset-0 bg-[#080808] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Background UI context */}
      <div className="absolute inset-0 border border-white/5 bg-[#0a0a0a] m-[5vh] rounded-2xl p-[4vw] flex flex-col items-center">
        <div className="text-[2vw] font-bold text-white/80 mb-[4vh]">Mastering</div>
        
        {/* Drop Zone */}
        <motion.div 
          className="w-full max-w-[40vw] aspect-video rounded-xl flex items-center justify-center relative overflow-hidden"
          animate={{
            borderColor: phase >= 2 ? 'rgba(201,162,39,0.5)' : 'rgba(255,255,255,0.2)',
            borderWidth: '2px',
            borderStyle: 'dashed',
            backgroundColor: phase >= 2 ? 'rgba(201,162,39,0.05)' : 'transparent'
          }}
          transition={{ duration: 0.3 }}
        >
          {phase < 2 && <div className="text-white/40 text-[1.2vw]">Drop file to master</div>}
          
          <AnimatePresence>
            {phase >= 2 && (
              <motion.div 
                className="flex flex-col items-center gap-[2vh]"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <div className="text-[2.5vw]">🎵</div>
                <div className="text-[1.2vw] text-[#c9a227] font-mono">Used_to_Think_I_Was_Superman.wav</div>
                
                {phase >= 4 && (
                  <div className="w-[30vw] mt-[2vh] flex flex-col items-center gap-[1vh]">
                    <div className="w-full h-[0.5vh] bg-white/10 rounded-full overflow-hidden">
                      <motion.div className="h-full bg-[#c9a227]" style={{ width: `${progress}%` }} />
                    </div>
                    {phase < 5 ? (
                      <div className="text-[1vw] text-white/50">Processing {progress}%</div>
                    ) : (
                      <motion.div 
                        className="text-[1.2vw] font-bold text-[#10b981] flex items-center gap-2"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      >
                        ✓ Mastered
                      </motion.div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Presets */}
        <div className="mt-[6vh] flex gap-[2vw]">
          {["Baseline", "Punchy", "Warm", "Loud"].map(p => (
            <motion.div 
              key={p} 
              className="px-[2vw] py-[1vh] rounded-full border text-[1vw]"
              animate={{
                borderColor: p === "Baseline" && phase >= 3 ? 'rgba(201,162,39,1)' : 'rgba(255,255,255,0.2)',
                color: p === "Baseline" && phase >= 3 ? '#c9a227' : 'rgba(255,255,255,0.7)',
                backgroundColor: p === "Baseline" && phase >= 3 ? 'rgba(201,162,39,0.1)' : 'transparent'
              }}
            >
              {p}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Dragging File Element */}
      <AnimatePresence>
        {phase === 1 && (
          <motion.div
            className="absolute z-50 bg-[#1a1a1a] border border-white/20 p-[1.5vw] rounded-lg shadow-2xl flex items-center gap-[1vw]"
            initial={{ x: '100vw', y: '20vh', rotate: 5 }}
            animate={{ x: '0vw', y: '0vh', rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          >
            <div className="text-[2vw]">🎵</div>
            <div className="text-[1vw] text-white/80 font-mono">Used_to_Think_I_Was_Superman.wav</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
