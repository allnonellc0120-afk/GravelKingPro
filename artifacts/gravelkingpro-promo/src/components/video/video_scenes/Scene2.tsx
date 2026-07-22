import { motion } from 'framer-motion';
import { CharacterVideo } from './CharacterVideo';

export function Scene2() {
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <CharacterVideo
        dialogue="Heh heh... they stole your song, dumbass."
        subDialogue="Receipts don't stop audio theft."
      />

      {/* Top headline */}
      <div className="absolute top-[8vh] left-0 right-0 z-20 text-center px-[5vw]">
        <motion.h2
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-[4vw] font-bold uppercase tracking-tight text-white leading-tight drop-shadow-[0_0_15px_rgba(245,166,35,0.8)]"
        >
          Metadata stripped? <br />
          <span className="text-[#F5A623]">Chain broken.</span>
        </motion.h2>
      </div>

      {/* Chain break graphic overlay */}
      <motion.div
        className="absolute top-[30%] left-1/2 -translate-x-1/2 z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <svg viewBox="0 0 200 100" className="w-[20vw] drop-shadow-[0_0_15px_rgba(0,255,229,0.5)]">
          <motion.path
            d="M 60,30 L 40,30 C 20,30 20,70 40,70 L 60,70"
            stroke="#00FFE5"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            animate={{ x: [0, -10], opacity: [1, 0.5] }}
            transition={{ delay: 2, duration: 0.5, ease: "easeIn" }}
          />
          <motion.path
            d="M 140,30 L 160,30 C 180,30 180,70 160,70 L 140,70"
            stroke="#00FFE5"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            animate={{ x: [0, 10], opacity: [1, 0.5] }}
            transition={{ delay: 2, duration: 0.5, ease: "easeIn" }}
          />
          <motion.path
            d="M 50,50 L 150,50"
            stroke="#F5A623"
            strokeWidth="12"
            strokeLinecap="round"
            initial={{ pathLength: 1, opacity: 1 }}
            animate={{ opacity: 0, pathLength: 0, scale: 1.5 }}
            transition={{ delay: 1.8, duration: 0.4 }}
          />
        </svg>
      </motion.div>
    </motion.div>
  );
}
