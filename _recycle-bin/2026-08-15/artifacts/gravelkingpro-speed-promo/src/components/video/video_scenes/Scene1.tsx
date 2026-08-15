import { motion } from 'framer-motion';

export function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="w-[100vw] h-[1px] bg-[#333]"
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 0.3 }}
          transition={{ duration: 1.5, ease: "circOut" }}
        />
        <motion.div
          className="absolute h-[100vh] w-[1px] bg-[#333]"
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 0.3 }}
          transition={{ duration: 1.5, ease: "circOut", delay: 0.2 }}
        />
      </div>

      <div className="relative z-20 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <span className="font-mono text-[#ff3a1a] text-[1.2vw] tracking-[0.2em] uppercase block mb-[2vh]">
            The Industry Standard
          </span>
        </motion.div>

        <div className="relative overflow-hidden mb-[1vh]">
          <motion.h1
            className="font-heading font-bold text-[6vw] leading-[1.1] tracking-tight text-white"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            MINUTES
          </motion.h1>
        </div>

        <div className="relative overflow-hidden mb-[1vh]">
          <motion.h1
            className="font-heading font-bold text-[3vw] leading-[1.1] tracking-tight text-[#71717a] italic"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 1.6, ease: "easeOut" }}
          >
            VS
          </motion.h1>
        </div>

        <div className="relative overflow-hidden">
          <motion.h1
            className="font-heading font-black text-[8vw] leading-[1] tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-[#ff3a1a]"
            initial={{ y: "-100%", opacity: 0, scale: 1.2, rotateX: -45 }}
            animate={{ y: 0, opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 0.6, delay: 2.2, type: "spring", stiffness: 200, damping: 15 }}
            style={{ transformPerspective: 1000 }}
          >
            SECONDS
          </motion.h1>
          <motion.div
            className="absolute inset-0 bg-[#ff3a1a] mix-blend-screen opacity-0"
            animate={{ opacity: [0, 0.5, 0] }}
            transition={{ duration: 0.4, delay: 2.3 }}
          />
        </div>

        <motion.p
          className="font-body text-[1.5vw] text-[#a1a1aa] mt-[4vh] max-w-[40vw]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 3.5 }}
        >
          Mastering shouldn't be a waiting game.
        </motion.p>
      </div>
      
      {/* Glitch lines */}
      <motion.div
        className="absolute top-[30%] left-0 w-full h-[2px] bg-[#ff3a1a]"
        initial={{ scaleX: 0, opacity: 0, originX: 0 }}
        animate={{ scaleX: [0, 1, 0], opacity: [0, 0.8, 0], originX: [0, 1, 1] }}
        transition={{ duration: 0.6, delay: 2.1 }}
      />
    </motion.div>
  );
}
