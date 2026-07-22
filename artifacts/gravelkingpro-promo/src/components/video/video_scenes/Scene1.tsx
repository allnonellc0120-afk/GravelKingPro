import { motion } from 'framer-motion';
import { CharacterVideo } from './CharacterVideo';

export function Scene1() {
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <CharacterVideo
        dialogue="Uh... this sucks."
        subDialogue="External ledgers can't protect your actual audio."
      />

      {/* Top headline */}
      <div className="absolute top-[8vh] left-0 right-0 z-20 text-center px-[5vw]">
        <motion.h1
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="text-[4.5vw] font-bold tracking-tighter text-white uppercase drop-shadow-[0_0_15px_rgba(0,255,229,0.8)]"
        >
          <motion.span
            animate={{ opacity: [1, 0.5, 1, 0.8, 1], x: [0, -2, 2, -1, 0] }}
            transition={{ repeat: Infinity, duration: 2, repeatType: "mirror" }}
            className="inline-block"
          >
            Passive Timestamps
          </motion.span>
          <br />
          <span className="text-[#F5A623]">Are Obsolete.</span>
        </motion.h1>
      </div>
    </motion.div>
  );
}
