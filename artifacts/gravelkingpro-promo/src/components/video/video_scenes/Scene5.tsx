import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1600),
      setTimeout(() => setPhase(3), 2600),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-[#050505] overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.6 }}
    >
      {/* Server racks / data abstraction */}
      <div className="absolute inset-0 flex flex-col justify-between opacity-30 px-10 py-20 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div 
            key={i}
            className="w-full h-8 bg-white/5 border border-white/10 rounded-sm flex items-center px-4 gap-4"
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: i * 0.1, ease: "easeOut" }}
          >
            {Array.from({ length: 8 }).map((_, j) => (
              <motion.div 
                key={j}
                className="w-2 h-2 rounded-full"
                animate={{ backgroundColor: ["#333", "#f59e0b", "#333"] }}
                transition={{ duration: 1.5 + Math.random(), repeat: Infinity, delay: Math.random() * 2 }}
              />
            ))}
          </motion.div>
        ))}
      </div>

      <div className="relative z-10 text-center flex flex-col items-center max-w-[80vw]">
        <motion.div className="overflow-hidden mb-6">
          <motion.h2
            className="text-[5vw] font-black uppercase text-white leading-tight drop-shadow-2xl"
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            Runs On Real <br/>
            <span className="text-amber-500">Server Hardware</span>
          </motion.h2>
        </motion.div>

        <motion.div
          className="bg-white/10 backdrop-blur-md border border-white/20 px-[4vw] py-[2vw] rounded-2xl"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.6 }}
        >
          <motion.p
            className="text-[2.2vw] font-bold text-white tracking-wide"
            initial={{ opacity: 0 }}
            animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          >
            Zero Local GPU Required.
          </motion.p>
          <motion.p
            className="text-[1.8vw] text-amber-500 mt-2 font-semibold tracking-widest uppercase"
            initial={{ opacity: 0 }}
            animate={phase >= 3 ? { opacity: 1 } : { opacity: 0 }}
          >
            Access professional power from anywhere.
          </motion.p>
        </motion.div>
      </div>

    </motion.div>
  );
}
