import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000),
      setTimeout(() => setPhase(2), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 opacity-40">
        <video 
          src={`${import.meta.env.BASE_URL}videos/waves-bg.mp4`} 
          className="w-full h-full object-cover"
          autoPlay muted playsInline
        />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <motion.div 
          className="w-32 h-32 rounded-full border-4 border-[var(--color-primary)] flex items-center justify-center mb-8 bg-black/50 backdrop-blur-md"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <svg className="w-16 h-16 text-[var(--color-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </motion.div>

        <motion.h2 
          className="text-[5vw] font-bold tracking-tight text-white leading-tight text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8 }}
        >
          100% Server-Side Processing
        </motion.h2>

        <motion.p
          className="text-[2.5vw] text-white/70 mt-4 max-w-4xl text-center"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          Your files never leave our servers. Nothing to install. Runs in any browser.
        </motion.p>
      </div>
    </motion.div>
  );
}