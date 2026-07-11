import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Nav enters
      setTimeout(() => setPhase(2), 1500), // Cursor moves
      setTimeout(() => setPhase(3), 3000), // Hover
      setTimeout(() => setPhase(4), 3500), // Click -> Panel enters
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const tabs = ["Mastering", "Vocal Booth", "DAW", "Songwriting", "Label"];

  return (
    <motion.div className="absolute inset-0 bg-[#080808] overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Fake UI Header */}
      <motion.div
        className="absolute top-0 left-0 right-0 h-[10vh] border-b border-white/10 flex items-center px-[5vw] gap-[4vw]"
        initial={{ y: '-100%' }} animate={{ y: 0 }} transition={{ duration: 0.8 }}
      >
        <div className="text-[1.5vw] font-black text-[#c9a227]">GK™</div>
        <div className="flex gap-[3vw]">
          {tabs.map((tab) => (
            <div key={tab} className="text-[1.2vw] font-semibold text-white/50 relative">
              {tab}
              {tab === "Mastering" && phase >= 3 && (
                <motion.div className="absolute -bottom-[1vh] left-0 right-0 h-[0.3vh] bg-[#c9a227]" layoutId="nav-indicator" />
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Mastering Panel */}
      <motion.div
        className="absolute top-[15vh] left-[5vw] right-[5vw] bottom-[5vh] border border-white/10 rounded-2xl bg-[#0a0a0a] flex flex-col items-center justify-center p-[4vw]"
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={phase >= 4 ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 50, scale: 0.95 }}
        transition={{ type: "spring", bounce: 0, duration: 0.8 }}
      >
        <div className="w-full max-w-[40vw] aspect-video border-2 border-dashed border-[#c9a227]/30 rounded-xl flex items-center justify-center flex-col gap-[2vh] bg-[#c9a227]/5">
           <div className="w-[4vw] h-[4vw] bg-[#c9a227]/20 rounded-full flex items-center justify-center">
             <div className="w-[2vw] h-[2vw] border-2 border-[#c9a227] rounded-sm" />
           </div>
           <div className="text-[1.2vw] text-white/60 font-mono">Drop Track Here</div>
        </div>
        <div className="mt-[4vh] flex gap-[2vw]">
          {["Baseline", "Punchy", "Warm", "Loud"].map(p => (
            <div key={p} className="px-[2vw] py-[1vh] rounded-full border border-white/20 text-[1vw] text-white/70">
              {p}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Cursor */}
      <motion.div
        className="absolute w-[2.5vw] h-[2.5vw] z-50 pointer-events-none"
        initial={{ x: '80vw', y: '60vh' }}
        animate={{
          x: phase >= 2 ? '15vw' : '80vw',
          y: phase >= 2 ? '5vh' : '60vh',
          scale: phase >= 4 ? 0.8 : 1
        }}
        transition={{ duration: 1.2, ease: "circOut" }}
      >
        <svg viewBox="0 0 24 24" fill="white" className="drop-shadow-lg w-full h-full">
          <path d="M7 2l12 11.2-5.8.5 3.3 7.3-2.2.9-3.2-7.4-4.4 4.7z" stroke="black" strokeWidth="1" />
        </svg>
      </motion.div>

    </motion.div>
  );
}
