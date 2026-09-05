import { motion } from 'framer-motion';
import { Sparkles, ArrowUp } from 'lucide-react';

export function Scene1() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col justify-center items-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#08090c]/0 via-[#08090c]/50 to-[#08090c] z-0" />
      
      {/* Kinetic Typography */}
      <div className="z-20 flex flex-col items-center mb-[10vh]">
        <div className="overflow-hidden">
          <motion.h1 
            className="text-[14vw] leading-none font-bold tracking-tighter"
            initial={{ y: "100%" }}
            animate={{ y: "0%" }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            MEET JAX.
          </motion.h1>
        </div>
        <div className="overflow-hidden mt-2">
          <motion.p 
            className="text-[5vw] text-violet-300 font-mono tracking-widest uppercase"
            initial={{ y: "-100%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            Your Studio Companion
          </motion.p>
        </div>
      </div>

      {/* UI Mockup: Chat Input */}
      <motion.div 
        className="z-20 w-[85vw] rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-2xl backdrop-blur-xl relative overflow-hidden"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center gap-3">
          <Sparkles className="text-violet-400 w-6 h-6 shrink-0" />
          <div className="flex-1 overflow-hidden relative h-8">
            <motion.div
              className="absolute left-0 top-0 text-[4vw] text-white/80 whitespace-nowrap"
              initial={{ clipPath: "inset(0 100% 0 0)" }}
              animate={{ clipPath: "inset(0 0% 0 0)" }}
              transition={{ duration: 2, delay: 2, ease: "linear" }}
            >
              Let's write a gritty blues track...
            </motion.div>
          </div>
          <motion.div 
            className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center shrink-0"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4, delay: 4.2, type: "spring" }}
          >
            <ArrowUp className="w-4 h-4 text-white" />
          </motion.div>
        </div>
        
        {/* Glow effect that pulses when "sending" */}
        <motion.div 
          className="absolute inset-0 bg-violet-500/20 z-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, delay: 4.4 }}
        />
      </motion.div>

    </motion.div>
  );
}
