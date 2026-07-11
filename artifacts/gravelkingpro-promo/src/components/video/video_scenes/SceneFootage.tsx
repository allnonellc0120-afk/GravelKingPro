import { motion } from 'framer-motion';

export function SceneFootage() {
  return (
    <motion.div
      className="absolute inset-0 z-20 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <motion.div
        className="absolute top-[3vh] left-[3vw] flex items-center gap-[1vw]"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        <motion.div
          className="flex items-center gap-[0.6vw] bg-[#c9a227] text-black px-[1.2vw] py-[0.6vh] rounded-full"
          animate={{ opacity: [1, 0.7, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-[0.6vw] h-[0.6vw] rounded-full bg-black" />
          <span className="text-[1vw] font-black tracking-widest uppercase">Live Demo</span>
        </motion.div>
      </motion.div>

      <motion.div
        className="absolute bottom-[6vh] left-0 right-0 flex flex-col items-center gap-[1.5vh]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.6 }}
      >
        <div className="text-[1.8vw] font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
          Before → After — Hear the difference
        </div>
        <div className="text-[1vw] text-white/60 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          Real recording · Unedited audio · MLK v3 kernel
        </div>
      </motion.div>
    </motion.div>
  );
}
