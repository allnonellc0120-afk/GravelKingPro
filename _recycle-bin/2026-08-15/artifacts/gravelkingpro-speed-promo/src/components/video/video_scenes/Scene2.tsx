import { motion } from 'framer-motion';

export function Scene2() {
  const competitors = [
    { name: "Human Engineer", time: "1-5 Days", duration: 15, color: "#333", width: "95%" },
    { name: "LANDR", time: "~2-5 Min", duration: 10, color: "#444", width: "80%" },
    { name: "eMastered", time: "~1-3 Min", duration: 8, color: "#444", width: "70%" },
    { name: "CloudBounce", time: "~1-3 Min", duration: 8, color: "#444", width: "70%" },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-10"
      initial={{ opacity: 0, x: "100vw" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-[80vw] mx-auto flex flex-col gap-[3vh] relative z-20">
        
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-[2vh]"
        >
          <h2 className="font-heading font-bold text-[3vw] text-white tracking-tight leading-none">
            3.5-MINUTE TRACK BENCHMARK
          </h2>
          <p className="font-mono text-[#71717a] text-[1vw] mt-[1vh] uppercase tracking-widest">
            Time to master
          </p>
        </motion.div>

        {/* Competitor Bars */}
        <div className="flex flex-col gap-[2vh]">
          {competitors.map((comp, i) => (
            <motion.div 
              key={comp.name}
              className="flex items-center gap-[2vw]"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.5 + i * 0.15 }}
            >
              <div className="w-[12vw] text-right font-body text-[1vw] text-[#a1a1aa] whitespace-nowrap">
                {comp.name}
              </div>
              <div className="flex-1 h-[2vw] bg-[#18181b] rounded-sm relative overflow-hidden">
                <motion.div
                  className="absolute top-0 left-0 bottom-0 rounded-sm"
                  style={{ backgroundColor: comp.color }}
                  initial={{ width: "0%" }}
                  animate={{ width: comp.width }}
                  transition={{ duration: comp.duration, ease: "linear", delay: 1.5 }}
                />
              </div>
              <div className="w-[8vw] font-mono text-[1vw] text-[#71717a]">
                {comp.time}
              </div>
            </motion.div>
          ))}
        </div>

        {/* GravelKing Pro Bar */}
        <motion.div
          className="flex items-center gap-[2vw] mt-[2vh] relative"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 2.5, type: "spring" }}
        >
          <div className="absolute inset-0 bg-[#ff3a1a]/5 blur-xl rounded-full" />
          <div className="w-[12vw] text-right font-heading font-bold text-[1.5vw] text-white whitespace-nowrap relative z-10">
            GravelKing Pro
          </div>
          <div className="flex-1 h-[3vw] bg-[#18181b] rounded-sm relative overflow-hidden border border-[#ff3a1a]/30 shadow-[0_0_20px_rgba(255,58,26,0.15)] z-10">
            <motion.div
              className="absolute top-0 left-0 bottom-0 bg-[#ff3a1a] rounded-sm"
              initial={{ width: "0%" }}
              animate={{ width: "3%" }} // Just a tiny sliver compared to minutes
              transition={{ duration: 0.1, delay: 2.8, type: "spring", stiffness: 400, damping: 25 }}
            />
            
            {/* Instant scanline effect on completion */}
            <motion.div
              className="absolute top-0 bottom-0 w-[5px] bg-white opacity-0"
              initial={{ left: "0%", opacity: 0 }}
              animate={{ left: "3%", opacity: [0, 1, 0] }}
              transition={{ duration: 0.2, delay: 2.85 }}
            />
          </div>
          <motion.div 
            className="w-[8vw] relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: 2.9 }}
          >
            <span className="font-mono font-bold text-[1.8vw] text-[#ff3a1a]">8.5s</span>
            <span className="block font-mono text-[0.8vw] text-white/50">~24x Realtime</span>
          </motion.div>
          
          <motion.div
            className="absolute top-1/2 left-[14vw] w-0 h-[1px] bg-white z-20"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "60vw", opacity: [0, 1, 0] }}
            transition={{ duration: 0.3, delay: 2.8 }}
          />
        </motion.div>

        {/* 30s track stat */}
        <motion.div
          className="absolute -bottom-[8vh] right-[10vw] flex items-center gap-[1vw] border border-white/10 px-[1.5vw] py-[1vh] rounded-md bg-black/50 backdrop-blur-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 4.0, type: "spring" }}
        >
          <span className="w-[1vh] h-[1vh] bg-[#ff3a1a] rounded-full animate-pulse" />
          <span className="font-mono text-[0.9vw] text-[#a1a1aa]">30-second track:</span>
          <span className="font-mono font-bold text-[1vw] text-white">~1.35 seconds</span>
        </motion.div>
        
      </div>
    </motion.div>
  );
}
