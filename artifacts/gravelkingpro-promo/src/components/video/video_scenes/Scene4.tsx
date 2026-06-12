import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 5000),
      setTimeout(() => setPhase(5), 6500),
      setTimeout(() => setPhase(6), 8000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-1/2 h-full flex flex-col justify-center px-16 relative z-10">
        <motion.h2 
          className="text-[4vw] font-black text-white leading-tight mb-8"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
        >
          All-in-one<br/>Production Suite.
        </motion.h2>

        <motion.div 
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
              <span className="text-purple-400 font-bold text-xl">V</span>
            </div>
            <h3 className="text-[2.5vw] font-bold text-white">Voice Removal</h3>
          </div>
          <p className="text-[1.5vw] text-white/60 ml-16">Strip vocals instantly. Get clean instrumentals.</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <span className="text-emerald-400 font-bold text-xl">S</span>
            </div>
            <h3 className="text-[2.5vw] font-bold text-white">Stem Splitting</h3>
          </div>
          <p className="text-[1.5vw] text-white/60 ml-16">Separate bass, mid, highs, and instruments.</p>
        </motion.div>
      </div>

      <div className="w-1/2 h-full relative overflow-hidden bg-[#09090b] border-l border-white/10 flex items-center justify-center">
        {/* Visualizer for Voice Removal */}
        <motion.div 
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={phase >= 3 && phase < 5 ? { opacity: 1 } : { opacity: 0 }}
        >
          <div className="w-64 h-64 rounded-full border-2 border-purple-500/50 flex items-center justify-center relative">
            <motion.div className="w-full h-full rounded-full border-2 border-purple-500 absolute" animate={{ scale: [1, 1.5], opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 2 }} />
            <span className="text-purple-400 font-bold text-2xl">VOCALS</span>
          </div>
        </motion.div>

        {/* Visualizer for Stem Splitting */}
        <motion.div 
          className="absolute inset-0 flex flex-col items-center justify-center gap-4"
          initial={{ opacity: 0 }}
          animate={phase >= 5 ? { opacity: 1 } : { opacity: 0 }}
        >
          {['BASS', 'MID', 'HIGH', 'INST'].map((stem, i) => (
            <motion.div 
              key={stem}
              className="w-64 h-12 bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold"
              initial={{ x: 100, opacity: 0 }}
              animate={phase >= 5 ? { x: 0, opacity: 1 } : { x: 100, opacity: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              {stem}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}