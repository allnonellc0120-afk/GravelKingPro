import { motion } from 'framer-motion';

export function Scene8() {
  const tableData = [
    { step: "Write & certify lyrics", tool: "Songwriting Studio", time: "15 min", cost: "Included" },
    { step: "Master track", tool: "Mastering Tool", time: "<2 min", cost: "Included" },
    { step: "Mix multitrack", tool: "Mix Studio", time: "30 min", cost: "Included" },
    { step: "Record vocals", tool: "Vocal Booth", time: "20 min", cost: "Included" },
    { step: "Publish to label", tool: "Label Page", time: "5 min", cost: "Included" },
  ];

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10 overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 bg-[#09090b] -z-10"></div>
      
      {/* Background */}
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ duration: 2 }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/studio_bg.jpg`}
          alt="Studio Background"
          className="w-full h-full object-cover blur-sm"
        />
        <div className="absolute inset-0 bg-[#09090b]/90"></div>
      </motion.div>

      <div className="relative z-10 w-full max-w-[75vw] px-[3vw] mx-auto flex flex-col items-center">
        
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30, filter: "blur(10px)" }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="text-center mb-[6vh]"
        >
          <h2 className="text-[3.5vw] font-bold tracking-tight mb-[1vh]">The New Standard</h2>
          <p className="text-[#f59e0b] font-mono uppercase tracking-widest text-[1vw]">GravelKing Pro Workflow</p>
        </motion.div>

        {/* Cheat Sheet Table */}
        <motion.div
          className="w-full bg-[#18181b]/80 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl mb-[4vh]"
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 30, filter: "blur(10px)" }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          <div className="grid grid-cols-12 gap-[1vw] px-[2vw] py-[2vh] bg-black/60 border-b border-white/10 font-mono text-[0.8vw] text-[#71717a] uppercase tracking-wider">
            <div className="col-span-4">Step</div>
            <div className="col-span-4">Tool</div>
            <div className="col-span-2 text-right">Time</div>
            <div className="col-span-2 text-right">Cost</div>
          </div>
          
          <div className="divide-y divide-white/5 text-[1vw]">
            {tableData.map((row, i) => (
              <motion.div 
                key={i}
                className="grid grid-cols-12 gap-[1vw] px-[2vw] py-[2vh] items-center hover:bg-white/5 transition-colors"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.5, delay: 0.8 + (i * 0.1) }}
              >
                <div className="col-span-4 font-semibold text-white">{row.step}</div>
                <div className="col-span-4 text-[#71717a]">{row.tool}</div>
                <div className="col-span-2 text-right text-white font-mono">{row.time}</div>
                <div className="col-span-2 text-right text-green-400 font-mono">{row.cost}</div>
              </motion.div>
            ))}
          </div>

          <motion.div 
            className="grid grid-cols-12 gap-[1vw] px-[2vw] py-[3vh] bg-[#f59e0b]/10 border-t border-[#f59e0b]/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, delay: 1.5 }}
          >
            <div className="col-span-8 font-bold text-white text-[1.2vw] uppercase tracking-wider">Total</div>
            <div className="col-span-2 text-right font-bold text-white text-[1.2vw] font-mono">~70 min</div>
            <div className="col-span-2 text-right font-bold text-[#f59e0b] text-[1.2vw] font-mono">$9.99/wk</div>
          </motion.div>
        </motion.div>

        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1, delay: 2.2 }}
        >
          <p className="text-[#71717a] text-[1vw]">
            Traditional equivalent: <span className="line-through opacity-50 mr-[0.5vw]">$200–$500/track + 2–5 days</span>
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}
