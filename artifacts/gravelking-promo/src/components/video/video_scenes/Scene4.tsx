import { motion } from 'framer-motion';
import { Mic, Play, Square, Scissors, Layers, SlidersHorizontal } from 'lucide-react';

export function Scene4() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col justify-center items-center z-10 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[#0a0b10] z-0" />

      {/* Title */}
      <motion.div 
        className="absolute top-[8vh] left-[6vw] z-20"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        <h2 className="text-[8vw] font-bold tracking-tight text-white">VOCAL BOOTH</h2>
        <p className="text-[3.5vw] text-sky-400 font-mono tracking-wide mt-1">ARRANGEMENT WORKSPACE</p>
      </motion.div>

      {/* Kinetic Features List */}
      <div className="absolute top-[20vh] w-full flex flex-col items-center gap-2 z-20 text-[5vw] font-bold text-white/40 uppercase tracking-widest text-center">
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, color: "#fff" }} transition={{ delay: 1.0 }}>Record.</motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, color: "#fff" }} transition={{ delay: 2.0 }}>Clip & Splice.</motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, color: "#fff" }} transition={{ delay: 3.0 }}>Duplicate.</motion.div>
        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, color: "#38bdf8" }} transition={{ delay: 4.0 }}>Layer Stems.</motion.div>
      </div>

      {/* Studio UI Mockup */}
      <motion.div 
        className="absolute bottom-[10vh] w-[90vw] h-[45vh] rounded-2xl border border-white/10 bg-[#12141c] p-4 flex flex-col gap-3 shadow-2xl z-20"
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: "0%", opacity: 1 }}
        transition={{ duration: 0.8, delay: 5.0, type: "spring", bounce: 0.2 }}
      >
        
        {/* Toolbar */}
        <div className="flex gap-3 text-white/60 mb-2">
          <div className="p-2 bg-white/5 rounded-lg text-rose-400"><Mic className="w-5 h-5" /></div>
          <div className="p-2 bg-white/5 rounded-lg"><Play className="w-5 h-5" /></div>
          <div className="p-2 bg-white/5 rounded-lg"><Scissors className="w-5 h-5" /></div>
        </div>

        {/* Track 1: Backing */}
        <div className="flex-1 bg-white/[0.02] rounded-xl border border-white/5 relative overflow-hidden flex items-center px-2">
          <div className="w-12 h-12 bg-sky-500/20 rounded flex items-center justify-center mr-3 shrink-0">
            <Layers className="w-5 h-5 text-sky-400" />
          </div>
          <div className="flex-1 h-8 flex items-center gap-1 overflow-hidden opacity-50">
            {[...Array(30)].map((_, i) => (
              <div key={i} className="w-1.5 bg-sky-400 rounded-full" style={{ height: `${Math.random() * 80 + 20}%` }} />
            ))}
          </div>
        </div>

        {/* Track 2: Vocals (Recording) */}
        <div className="flex-1 bg-rose-500/[0.03] rounded-xl border border-rose-500/20 relative overflow-hidden flex items-center px-2">
          <div className="w-12 h-12 bg-rose-500/20 rounded flex items-center justify-center mr-3 shrink-0">
            <Mic className="w-5 h-5 text-rose-400" />
          </div>
          <div className="flex-1 h-8 flex items-center gap-1 overflow-hidden">
            {[...Array(30)].map((_, i) => (
              <motion.div 
                key={i} 
                className="w-1.5 bg-rose-400 rounded-full" 
                initial={{ height: "4px" }}
                animate={{ height: `${Math.random() * 80 + 20}%` }}
                transition={{ duration: 0.2, delay: 6.5 + (i * 0.1) }}
              />
            ))}
          </div>
          {/* Playhead */}
          <motion.div 
            className="absolute top-0 bottom-0 w-0.5 bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,1)]"
            initial={{ left: "20%" }}
            animate={{ left: "90%" }}
            transition={{ duration: 3, delay: 6.5, ease: "linear" }}
          />
        </div>

        {/* Track 3: Panning */}
        <div className="flex-1 bg-white/[0.02] rounded-xl border border-white/5 relative overflow-hidden flex items-center px-2">
          <div className="w-12 h-12 bg-amber-500/20 rounded flex items-center justify-center mr-3 shrink-0">
            <SlidersHorizontal className="w-5 h-5 text-amber-400" />
          </div>
          <div className="flex-1 px-2">
            <div className="text-[2.5vw] text-amber-400/80 mb-1 font-mono">PAN L/R</div>
            <div className="w-full h-2 bg-white/10 rounded-full relative">
              <motion.div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-amber-400 rounded-full shadow-[0_0_10px_rgba(251,191,36,0.6)]"
                initial={{ left: "50%", x: "-50%" }}
                animate={{ left: "80%", x: "-50%" }}
                transition={{ duration: 1.5, delay: 9.0, type: "spring" }}
              />
            </div>
          </div>
        </div>

      </motion.div>

    </motion.div>
  );
}
