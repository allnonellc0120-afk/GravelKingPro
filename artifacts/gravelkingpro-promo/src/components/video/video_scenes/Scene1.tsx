import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.6 }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/mpc_pads.mp4`}
        className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-screen"
        autoPlay
        muted
        playsInline
      />
      
      {/* Light leaks */}
      <motion.div
        className="absolute -top-[20%] -right-[20%] w-[60%] h-[60%] bg-amber-500/30 rounded-full blur-[100px] mix-blend-screen"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-[10%] -left-[10%] w-[50%] h-[50%] bg-amber-700/20 rounded-full blur-[100px] mix-blend-screen"
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 text-center flex flex-col items-center">
        <motion.div
          className="overflow-hidden"
          initial={{ opacity: 1 }}
        >
          <motion.h1
            className="text-[8vw] font-black tracking-tighter text-amber-500 uppercase leading-none drop-shadow-2xl"
            initial={{ y: "100%", rotateX: -40, opacity: 0 }}
            animate={{ y: 0, rotateX: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            GravelKing
          </motion.h1>
        </motion.div>
        
        <motion.div className="overflow-hidden">
          <motion.h1
            className="text-[8vw] font-black tracking-tighter text-white uppercase leading-none drop-shadow-2xl"
            initial={{ y: "100%", rotateX: -40, opacity: 0 }}
            animate={phase >= 1 ? { y: 0, rotateX: 0, opacity: 1 } : { y: "100%", rotateX: -40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            Pro
          </motion.h1>
        </motion.div>

        <motion.p
          className="text-[2vw] text-amber-200/90 mt-6 font-semibold tracking-[0.3em] uppercase drop-shadow-xl"
          initial={{ y: 20, opacity: 0, filter: 'blur(10px)' }}
          animate={phase >= 2 ? { y: 0, opacity: 1, filter: 'blur(0px)' } : { y: 20, opacity: 0, filter: 'blur(10px)' }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          The Studio Is Now Open
        </motion.p>
      </div>
      
    </motion.div>
  );
}
