import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 3200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.8 }}
    >
      {/* Amber glow */}
      <motion.div
        className="absolute rounded-full blur-[150px] pointer-events-none"
        style={{ width: '60vw', height: '60vw', background: '#c9a227' }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={phase >= 1 ? { opacity: [0, 0.35, 0.18], scale: [0.5, 1.2, 1] } : { opacity: 0, scale: 0.5 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />

      <div className="relative z-20 flex flex-col items-center text-center gap-[2vh]">
        <motion.div
          className="relative select-none"
          initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <span
            className="block text-[18vw] font-black leading-none tracking-tighter italic"
            style={{
              textShadow: phase >= 1 ? '0 0 80px #c9a227' : '0 4px 40px #00000088',
              color: '#c9a227',
              WebkitTextStroke: '2px #b45309',
            }}
          >
            GK
          </span>
          <span className="absolute top-8 -right-10 text-[4vw] font-bold text-amber-400/70">™</span>
        </motion.div>

        <AnimatePresence>
          {phase >= 2 && (
            <motion.p
              className="text-[2.8vw] font-black uppercase tracking-[0.15em] text-white"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              The only tool that proves you made it.
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase >= 3 && (
            <motion.div
              className="mt-4 bg-[#c9a227] text-black px-[4vw] py-[1.2vh] rounded-full font-bold text-[2vw] uppercase tracking-widest shadow-[0_0_40px_rgba(201,162,39,0.5)]"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              gravelkingpro.it.com
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Impact flash */}
      <AnimatePresence>
        {phase === 1 && (
          <motion.div
            className="absolute inset-0 z-50 pointer-events-none bg-white"
            initial={{ opacity: 0.7 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
