import { motion } from 'framer-motion';

export function Scene2() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center z-10 overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 bg-[#09090b] -z-10"></div>
      {/* Background layer */}
      <motion.div
        className="absolute right-0 top-0 w-3/5 h-full z-0 opacity-20"
        initial={{ x: '20%', opacity: 0 }}
        animate={{ x: '0%', opacity: 0.3 }}
        exit={{ x: '10%', opacity: 0 }}
        transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#f59e0b]/40 via-transparent to-transparent"></div>
      </motion.div>

      <div className="relative z-10 w-full max-w-[85vw] px-[4vw] mx-auto grid grid-cols-2 gap-[4vw] items-center">
        
        {/* Text Column */}
        <div className="flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20, filter: "blur(10px)" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          >
            <div className="text-[#f59e0b] font-mono text-[1vw] tracking-widest uppercase mb-[2vh]">Step 01 // Songwriting Studio</div>
            <h2 className="text-[4vw] font-bold tracking-tight mb-[3vh] leading-tight">
              AI-Assisted<br />Lyric Writing
            </h2>
            <p className="text-[#71717a] text-[1.2vw] max-w-[30vw] font-light">
              Co-write with advanced models. Get your IP stamped with a SHA-256 hash immediately. Authorship guaranteed.
            </p>
          </motion.div>
          
          <motion.div 
            className="mt-[5vh] flex gap-[2vw]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            <div className="glass-panel px-[2vw] py-[1.5vh] rounded-xl border border-white/10">
              <div className="text-[0.8vw] text-[#71717a] font-mono mb-1">Time</div>
              <div className="text-[1.5vw] font-semibold text-white">15 min</div>
            </div>
            <div className="glass-panel px-[2vw] py-[1.5vh] rounded-xl border border-[#f59e0b]/30 bg-[#f59e0b]/5 text-[#f59e0b]">
              <div className="text-[0.8vw] font-mono mb-1 text-[#f59e0b]/70">IP Score</div>
              <div className="text-[1.5vw] font-semibold">99.8%</div>
            </div>
          </motion.div>
        </div>

        {/* Visual / UI Mockup Column */}
        <motion.div
          className="relative h-[65vh] w-full rounded-2xl border border-white/10 bg-[#18181b]/50 overflow-hidden shadow-2xl glass-panel"
          initial={{ opacity: 0, scale: 0.9, rotateY: 15 }}
          animate={{ opacity: 1, scale: 1, rotateY: 0 }}
          exit={{ opacity: 0, scale: 1.1, rotateY: -10 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
          style={{ perspective: 1000 }}
        >
          {/* UI Header */}
          <div className="absolute top-0 left-0 w-full h-[6vh] border-b border-white/5 bg-black/40 flex items-center px-[1.5vw]">
            <div className="flex gap-2">
              <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-red-500/50"></div>
              <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-yellow-500/50"></div>
              <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-green-500/50"></div>
            </div>
            <div className="mx-auto text-[0.8vw] font-mono text-[#71717a]">lyrics_v3_final.txt</div>
          </div>
          
          {/* Editor Content */}
          <div className="absolute top-[8vh] left-[2vw] right-[2vw] font-mono text-[1vw] space-y-[2vh]">
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "100%" }}
              transition={{ duration: 2, delay: 1 }}
              className="text-[#71717a]"
            >
              [Verse 1]
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1, delay: 1.5 }}
            >
              Late nights in the city, the <span className="text-[#f59e0b]">neon's bleeding</span> through
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1, delay: 1.8 }}
            >
              Every shadow on the wall is looking just like you
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 2.5 }}
              className="mt-[6vh] p-[2vh] rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 flex items-center gap-[1vw]"
            >
              <div className="w-[1vw] h-[1vw] rounded-full border-2 border-green-400 border-t-transparent animate-spin"></div>
              Certifying IP with SHA-256...
            </motion.div>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
