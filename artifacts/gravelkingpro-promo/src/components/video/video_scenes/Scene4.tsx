import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene4() {
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
      className="absolute inset-0 flex items-center bg-black overflow-hidden"
      initial={{ opacity: 0, filter: 'blur(20px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: 50 }}
      transition={{ duration: 0.8 }}
    >
      {/* Fallback to mixing_console.mp4 if studio_screens not ready */}
      <video
        src={`${import.meta.env.BASE_URL}videos/mixing_console.mp4`}
        className="absolute right-0 w-[55%] h-full object-cover opacity-60 mix-blend-screen"
        autoPlay
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/90 to-transparent" />
      
      <div className="relative z-10 pl-[8vw] w-[65%]">
        <motion.div className="overflow-hidden">
          <motion.h2
            className="text-[6vw] font-black uppercase text-amber-500 leading-tight shadow-black drop-shadow-2xl"
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            Live Audio
          </motion.h2>
        </motion.div>
        <motion.div className="overflow-hidden -mt-4">
          <motion.h2
            className="text-[6vw] font-black uppercase text-white leading-tight shadow-black drop-shadow-2xl"
            initial={{ opacity: 0, y: "100%" }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: "100%" }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          >
            Studio DAW
          </motion.h2>
        </motion.div>

        <div className="mt-[4vw] flex flex-col gap-[2vw]">
          <motion.div
            className="flex items-center gap-6"
            initial={{ opacity: 0, x: -30 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="w-[4vw] h-[4vw] rounded-full bg-amber-500/20 flex items-center justify-center border border-amber-500/50">
              <div className="w-[1.5vw] h-[1.5vw] rounded-full bg-amber-500" />
            </div>
            <p className="text-[2vw] font-bold text-white shadow-black drop-shadow-md tracking-wider">
              Built-In Professional Plugins
            </p>
          </motion.div>

          <motion.div
            className="flex items-center gap-6"
            initial={{ opacity: 0, x: -30 }}
            animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -30 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="w-[4vw] h-[4vw] rounded-full bg-white/10 flex items-center justify-center border border-white/20">
              <div className="w-[1.5vw] h-[1.5vw] rounded-full bg-white/60" />
            </div>
            <p className="text-[2vw] font-bold text-white shadow-black drop-shadow-md tracking-wider">
              Record, Arrange & Mix
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
