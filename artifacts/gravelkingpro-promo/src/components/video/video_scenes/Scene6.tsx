import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1 }}
    >
      <div className="absolute inset-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/dashboard.png`} 
          className="w-full h-full object-cover opacity-60" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
      </div>

      <div className="relative z-10 text-center flex flex-col items-center">
        <motion.div
          className="bg-black/80 border border-[var(--color-primary)]/30 backdrop-blur-md px-12 py-8 rounded-2xl"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        >
          <h2 className="text-[5vw] font-black text-white leading-none mb-4">Mix Studio</h2>
          <p className="text-[2vw] text-white/70 max-w-2xl">
            Multi-track DAW with EQ, Compression, Reverb, and Limiter. Built right into the browser.
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}