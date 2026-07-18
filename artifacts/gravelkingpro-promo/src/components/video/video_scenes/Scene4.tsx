import { motion } from 'framer-motion';
import { FullBleed, PageTag } from './pitchKit';

/** Scene 4 — PAGE 03: THE ENGINE. MLK V3.5, patent pending, split certificate. */
export function Scene4() {
  return (
    <FullBleed img="slide_technology.jpg" zoomFrom={1.02} zoomTo={1.06} duration={25}>
      <PageTag num="03" label="The Engine" />

      <motion.div
        className="absolute top-[4vh] left-[4vw] z-30"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
      >
        <motion.div
          className="px-[1.3vw] py-[1vh] bg-amber-500 text-black font-black text-[0.95vw] tracking-[0.25em] uppercase"
          animate={{ opacity: [1, 0.75, 1] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        >
          Patent Pending
        </motion.div>
      </motion.div>

      <motion.div
        className="absolute bottom-[6vh] left-0 right-0 z-30 flex justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 17, duration: 1 }}
      >
        <span className="text-[1.25vw] font-bold text-white/90 tracking-[0.05em] bg-black/60 px-[2vw] py-[1.3vh] border border-white/15">
          Neither half validates alone. <span className="text-amber-400">We are the sole verification authority.</span>
        </span>
      </motion.div>
    </FullBleed>
  );
}
