import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-zinc-950 overflow-hidden"
      initial={{ opacity: 0, x: -100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}
    >
      <div className="absolute inset-0 overflow-hidden flex items-center justify-center opacity-10">
        <motion.div
          className="w-[100vw] h-[100vw] border-[1px] border-amber-500 rounded-full"
          animate={{ scale: [1, 2], opacity: [1, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      <div className="relative z-10 w-full px-16 flex flex-col items-center">
        <motion.h2
          className="text-[5vw] font-black uppercase text-white leading-none mb-12 shadow-black drop-shadow-xl text-center"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Shop The Drop
        </motion.h2>

        <div className="flex gap-16 w-full justify-center">
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 50 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="w-[25vw] h-[25vw] rounded-2xl bg-gradient-to-tr from-zinc-900 to-zinc-800 p-8 border border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden">
              <img src={`${import.meta.env.BASE_URL}images/merch_hat.png`} className="w-full h-full object-contain relative z-10" />
            </div>
            <p className="text-[1.8vw] font-bold text-white mt-6 uppercase tracking-wider">GK Premium Cap</p>
          </motion.div>

          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 50 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="w-[25vw] h-[25vw] rounded-2xl bg-gradient-to-tr from-zinc-900 to-zinc-800 p-8 border border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden">
              <img src={`${import.meta.env.BASE_URL}images/merch_shirt.png`} className="w-full h-full object-contain relative z-10" />
            </div>
            <p className="text-[1.8vw] font-bold text-white mt-6 uppercase tracking-wider">GK Studio Tee</p>
          </motion.div>
        </div>

        <motion.div
          className="mt-16 bg-amber-500 text-black px-12 py-4 rounded-full font-bold text-[2vw] uppercase tracking-widest shadow-[0_0_40px_rgba(245,158,11,0.4)]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          Available now in the app
        </motion.div>
      </div>
    </motion.div>
  );
}
