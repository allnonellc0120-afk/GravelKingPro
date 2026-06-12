import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.8 }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/mixing_console.mp4`}
        className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen"
        autoPlay
        muted
        playsInline
      />
      
      <div className="relative z-10 flex flex-col items-center text-center">
        <motion.h2
          className="text-[6vw] font-black uppercase text-white leading-none shadow-black drop-shadow-2xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Built by <span className="text-amber-500">real</span> <br /> music people.
        </motion.h2>

        <motion.div
          className="mt-12 flex items-center gap-12"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="flex flex-col items-center">
            <span className="text-amber-500 font-bold text-[2vw] uppercase tracking-widest">Authentic</span>
            <span className="text-white/60 text-[1.2vw]">Created by industry pros</span>
          </div>
          <div className="w-px h-16 bg-white/20" />
          <div className="flex flex-col items-center">
            <span className="text-amber-500 font-bold text-[2vw] uppercase tracking-widest">GravelKing</span>
            <span className="text-white/60 text-[1.2vw]">All N One LLC</span>
          </div>
        </motion.div>

        <motion.p
          className="mt-16 text-[2.5vw] text-white font-bold tracking-widest uppercase drop-shadow-xl"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          gravelkingpro.it.com
        </motion.p>
      </div>
    </motion.div>
  );
}
