import { motion } from 'framer-motion';
import { Sliders, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

export function WorkflowScene4() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setActive(true), 3500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col justify-center items-center z-10"
      initial={{ x: "-100%", filter: "blur(20px)" }}
      animate={{ x: "0%", filter: "blur(0px)" }}
      exit={{ scale: 1.1, opacity: 0, filter: "blur(15px)" }}
      transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[#08090c] z-0" />
      <motion.video
        className="absolute inset-0 w-full h-full object-cover mix-blend-lighten"
        src={`${import.meta.env.BASE_URL}videos/mixing_console.mp4`}
        autoPlay muted loop playsInline
        animate={{ opacity: active ? 0.6 : 0.2 }}
        transition={{ duration: 0.5 }}
      />
      <div className="absolute inset-0 bg-[#08090c]/60 z-0" />

      <div className="z-20 w-full flex flex-col items-center justify-center px-[8vw]">
        {/* The Stamp */}
        <motion.div className="overflow-hidden mb-[8vh]">
          <motion.h1 
            className="text-[17vw] leading-none font-bold tracking-tighter text-white"
            initial={{ scale: 3, opacity: 0, y: "50%" }}
            animate={{ scale: 1, opacity: 1, y: "0%" }}
            transition={{ duration: 0.6, type: "spring", bounce: 0.4, delay: 0.2 }}
            style={{
              textShadow: active ? "0 0 40px rgba(139,92,246,0.8)" : "0 0 0 rgba(0,0,0,0)",
              color: active ? "#c4b5fd" : "#ffffff"
            }}
          >
            MASTER IT.
          </motion.h1>
        </motion.div>

        {/* Mastering UI */}
        <motion.div 
          className="w-[85vw] rounded-3xl border bg-black/80 p-6 backdrop-blur-xl relative overflow-hidden"
          initial={{ y: 50, opacity: 0 }}
          animate={{ 
            y: 0, 
            opacity: 1,
            borderColor: active ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.1)",
            boxShadow: active ? "0 0 50px rgba(139,92,246,0.2)" : "0 0 0 rgba(0,0,0,0)"
          }}
          transition={{ duration: 0.8, delay: 1.0 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Sliders className={active ? "text-violet-400" : "text-white/50"} />
              <div className="text-[4vw] font-mono tracking-widest text-white/90">MLK ENGINE v3.5</div>
            </div>
            
            <motion.div 
              className="flex items-center gap-2 px-3 py-1 rounded-full border border-violet-500/30 bg-violet-500/20 text-violet-300 text-[3vw] font-bold"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.8 }}
            >
              <Zap className="w-3 h-3" /> ENGAGED
            </motion.div>
          </div>

          {/* EQ Curve visualization */}
          <div className="h-[20vh] relative w-full border-b border-white/10 flex items-end justify-between px-2 pb-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div
                key={i}
                className="w-[5%] bg-gradient-to-t from-violet-900 to-violet-400 rounded-t-sm"
                initial={{ height: "10%" }}
                animate={{ height: active ? `${30 + Math.random() * 60}%` : "10%" }}
                transition={{ 
                  duration: active ? 0.3 : 1, 
                  repeat: active ? Infinity : 0, 
                  repeatType: "reverse" 
                }}
              />
            ))}
            
            {/* The Punch flash overlay */}
            <motion.div 
              className="absolute inset-0 bg-violet-400 mix-blend-overlay z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: active ? [0.8, 0] : 0 }}
              transition={{ duration: 1.0 }}
            />
          </div>

          <div className="flex justify-between mt-4 font-mono text-[2.5vw] text-white/40">
            <span>20Hz</span>
            <span>1kHz</span>
            <span>20kHz</span>
          </div>

        </motion.div>
      </div>
    </motion.div>
  );
}