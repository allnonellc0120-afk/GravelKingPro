import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 3500),
      setTimeout(() => setPhase(4), 5500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#0a0802]"
      initial={{ opacity: 0, x: '100vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-100vw' }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Gold radial glow */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{ width: '80vw', height: '80vw', background: 'radial-gradient(circle, #c9a22720 0%, transparent 70%)' }}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 4, repeat: Infinity }}
      />

      <div className="relative z-10 flex flex-col items-center text-center px-[8vw] max-w-[85vw] gap-[4vh]">

        <motion.div
          className="text-[1.3vw] font-black uppercase tracking-[0.5em] text-[#c9a227]/70 font-mono"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          U.S. Copyright Office — 2023 Policy Statement
        </motion.div>

        <motion.div className="overflow-hidden">
          <motion.h2
            className="text-[5.5vw] font-black uppercase leading-tight tracking-tighter text-white"
            initial={{ y: '110%' }}
            animate={phase >= 1 ? { y: 0 } : { y: '110%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          >
            Human edits =
          </motion.h2>
        </motion.div>
        <motion.div className="overflow-hidden -mt-[2vh]">
          <motion.h2
            className="text-[5.5vw] font-black uppercase leading-tight tracking-tighter text-[#c9a227]"
            initial={{ y: '110%' }}
            animate={phase >= 2 ? { y: 0 } : { y: '110%' }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
          >
            Human authorship.
          </motion.h2>
        </motion.div>

        <AnimatePresence>
          {phase >= 3 && (
            <motion.div
              className="border border-[#c9a227]/40 bg-[#c9a227]/8 rounded-xl px-[4vw] py-[2vw] mt-[2vh]"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
            >
              <p className="text-[2.2vw] font-bold text-white/80 leading-relaxed">
                But only if you can <span className="text-[#c9a227]">prove it</span> — with a documented record<br/>
                of your creative contribution.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase >= 4 && (
            <motion.p
              className="text-[1.8vw] font-black uppercase tracking-[0.3em] text-red-400"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              No proof? No rights.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
