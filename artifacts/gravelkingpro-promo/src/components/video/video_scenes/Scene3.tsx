import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1800),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-zinc-950 overflow-hidden"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/mixing_console.mp4`}
        className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-screen"
        autoPlay
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-black/60" />

      <div className="relative z-10 w-full px-16 flex flex-col items-center">
        
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <motion.h2
            className="text-[6.5vw] font-black uppercase text-white leading-none shadow-black drop-shadow-2xl mb-4"
          >
            Studio Mastering
          </motion.h2>
          
          <motion.div
            className="inline-block bg-amber-500 text-black px-8 py-2 rounded-full"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <span className="text-[2.2vw] font-bold tracking-widest uppercase">
              12 Broadcast-Ready Presets
            </span>
          </motion.div>
        </motion.div>

        {/* Abstract EQ Bars */}
        <div className="absolute bottom-0 w-full h-[30vh] flex items-end justify-center gap-2 opacity-50 px-20">
          {Array.from({ length: 30 }).map((_, i) => (
            <motion.div
              key={i}
              className="flex-1 bg-amber-500 rounded-t-sm origin-bottom"
              initial={{ scaleY: 0 }}
              animate={phase >= 2 ? { 
                scaleY: [Math.random() * 0.2 + 0.1, Math.random() * 0.8 + 0.2, Math.random() * 0.4 + 0.1]
              } : { scaleY: 0 }}
              transition={{
                duration: 1.5 + Math.random(),
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
                delay: i * 0.05
              }}
            />
          ))}
        </div>

      </div>
    </motion.div>
  );
}
