import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Split and titles
      setTimeout(() => setPhase(2), 2000), // Before waveform
      setTimeout(() => setPhase(3), 4000), // After waveform sweep
      setTimeout(() => setPhase(4), 7000), // Meta text
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const numBars = 40;
  
  return (
    <motion.div className="absolute inset-0 bg-[#080808] flex items-center justify-center overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-20" src={`${import.meta.env.BASE_URL}videos/mpc_pads.mp4`} />

      {/* Split Line */}
      <motion.div 
        className="absolute top-0 bottom-0 left-1/2 w-[2px] bg-white/10 -translate-x-1/2 z-20"
        initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 1 }}
      />

      <div className="w-full h-full flex">
        {/* BEFORE SIDE */}
        <div className="flex-1 flex flex-col items-center justify-center relative p-[4vw]">
          <motion.div 
            className="absolute top-[10vh] text-[1.5vw] font-black tracking-[0.5em] text-[#ef4444]/60"
            initial={{ opacity: 0 }} animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          >
            BEFORE
          </motion.div>
          
          <div className="w-full h-[30vh] flex items-center gap-[0.5vw] justify-center opacity-70">
            {Array.from({length: numBars}).map((_, i) => (
              <motion.div 
                key={`b-${i}`}
                className="w-[1vw] bg-[#ef4444]/40 rounded-full"
                initial={{ height: '2%' }}
                animate={{ height: phase >= 2 ? `${10 + Math.random() * 30}%` : '2%' }}
                transition={{ duration: 0.5, delay: phase >= 2 ? i * 0.02 : 0 }}
              />
            ))}
          </div>
        </div>

        {/* AFTER SIDE */}
        <div className="flex-1 flex flex-col items-center justify-center relative p-[4vw] bg-[#c9a227]/5">
          <motion.div 
            className="absolute top-[10vh] text-[1.5vw] font-black tracking-[0.5em] text-[#c9a227]"
            initial={{ opacity: 0 }} animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          >
            AFTER
          </motion.div>
          
          <div className="w-full h-[30vh] flex items-center gap-[0.5vw] justify-center">
            {Array.from({length: numBars}).map((_, i) => (
              <motion.div 
                key={`a-${i}`}
                className="w-[1vw] bg-[#c9a227] rounded-full shadow-[0_0_15px_rgba(201,162,39,0.5)]"
                initial={{ height: '2%' }}
                animate={{ height: phase >= 3 ? `${40 + Math.random() * 50}%` : '2%' }}
                transition={{ duration: 0.8, delay: phase >= 3 ? i * 0.05 : 0, type: "spring", bounce: 0.4 }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Track Info Overlay */}
      <AnimatePresence>
        {phase >= 4 && (
          <motion.div 
            className="absolute bottom-[10vh] left-0 right-0 flex justify-center z-30"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          >
            <div className="bg-black/80 backdrop-blur-md border border-white/10 px-[4vw] py-[2vh] rounded-2xl flex flex-col items-center shadow-2xl">
              <div className="text-[1.5vw] font-bold text-white">Used to Think I Was Superman</div>
              <div className="text-[1vw] text-[#c9a227] font-mono mt-[0.5vh]">Mastered in 8 seconds</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
