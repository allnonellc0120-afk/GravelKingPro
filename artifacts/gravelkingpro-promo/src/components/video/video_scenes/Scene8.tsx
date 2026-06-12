import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene8() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-1/2 h-full bg-black relative flex items-center justify-center z-10">
        <motion.h2 
          className="text-[7vw] font-black uppercase text-white leading-none text-right absolute right-8"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
        >
          Wear<br/>The<br/><span className="text-[var(--color-primary)]">Crown.</span>
        </motion.h2>
      </div>
      <div className="w-1/2 h-full relative overflow-hidden">
        <motion.img 
          src={`${import.meta.env.BASE_URL}images/merch_1.jpg`}
          className="w-full h-full object-cover"
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ duration: 6, ease: "linear" }}
        />
      </div>
    </motion.div>
  );
}