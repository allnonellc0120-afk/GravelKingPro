import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const facts = [
  "200 million AI tracks generated in 2024.",
  "The U.S. Copyright Office denied protection to all of them.",
  "Without proof of human authorship — your music isn't legally yours.",
];

export function Scene1() {
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
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#050505]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.5 }}
    >
      {/* Pulsing red grid */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'linear-gradient(#ff000030 1px, transparent 1px), linear-gradient(90deg, #ff000030 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Alert pulse */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ boxShadow: ['inset 0 0 0px #ff0000', 'inset 0 0 120px #ff000044', 'inset 0 0 0px #ff0000'] }}
        transition={{ duration: 2.5, repeat: Infinity }}
      />

      <div className="relative z-10 flex flex-col items-center text-center px-[8vw] gap-[3vh]">
        <motion.div
          className="text-[1.4vw] font-black uppercase tracking-[0.4em] text-red-500 font-mono"
          initial={{ opacity: 0, y: -10 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.4 }}
        >
          ⚠ RIGHTS ALERT
        </motion.div>

        <div className="flex flex-col gap-[2vh]">
          {facts.map((fact, i) => (
            <AnimatePresence key={i}>
              {phase >= i + 1 && (
                <motion.p
                  className={`font-black leading-tight tracking-tight ${
                    i === 2
                      ? 'text-[3.8vw] text-red-400'
                      : 'text-[2.8vw] text-white/70'
                  }`}
                  initial={{ opacity: 0, x: -60, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                >
                  {fact}
                </motion.p>
              )}
            </AnimatePresence>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
