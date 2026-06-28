import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/mpc_pads.mp4`}
        className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen"
        autoPlay
        muted
        playsInline
      />

      {/* Kinetic Waveform Elements */}
      <div className="absolute inset-0 flex items-center justify-center opacity-40 mix-blend-screen gap-2 px-10">
        {Array.from({ length: 40 }).map((_, i) => (
          <motion.div
            key={i}
            className="flex-1 bg-[#c9a227]"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: phase >= 1 ? [0.2, Math.random() * 0.8 + 0.2, 0.2] : 0 }}
            transition={{
              duration: 0.5 + Math.random(),
              repeat: Infinity,
              repeatType: "reverse",
              ease: "easeInOut",
              delay: i * 0.02
            }}
            style={{ height: '40vh', transformOrigin: 'center' }}
          />
        ))}
      </div>

      <div className="z-10 text-center px-10">
        <motion.h1 
          className="text-[7vw] font-black uppercase tracking-tighter leading-none"
        >
          <motion.span 
            className="block text-[#f5f5f5]"
            initial={{ opacity: 0, y: 50, skewY: 5 }}
            animate={phase >= 1 ? { opacity: 1, y: 0, skewY: 0 } : { opacity: 0, y: 50, skewY: 5 }}
            transition={{ duration: 0.6, type: 'spring', stiffness: 200, damping: 20 }}
          >
            Your music
          </motion.span>
          <motion.span 
            className="block text-[#c9a227] italic"
            initial={{ opacity: 0, x: -100 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -100 }}
            transition={{ duration: 0.6, type: 'spring', stiffness: 200, damping: 20 }}
          >
            is everywhere.
          </motion.span>
        </motion.h1>
      </div>
    </motion.div>
  );
}