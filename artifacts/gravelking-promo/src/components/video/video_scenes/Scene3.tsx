import { motion } from 'framer-motion';
import { Music, Wand2 } from 'lucide-react';

export function Scene3() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col justify-center items-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-[#08090c] via-violet-900/10 to-[#08090c] z-0" />
      
      <div className="z-20 w-[85vw] flex flex-col gap-6">
        
        {/* Style Prompt Card */}
        <motion.div 
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-3 text-white/50 text-[3vw] font-mono uppercase tracking-widest">
            <Music className="w-4 h-4" />
            <span>Sonic Identity</span>
          </div>
          <p className="text-[4.5vw] text-white/90 leading-tight">
            Raw acoustic delta blues, heavy foot stomp, distorted slide guitar.
          </p>
        </motion.div>

        {/* Generate Button */}
        <motion.div 
          className="relative mx-auto"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2, type: "spring" }}
        >
          <motion.div 
            className="absolute inset-0 bg-amber-500 rounded-xl blur-xl"
            animate={{ opacity: [0.4, 0.8, 0.4], scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="relative bg-gradient-to-b from-amber-400 to-amber-600 text-black font-bold text-[5vw] px-8 py-4 rounded-xl flex items-center gap-3 shadow-2xl">
            <Wand2 className="w-6 h-6" />
            COMPOSE TRACK
          </div>
        </motion.div>

        {/* Generative Waveform */}
        <div className="mt-8 flex items-center justify-center gap-1 h-20">
          {[...Array(24)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1.5 rounded-full bg-amber-400"
              initial={{ height: "4px", opacity: 0 }}
              animate={{ 
                height: ["4px", `${Math.random() * 60 + 20}px`, "4px"],
                opacity: [0.2, 1, 0.2]
              }}
              transition={{ 
                duration: 1.5, 
                delay: 2.5 + (i * 0.05),
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>
        
        <motion.p
          className="text-center text-[3.5vw] text-amber-400/80 font-mono tracking-widest mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 3.5 }}
        >
          MLK V3 GENERATING...
        </motion.p>
      </div>

    </motion.div>
  );
}
