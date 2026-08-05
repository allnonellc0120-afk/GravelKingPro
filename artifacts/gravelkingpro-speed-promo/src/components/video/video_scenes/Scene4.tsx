import { motion } from 'framer-motion';

export function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-[#09090b] z-10"
      initial={{ opacity: 0, y: "100vh" }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.2 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Dynamic Background Ring */}
      <motion.div
        className="absolute w-[60vw] h-[60vw] rounded-full border border-white/5"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />
      <motion.div
        className="absolute w-[80vw] h-[80vw] rounded-full border border-white/5"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.5, delay: 0.2, ease: "easeOut" }}
      />

      <div className="relative z-20 flex flex-col items-center text-center w-full">
        <motion.div
          className="overflow-hidden mb-[3vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1, delay: 0.5 }}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: "backOut" }}
          >
            <h2 className="font-heading font-black text-[7vw] leading-[0.9] tracking-tighter text-white uppercase">
              RAW SPEED.
            </h2>
          </motion.div>
        </motion.div>

        <motion.div
          className="overflow-hidden mb-[6vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1, delay: 0.7 }}
        >
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.6, delay: 0.8, ease: "backOut" }}
          >
            <h2 className="font-heading font-bold text-[4vw] leading-[0.9] tracking-tight text-[#ff3a1a] uppercase italic">
              UNCOMPROMISED QUALITY.
            </h2>
          </motion.div>
        </motion.div>

        <motion.div
          className="flex flex-col items-center border-t border-[#ff3a1a]/30 pt-[3vh] px-[5vw]"
          initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 0.8, delay: 1.8, ease: "easeOut" }}
        >
          <span className="font-mono text-[#a1a1aa] text-[1.2vw] tracking-[0.3em] uppercase mb-[1vh]">
            Powered By
          </span>
          <h3 className="font-mono font-bold text-[2vw] text-white tracking-widest">
            MORRIS LAW KERNEL <span className="text-[#ff3a1a]">V3.5</span>
          </h3>
        </motion.div>
        
        {/* Flash effect at the end */}
        <motion.div 
          className="absolute inset-0 bg-white pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.3, delay: 4.5 }}
        />
        
        <motion.div
          className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[2px] bg-[#ff3a1a] rotate-45 pointer-events-none mix-blend-screen"
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: [0, 0.8, 0], scaleX: [0, 1, 0] }}
          transition={{ duration: 0.6, delay: 4.6 }}
        />
        <motion.div
          className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[150vw] h-[2px] bg-[#ff3a1a] -rotate-45 pointer-events-none mix-blend-screen"
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: [0, 0.8, 0], scaleX: [0, 1, 0] }}
          transition={{ duration: 0.6, delay: 4.6 }}
        />
      </div>
    </motion.div>
  );
}
