import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 100),  // Flash
      setTimeout(() => setPhase(2), 1500), // Logo 
      setTimeout(() => setPhase(3), 3000), // Tagline
      setTimeout(() => setPhase(4), 4000), // Pill
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div className="absolute inset-0 bg-[#080808] flex items-center justify-center overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

      {/* Impact Flash */}
      <AnimatePresence>
        {phase === 1 && (
          <motion.div 
            className="absolute inset-0 bg-white z-50"
            initial={{ opacity: 1 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-10 flex flex-col items-center">
        {/* Glow */}
        <motion.div 
          className="absolute w-[40vw] h-[40vw] bg-[#c9a227] rounded-full blur-[100px] pointer-events-none"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={phase >= 2 ? { opacity: 0.2, scale: 1 } : { opacity: 0, scale: 0.5 }}
          transition={{ duration: 2, ease: "easeOut" }}
        />

        <motion.div 
          className="text-[15vw] font-black text-[#c9a227] leading-none tracking-tighter"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 2 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", bounce: 0.3 }}
        >
          GK<span className="text-[5vw] align-super">™</span>
        </motion.div>

        <motion.div 
          className="text-[3vw] font-bold text-white mt-[2vh] tracking-widest uppercase"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          Master. Certify. Own it.
        </motion.div>

        <motion.div 
          className="mt-[6vh] bg-[#c9a227] text-black px-[3vw] py-[1.5vh] rounded-full font-bold text-[1.5vw]"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          gravelkingpro.it.com
        </motion.div>
      </div>
    </motion.div>
  );
}
