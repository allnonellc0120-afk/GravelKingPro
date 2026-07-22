import { motion } from 'framer-motion';
import { CharacterVideo } from './CharacterVideo';

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <CharacterVideo
        dialogue="FIRE! FIRE! This is cool!"
        subDialogue="Signal-level protection that survives metadata stripping."
      />

      {/* Top headline and bullets */}
      <div className="absolute top-[6vh] left-0 right-0 z-20 text-center px-[5vw]">
        <div className="flex items-center justify-center gap-[2vw] mb-[2vh]">
          <motion.svg
            viewBox="0 0 24 24"
            className="w-[4vw] h-[4vw] drop-shadow-[0_0_15px_rgba(245,166,35,0.8)]"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          >
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#F5A623" />
          </motion.svg>
          <motion.h2
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="text-[3vw] font-bold uppercase tracking-tighter text-white drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]"
          >
            GravelKing Pro <span className="text-[#00FFE5]">MLK V3.5</span>
          </motion.h2>
        </div>

        <div className="flex flex-col items-center gap-[1.5vh]">
          {[
            "Signal-Level LSB Steganography",
            "Dual-Anchor Server Handshake (Anchor A + B)",
            "Default of Warrant on Alteration"
          ].map((text, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1 + i * 0.4, duration: 0.5 }}
              className="flex items-center gap-[1vw] text-[1.4vw] font-mono text-white bg-black/50 px-[2vw] py-[0.8vh] rounded-lg"
            >
              <div className="w-[0.8vw] h-[0.8vw] bg-[#F5A623] shadow-[0_0_10px_rgba(245,166,35,0.8)] rotate-45" />
              {text}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
