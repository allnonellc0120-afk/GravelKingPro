import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8 }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/mpc_pads.mp4`}
        className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-screen"
        autoPlay
        muted
        playsInline
      />
      <div className="relative z-10 text-center flex flex-col items-center">
        <motion.h1
          className="text-[8vw] font-black tracking-tighter text-amber-500 uppercase leading-none shadow-black drop-shadow-2xl"
          initial={{ y: 50, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          GravelKing Pro
        </motion.h1>
        <motion.p
          className="text-[2.5vw] text-white/90 mt-4 font-semibold tracking-widest uppercase drop-shadow-xl"
          initial={{ y: 20, opacity: 0, filter: 'blur(10px)' }}
          animate={phase >= 1 ? { y: 0, opacity: 1, filter: 'blur(0px)' } : { y: 20, opacity: 0, filter: 'blur(10px)' }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          The Sound of Next
        </motion.p>
      </div>
      
      {/* Wipe transition overlay */}
      <motion.div 
        className="absolute inset-0 bg-amber-500 z-50 origin-bottom"
        initial={{ scaleY: 0 }}
        animate={phase >= 3 ? { scaleY: 1 } : { scaleY: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </motion.div>
  );
}
