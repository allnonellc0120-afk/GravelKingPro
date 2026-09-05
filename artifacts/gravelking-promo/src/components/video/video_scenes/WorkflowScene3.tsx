import { motion } from 'framer-motion';
import { Mic2, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';

export function WorkflowScene3() {
  const [bars, setBars] = useState<number[]>(Array(24).fill(20));

  useEffect(() => {
    const interval = setInterval(() => {
      setBars(prev => prev.map(() => 20 + Math.random() * 80));
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col justify-center items-center z-10"
      initial={{ y: "100%", filter: "blur(20px)" }}
      animate={{ y: "0%", filter: "blur(0px)" }}
      exit={{ scale: 1.1, opacity: 0, filter: "blur(15px)" }}
      transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[#08090c] z-0" />
      <motion.img
        src={`${import.meta.env.BASE_URL}images/vocal_booth.jpg`}
        className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1.0 }}
        transition={{ duration: 8, ease: "linear" }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#08090c] via-[#08090c]/50 to-transparent z-0" />

      <div className="z-20 w-full flex flex-col items-center justify-center px-[8vw]">
        {/* The Stamp */}
        <motion.div className="overflow-hidden mb-[8vh]">
          <motion.h1 
            className="text-[18vw] leading-none font-bold tracking-tighter text-red-500 drop-shadow-[0_0_40px_rgba(239,68,68,0.5)]"
            initial={{ scale: 3, opacity: 0, y: "50%" }}
            animate={{ scale: 1, opacity: 1, y: "0%" }}
            transition={{ duration: 0.6, type: "spring", bounce: 0.4, delay: 0.2 }}
          >
            SING IT.
          </motion.h1>
        </motion.div>

        {/* Recording UI */}
        <motion.div 
          className="w-[85vw] rounded-3xl border border-red-500/30 bg-black/60 p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden flex flex-col items-center"
          initial={{ y: 50, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 1.0, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center justify-between w-full mb-6">
            <div className="flex items-center gap-2">
              <motion.div 
                className="w-3 h-3 rounded-full bg-red-500"
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <span className="text-red-400 font-mono text-[3.5vw] font-bold tracking-widest">REC</span>
            </div>
            <div className="text-white/50 font-mono text-[3.5vw]">02:14:38</div>
          </div>

          <div className="relative w-full h-[15vh] flex items-center justify-center gap-1 mb-8 overflow-hidden">
            {bars.map((height, i) => (
              <motion.div
                key={i}
                className="w-2 bg-gradient-to-t from-red-600 to-red-400 rounded-full"
                animate={{ height: `${height}%` }}
                transition={{ duration: 0.15 }}
                style={{ opacity: 1 - Math.abs(12 - i) * 0.05 }}
              />
            ))}
          </div>

          <motion.div 
            className="text-[5vw] font-serif italic text-white/90 text-center leading-tight mb-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.5 }}
          >
            "Headlights cut the dust at 2 AM..."
          </motion.div>
          <motion.div 
            className="text-[4vw] font-serif italic text-white/40 text-center leading-tight"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 4.5 }}
          >
            "Steel toes heavy on the pedal again."
          </motion.div>

        </motion.div>
      </div>
    </motion.div>
  );
}