import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
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
      className="absolute inset-0 flex items-center justify-center bg-amber-500"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.8 }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/mixing_console.mp4`}
        className="absolute inset-0 w-full h-full object-cover mix-blend-multiply opacity-80"
        autoPlay
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-black/60" />
      
      <div className="relative z-10 text-center px-12">
        <motion.h2
          className="text-[6vw] font-black tracking-tighter uppercase text-white leading-none shadow-black drop-shadow-2xl"
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          Professional <br /> Audio Tools
        </motion.h2>
        
        <motion.div
          className="mt-8 inline-block overflow-hidden"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        >
          <motion.span 
            className="inline-block text-[3vw] font-bold text-black bg-amber-500 px-6 py-2"
            initial={{ y: '100%' }}
            animate={phase >= 1 ? { y: 0 } : { y: '100%' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            No plugin required.
          </motion.span>
        </motion.div>
      </div>
    </motion.div>
  );
}
