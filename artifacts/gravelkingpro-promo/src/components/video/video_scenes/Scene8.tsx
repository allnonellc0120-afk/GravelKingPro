import { motion } from 'framer-motion';
import { FullBleed, PageTag } from './pitchKit';

const WORDS = ['FIRST MOVER', 'NETWORK EFFECTS', 'INDEFENSIBLE'];

/** Scene 8 — PAGE 07: THE MOAT. The moat is the accumulated record. */
export function Scene8() {
  return (
    <FullBleed img="slide_moat.jpg" zoomFrom={1.02} zoomTo={1.06} duration={25}>
      <PageTag num="07" label="The Moat" />

      <div className="absolute bottom-[6vh] left-0 right-0 z-30 flex justify-center gap-[2.2vw]">
        {WORDS.map((w, i) => (
          <motion.span
            key={w}
            className="text-[1.3vw] font-black tracking-[0.2em] text-white bg-black/60 border border-amber-500/40 px-[1.7vw] py-[1.1vh]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 17 + i * 1.5, duration: 0.7 }}
          >
            {w}
          </motion.span>
        ))}
      </div>
    </FullBleed>
  );
}
