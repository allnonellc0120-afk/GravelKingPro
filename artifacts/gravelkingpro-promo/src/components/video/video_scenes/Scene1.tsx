import { motion } from 'framer-motion';
import { FullBleed, Brackets, LowerThird } from './pitchKit';

/** Scene 1 — WELCOME. Kevin at the head of the table, opening the pitch. */
export function Scene1() {
  return (
    <FullBleed img="presenter_welcome.jpg" zoomFrom={1.1} zoomTo={1.0} duration={19}>
      <Brackets />
      <motion.div
        className="absolute top-[4.2vh] left-[4vw] z-30"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.7 }}
      >
        <span className="font-mono text-[0.85vw] text-amber-500/90 tracking-[0.4em] uppercase">
          Investor Presentation · July 2026
        </span>
      </motion.div>

      <motion.div
        className="absolute left-[4vw] top-[26vh] z-30 max-w-[48vw]"
        initial={{ opacity: 0, x: -34 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8, duration: 0.9, ease: 'easeOut' }}
      >
        <h1 className="text-[4.6vw] font-black leading-[1.02] text-white drop-shadow-xl">
          The Future of<br />
          <span className="text-amber-400">Music Ownership.</span>
        </h1>
        <motion.p
          className="mt-[2.4vh] text-[1.25vw] text-white/80 font-medium leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.0, duration: 0.8 }}
        >
          Patent-pending technology. Live in production.<br />
          The first cryptographic music IP platform on earth.
        </motion.p>
      </motion.div>

      <LowerThird delay={2.6} />
    </FullBleed>
  );
}
