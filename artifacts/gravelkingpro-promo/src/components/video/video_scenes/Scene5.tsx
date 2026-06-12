import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 3000),
      setTimeout(() => setPhase(3), 6000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex bg-black"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, y: 100 }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-1/2 h-full flex flex-col justify-center px-16 relative z-10">
        
        <motion.div 
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded bg-sky-500/20 flex items-center justify-center border border-sky-500/30">
              <span className="text-sky-400 font-bold text-xl">M</span>
            </div>
            <h3 className="text-[2.5vw] font-bold text-white">Audio Mastering</h3>
          </div>
          <p className="text-[1.5vw] text-white/60 ml-16">6 pro presets. One click to a polished master.</p>
        </motion.div>

        <motion.div 
          className="mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded bg-pink-500/20 flex items-center justify-center border border-pink-500/30">
              <span className="text-pink-400 font-bold text-xl">B</span>
            </div>
            <h3 className="text-[2.5vw] font-bold text-white">Beat Maker</h3>
          </div>
          <p className="text-[1.5vw] text-white/60 ml-16">GravelKing MLK v3 kernel. 7 genres.</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        >
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 rounded bg-violet-500/20 flex items-center justify-center border border-violet-500/30">
              <span className="text-violet-400 font-bold text-xl">S</span>
            </div>
            <h3 className="text-[2.5vw] font-bold text-white">Songwriter</h3>
          </div>
          <p className="text-[1.5vw] text-white/60 ml-16">Generate full structures in 8 genres.</p>
        </motion.div>
      </div>

      <div className="w-1/2 h-full relative overflow-hidden flex items-center justify-center bg-[#09090b] border-l border-white/10">
         <motion.div 
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 10, ease: "linear" }}
         >
           <video 
            src={`${import.meta.env.BASE_URL}videos/waves-bg.mp4`} 
            className="w-full h-full object-cover mix-blend-screen opacity-50"
            autoPlay muted playsInline
          />
         </motion.div>
      </div>
    </motion.div>
  );
}