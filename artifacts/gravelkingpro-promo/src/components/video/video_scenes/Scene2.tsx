import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4000),
      setTimeout(() => setPhase(4), 5500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const stems = [
    { name: 'VOCALS', color: '#f5f5f5' },
    { name: 'DRUMS', color: '#c9a227' },
    { name: 'BASS', color: '#f5f5f5' },
    { name: 'OTHER', color: '#c9a227' },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center overflow-hidden"
      initial={{ opacity: 0, x: '100vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-100vw' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/keyboard_play.mp4`}
        className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen"
        autoPlay
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent" />

      <div className="relative z-10 flex w-full px-[8vw] items-center justify-between">
        
        <div className="flex flex-col w-[50vw]">
          <motion.div className="overflow-hidden">
            <motion.h2
              className="text-[6vw] font-black tracking-tighter uppercase leading-none"
              initial={{ y: "100%", opacity: 0 }}
              animate={phase >= 1 ? { y: 0, opacity: 1 } : { y: "100%", opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <span className="text-[#c9a227]">Split vocals.</span>
            </motion.h2>
          </motion.div>
          <motion.div className="overflow-hidden">
            <motion.h2
              className="text-[6vw] font-black tracking-tighter uppercase leading-none"
              initial={{ y: "100%", opacity: 0 }}
              animate={phase >= 2 ? { y: 0, opacity: 1 } : { y: "100%", opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <span className="text-[#f5f5f5]">Isolate stems.</span>
            </motion.h2>
          </motion.div>
          
          <motion.p
            className="text-[2.5vw] font-bold text-[#f5f5f5]/50 mt-6 tracking-widest uppercase font-mono"
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={phase >= 3 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 0.8 }}
          >
            In seconds.
          </motion.p>
        </div>

        {/* Dynamic Stems */}
        <div className="flex flex-col gap-6 w-[35vw] mr-[2vw]">
          {stems.map((stem, i) => (
            <div key={stem.name} className="flex items-center gap-4">
              <motion.span 
                className="text-[1.5vw] font-black uppercase w-[8vw] text-right"
                style={{ color: stem.color }}
                initial={{ opacity: 0, x: 20 }}
                animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                {stem.name}
              </motion.span>
              <div className="flex-1 h-[2vh] bg-white/10 overflow-hidden relative">
                <motion.div
                  className="absolute left-0 top-0 bottom-0"
                  style={{ backgroundColor: stem.color }}
                  initial={{ width: "0%", left: "50%" }}
                  animate={phase >= 2 ? { width: `${80 - i * 15}%`, left: 0 } : { width: "0%", left: "50%" }}
                  transition={{ type: "spring", stiffness: 100, damping: 15, delay: i * 0.15 }}
                />
              </div>
            </div>
          ))}
        </div>

      </div>
    </motion.div>
  );
}