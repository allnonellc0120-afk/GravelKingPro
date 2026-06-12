import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 3000),
      setTimeout(() => setPhase(3), 5000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-[#09090b]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 1 }}
    >
      <div className="absolute inset-0 opacity-20">
         <video 
          src={`${import.meta.env.BASE_URL}videos/studio-bg.mp4`} 
          className="w-full h-full object-cover grayscale"
          autoPlay muted playsInline
        />
      </div>

      <div className="relative z-10 text-center">
        <motion.h2 
          className="text-[6vw] font-black uppercase tracking-tighter text-white"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
        >
          Built by <span className="text-[var(--color-primary)]">real</span><br/>music people.
        </motion.h2>

        <motion.p
          className="text-[2.5vw] text-white/70 mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          For music people.
        </motion.p>

        <motion.div
          className="mt-12 flex justify-center gap-8"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
        >
          <div className="text-left">
            <div className="text-[var(--color-primary)] font-bold text-xl mb-1">Authentic</div>
            <div className="text-white/50 text-sm">Created by industry pros.</div>
          </div>
          <div className="w-px bg-white/20" />
          <div className="text-left">
            <div className="text-[var(--color-primary)] font-bold text-xl mb-1">GravelKing</div>
            <div className="text-white/50 text-sm">All N One LLC.</div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}