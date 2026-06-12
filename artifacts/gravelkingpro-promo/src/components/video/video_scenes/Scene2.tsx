import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
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
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 1 }}
    >
      <div className="absolute inset-0 opacity-30">
        <video 
          src={`${import.meta.env.BASE_URL}videos/studio-bg.mp4`} 
          className="w-full h-full object-cover"
          autoPlay muted playsInline
        />
      </div>

      <div className="relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.5, filter: 'blur(10px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="text-[7vw] font-black tracking-tighter uppercase text-white leading-none">
            Professional<br/>Audio Tools
          </h1>
        </motion.div>

        <motion.div
          className="mt-6 inline-block"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, type: 'spring' }}
        >
          <span className="text-[3vw] font-bold text-[var(--color-primary)] bg-[var(--color-primary)]/10 px-6 py-2 border border-[var(--color-primary)]/30 rounded">
            No plugin required.
          </span>
        </motion.div>
      </div>
    </motion.div>
  );
}