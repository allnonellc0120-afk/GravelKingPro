import { motion } from 'framer-motion';

export function Scene1() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10 overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 bg-[#09090b]"></div>
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ opacity: 0, scale: 1.1 }}
        animate={{ opacity: 0.4, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 1 } }}
        transition={{ duration: 6, ease: "easeOut" }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/studio_bg.jpg`}
          alt="Studio Background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/80 to-transparent"></div>
      </motion.div>

      <div className="relative z-10 w-full max-w-[85vw] mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30, filter: "blur(10px)" }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
          className="mb-[4vh]"
        >
          <div className="inline-flex items-center gap-[0.8vw] px-[1.5vw] py-[1vh] rounded-full border border-[#f59e0b]/30 bg-[#f59e0b]/10 backdrop-blur-md mb-[2vh]">
            <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-[#f59e0b] animate-pulse"></div>
            <span className="text-[#f59e0b] font-mono text-[1vw] tracking-widest uppercase">The Industry Standard</span>
          </div>
          
          <h1 className="text-[4vw] font-bold tracking-tighter leading-tight">
            The Entire Studio.<br />
            <span className="text-gradient-gold">One Browser Tab.</span>
          </h1>
        </motion.div>

        <motion.div
          className="flex gap-[4vw] mt-[4vh]"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 1.2, staggerChildren: 0.2 }}
        >
          <div className="flex flex-col items-center">
            <span className="text-[3vw] font-mono text-white mb-[1vh]">3-4</span>
            <span className="text-[#71717a] uppercase tracking-widest text-[0.8vw] font-semibold">Pro Tracks / Day</span>
          </div>
          <div className="w-[1px] h-[8vh] bg-white/10"></div>
          <div className="flex flex-col items-center">
            <span className="text-[3vw] font-mono text-[#f59e0b] mb-[1vh]">$9.99</span>
            <span className="text-[#71717a] uppercase tracking-widest text-[0.8vw] font-semibold">Per Week</span>
          </div>
          <div className="w-[1px] h-[8vh] bg-white/10"></div>
          <div className="flex flex-col items-center">
            <span className="text-[3vw] font-mono text-white mb-[1vh]">0</span>
            <span className="text-[#71717a] uppercase tracking-widest text-[0.8vw] font-semibold">External Tools</span>
          </div>
        </motion.div>
      </div>
      
      {/* Dynamic line sweeping */}
      <motion.div 
        className="absolute bottom-0 left-0 h-[2px] bg-[#f59e0b]"
        initial={{ width: "0%" }}
        animate={{ width: "100%" }}
        transition={{ duration: 5.5, ease: "linear" }}
      />
    </motion.div>
  );
}
