import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 4500),
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
      <div className="absolute inset-0 opacity-40">
        <img src={`${import.meta.env.BASE_URL}images/plugins.png`} className="w-full h-full object-cover grayscale" />
      </div>

      <div className="relative z-10 text-center flex flex-col items-center">
        <motion.h1 
          className="text-[6vw] font-black tracking-tighter uppercase text-white leading-none"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          Too many plugins.
        </motion.h1>
        
        <motion.h1 
          className="text-[6vw] font-black tracking-tighter uppercase text-white/50 leading-none mt-4"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          Too much CPU.
        </motion.h1>

        <motion.div
          className="mt-12 w-[10vw] h-[2px] bg-[var(--color-primary)]"
          initial={{ scaleX: 0 }}
          animate={phase >= 3 ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
}