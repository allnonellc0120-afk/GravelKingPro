import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 4200),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const stems = [
    { name: 'VOCALS', color: '#f59e0b' },
    { name: 'DRUMS', color: '#ef4444' },
    { name: 'BASS', color: '#3b82f6' },
    { name: 'SYNTHS', color: '#10b981' },
    { name: 'OTHER', color: '#8b5cf6' },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex items-center bg-black overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -50 }}
      transition={{ duration: 0.6 }}
    >
      <video
        src={`${import.meta.env.BASE_URL}videos/keyboard_play.mp4`}
        className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen"
        autoPlay
        muted
        playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />

      <div className="relative z-10 flex w-full px-[8vw] items-center justify-between">
        
        <div className="flex flex-col">
          <motion.div className="overflow-hidden">
            <motion.h2
              className="text-[6vw] font-black tracking-tighter uppercase text-white leading-none shadow-black drop-shadow-2xl"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              5-Stem <br />
              <span className="text-amber-500">Splitting</span>
            </motion.h2>
          </motion.div>
          
          <motion.p
            className="text-[2vw] font-bold text-white/70 mt-6 tracking-wide"
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={phase >= 1 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 0.8 }}
          >
            Flawless Center-Channel <br/> Voice Removal.
          </motion.p>
        </div>

        {/* Abstract Stem Visualization */}
        <div className="flex flex-col gap-4 w-[30vw] mr-[4vw]">
          {stems.map((stem, i) => (
            <div key={stem.name} className="flex items-center gap-4">
              <motion.span 
                className="text-[1.2vw] font-bold tracking-widest uppercase w-[6vw] text-right"
                style={{ color: stem.color }}
                initial={{ opacity: 0, x: -20 }}
                animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
              >
                {stem.name}
              </motion.span>
              <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: stem.color }}
                  initial={{ width: "0%" }}
                  animate={phase >= 3 ? { width: `${100 - i * 10}%` } : { width: "0%" }}
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
