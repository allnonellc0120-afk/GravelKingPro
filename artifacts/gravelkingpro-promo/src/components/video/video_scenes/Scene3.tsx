import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2200),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 1 }}
    >
      <motion.img
        src={`${import.meta.env.BASE_URL}images/gk_hammer_logo.png`}
        className="absolute inset-0 w-full h-full object-cover"
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 2, ease: 'easeOut' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />

      {/* Light leaks */}
      <motion.div
        className="absolute -top-[20%] -right-[20%] w-[60%] h-[60%] bg-amber-500/30 rounded-full blur-[100px] mix-blend-screen"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-[10%] -left-[10%] w-[50%] h-[50%] bg-red-500/20 rounded-full blur-[100px] mix-blend-screen"
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="absolute bottom-16 left-16 z-10 flex flex-col items-start">
        <motion.div
          className="w-20 h-1 bg-amber-500 mb-6"
          initial={{ width: 0 }}
          animate={phase >= 1 ? { width: 80 } : { width: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.h2
          className="text-[6vw] font-black uppercase tracking-tighter text-white leading-none shadow-black drop-shadow-2xl"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          GravelKing
        </motion.h2>
        <motion.p
          className="text-[2vw] text-amber-400 font-bold uppercase tracking-widest mt-2"
          initial={{ opacity: 0, x: -20 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
          transition={{ duration: 0.8 }}
        >
          Built for pros. Powered by real artists.
        </motion.p>
        <motion.p
          className="text-[1.2vw] text-white/60 mt-3 max-w-xl"
          initial={{ opacity: 0 }}
          animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          Stem separation, AI mastering, and a live DAW — all in one place.
        </motion.p>
      </div>
    </motion.div>
  );
}
