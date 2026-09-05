import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';

export function Scene2() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center pt-[10vh] px-[6vw] z-10"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-full flex-1 flex flex-col gap-6 relative">
        
        {/* JAX Response Bubble */}
        <motion.div 
          className="self-start max-w-[85%] rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.04] p-5 backdrop-blur-md"
          initial={{ opacity: 0, x: -20, rotate: -2 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-6 h-6 rounded bg-violet-500/20 text-violet-300 flex items-center justify-center text-xs font-bold">J</div>
            <span className="text-[3vw] text-white/50 uppercase tracking-widest font-mono">JAX</span>
          </div>
          <p className="text-[4vw] leading-relaxed text-white/90">
            I've set the tempo to 68 BPM. Here's a gritty first verse to get us started.
          </p>
        </motion.div>

        {/* Lyric Pad */}
        <motion.div 
          className="self-end w-full rounded-2xl border border-white/15 bg-[#121318] p-6 shadow-2xl relative overflow-hidden"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2, type: "spring", bounce: 0.3 }}
        >
          <motion.div 
            className="absolute top-0 left-0 w-1 h-full bg-violet-500"
            initial={{ scaleY: 0, originY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 0.8, delay: 1.5 }}
          />
          <h3 className="text-[3vw] text-violet-400 font-mono tracking-widest mb-4">[VERSE 1]</h3>
          <div className="space-y-3 text-[4.5vw] font-serif italic text-white/80">
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.0 }}>Midnight train cutting through the cold,</motion.p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.5 }}>Leaving behind a story never told.</motion.p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.0 }}>Wheels are grinding on the rusted track,</motion.p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.5 }}>Ain't no turning, ain't no looking back.</motion.p>
          </div>
        </motion.div>

        {/* Authorship Badge */}
        <motion.div
          className="absolute bottom-[20vh] right-[4vw] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-full px-4 py-2 flex items-center gap-2 backdrop-blur-md shadow-[0_0_20px_rgba(16,185,129,0.2)]"
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 4.5, type: "spring" }}
        >
          <ShieldCheck className="w-5 h-5" />
          <span className="text-[3vw] font-mono tracking-wide">AUTHORSHIP CAPTURED</span>
        </motion.div>

      </div>
    </motion.div>
  );
}
