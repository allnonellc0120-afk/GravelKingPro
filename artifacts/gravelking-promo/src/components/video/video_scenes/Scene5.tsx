import { motion } from 'framer-motion';
import { Settings2, CheckCircle2 } from 'lucide-react';

export function Scene5() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col justify-center items-center z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: "blur(10px)" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#08090c] to-[#0a101d] z-0" />

      {/* Hero Text */}
      <motion.div 
        className="absolute top-[15vh] text-center z-20 w-full px-[5vw]"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <h2 className="text-[9vw] font-bold leading-none tracking-tighter">
          FINAL<br/>POLISH
        </h2>
        <p className="text-[3.5vw] text-emerald-400 font-mono mt-3 uppercase tracking-widest">
          GravelKing Mastering
        </p>
      </motion.div>

      {/* UI Elements */}
      <div className="relative z-20 w-[85vw] mt-[10vh] flex flex-col gap-4">
        
        {/* Preset Cards */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div 
            className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center gap-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
          >
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500/50 flex items-center justify-center text-emerald-400 font-bold">N</div>
            <span className="text-[3vw] font-mono">NORMAL</span>
          </motion.div>
          <motion.div 
            className="bg-emerald-500/10 border-2 border-emerald-500 rounded-xl p-4 flex flex-col items-center justify-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.2 }}
          >
            <div className="w-8 h-8 rounded-full border-2 border-emerald-400 flex items-center justify-center text-emerald-400 font-bold">V</div>
            <span className="text-[3vw] font-mono text-emerald-300 font-bold">VINYL WARMTH</span>
          </motion.div>
        </div>

        {/* Processing Bar */}
        <motion.div 
          className="bg-white/5 border border-white/10 rounded-xl p-4 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 2.5 }}
        >
          <div className="flex justify-between text-[3vw] font-mono text-white/60 mb-2">
            <span>PROCESSING STAGES</span>
            <motion.span 
              initial={{ opacity: 1 }} 
              animate={{ opacity: 0 }} 
              transition={{ delay: 4.5 }}
            >
              APPLYING EQ...
            </motion.span>
          </div>
          <div className="h-2 bg-black/50 rounded-full overflow-hidden relative">
            <motion.div 
              className="absolute top-0 left-0 bottom-0 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.0, delay: 2.5, ease: "circOut" }}
            />
          </div>
        </motion.div>

        {/* Master Complete Lockup */}
        <motion.div 
          className="absolute inset-0 bg-[#0a101d] flex flex-col items-center justify-center rounded-2xl border-2 border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.3)] z-30"
          initial={{ scale: 0.8, opacity: 0, pointerEvents: "none" }}
          animate={{ scale: 1, opacity: 1, pointerEvents: "auto" }}
          transition={{ duration: 0.6, delay: 4.8, type: "spring", bounce: 0.4 }}
        >
          <CheckCircle2 className="w-16 h-16 text-emerald-400 mb-4" />
          <h3 className="text-[6vw] font-bold tracking-tight">MASTER COMPLETE</h3>
          <p className="text-[3vw] text-emerald-400/80 font-mono mt-2">LUFS -14 / TRUE PEAK -1.0</p>
        </motion.div>

      </div>
    </motion.div>
  );
}
