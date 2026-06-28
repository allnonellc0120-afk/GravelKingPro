import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 5800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  useEffect(() => {
    if (phase < 3) return;
    const target = 82;
    let current = 0;
    const interval = setInterval(() => {
      current += 2;
      setScore(Math.min(current, target));
      if (current >= target) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [phase]);

  const bars = Array.from({ length: 48 });

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#050a05]"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -40 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center gap-[0.4vw] px-[5vw] h-[35vh] opacity-20">
        {bars.map((_, i) => (
          <motion.div
            key={i}
            className="flex-1"
            style={{ background: i < score / 2 ? '#c9a227' : '#333' }}
            animate={{ height: phase >= 1 ? `${20 + ((i * 37 + 13) % 60)}%` : '5%' }}
            transition={{ duration: 0.6, delay: i * 0.01 }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center text-center px-[6vw] gap-[3vh]">
        <motion.div
          className="text-[1.3vw] font-black uppercase tracking-[0.5em] text-[#c9a227]/60 font-mono"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        >
          MLK V3 — Forensic Authorship Engine
        </motion.div>

        <motion.div className="overflow-hidden">
          <motion.h2
            className="text-[6vw] font-black uppercase leading-none tracking-tighter text-white"
            initial={{ y: '110%' }}
            animate={phase >= 1 ? { y: 0 } : { y: '110%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            Every edit.
          </motion.h2>
        </motion.div>
        <motion.div className="overflow-hidden -mt-[1vh]">
          <motion.h2
            className="text-[6vw] font-black uppercase leading-none tracking-tighter text-[#c9a227]"
            initial={{ y: '110%' }}
            animate={phase >= 2 ? { y: 0 } : { y: '110%' }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            Tracked. Forensically.
          </motion.h2>
        </motion.div>

        <AnimatePresence>
          {phase >= 3 && (
            <motion.div
              className="flex flex-col items-center gap-[1.5vh] mt-[2vh]"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, type: 'spring' }}
            >
              <div className="text-[1.4vw] font-bold uppercase tracking-[0.4em] text-white/50 font-mono">
                Authorship Score
              </div>
              <div className="flex items-end gap-[2vw]">
                <span
                  className="text-[10vw] font-black leading-none tabular-nums"
                  style={{
                    color: score >= 25 ? '#c9a227' : '#ef4444',
                    textShadow: score >= 25 ? '0 0 60px #c9a22766' : '0 0 60px #ef444466',
                  }}
                >
                  {score}
                </span>
                <span className="text-[4vw] font-black text-white/40 pb-[1vw]">%</span>
              </div>
              <div className="w-[40vw] h-[1.2vh] bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: score >= 25 ? '#c9a227' : '#ef4444' }}
                  animate={{ width: `${score}%` }}
                  transition={{ duration: 0.05 }}
                />
              </div>
              <div className="flex justify-between w-[40vw]">
                <span className="text-[1.1vw] font-mono text-white/30">0%</span>
                <span className="text-[1.1vw] font-mono text-[#c9a227]">25% threshold → Protected</span>
                <span className="text-[1.1vw] font-mono text-white/30">100%</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase >= 4 && (
            <motion.p
              className="text-[1.8vw] font-bold text-white/60 mt-[1vh]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              Mix. Layer. Edit. Your DAW sessions build your legal case.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
