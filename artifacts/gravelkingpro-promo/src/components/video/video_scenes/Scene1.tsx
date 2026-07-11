import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000), // cursor blinks
      setTimeout(() => setPhase(2), 2000), // "You just spent..."
      setTimeout(() => setPhase(3), 4000), // "It should sound like it."
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#080808]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="text-center px-[10vw]">
        <motion.p
          className="text-[4vw] font-bold text-white/70 tracking-tight"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          You just spent 3 hours on that mix.
        </motion.p>
        <motion.p
          className="text-[5vw] font-black text-white tracking-tighter mt-[2vh]"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          It should sound like it.
        </motion.p>
        {phase < 2 && (
          <motion.div
            className="w-[1vw] h-[5vw] bg-[#c9a227] mx-auto mt-[4vh]"
            animate={{ opacity: [1, 0, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
          />
        )}
      </div>
    </motion.div>
  );
}
