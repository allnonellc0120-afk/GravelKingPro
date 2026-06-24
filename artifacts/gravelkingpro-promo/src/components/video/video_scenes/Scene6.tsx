import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
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
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.8 }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/mixing_console.mp4`}
        className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen"
        autoPlay
        muted
        playsInline
      />
      
      {/* Ambient amber glow */}
      <motion.div
        className="absolute rounded-full blur-[150px] pointer-events-none"
        style={{ width: '60vw', height: '60vw', background: '#f59e0b' }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={
          phase >= 1
            ? { opacity: [0, 0.4, 0.2], scale: [0.5, 1.2, 1] }
            : { opacity: 0, scale: 0.5 }
        }
        transition={{ duration: 1.5, ease: 'easeOut' }}
      />

      <div className="relative z-20 flex flex-col items-center text-center">
        <motion.div
          className="relative select-none"
          initial={{ opacity: 0, scale: 0.5, rotate: -10 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <span
            className="block text-[20vw] font-black leading-none tracking-tighter"
            style={{
              fontStyle: 'italic',
              textShadow: phase >= 1 ? '0 0 80px #f59e0b' : '0 4px 40px #00000088',
              color: '#f59e0b',
              WebkitTextStroke: '2px #b45309',
            }}
          >
            GK
          </span>
          <span className="absolute top-8 -right-12 text-[4vw] font-bold text-amber-400/70">
            ™
          </span>
        </motion.div>

        <AnimatePresence>
          {phase >= 2 && (
            <motion.p
              className="text-[3vw] font-black uppercase tracking-[0.2em] text-white mt-8"
              initial={{ opacity: 0, y: 20, letterSpacing: '0.05em' }}
              animate={{ opacity: 1, y: 0, letterSpacing: '0.2em' }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              The Sound of Next.
            </motion.p>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase >= 3 && (
            <motion.div
              className="mt-8 bg-amber-500 text-black px-12 py-4 rounded-full font-bold text-[2vw] uppercase tracking-widest shadow-[0_0_40px_rgba(245,158,11,0.4)]"
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
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

    </motion.div>
  );
}
