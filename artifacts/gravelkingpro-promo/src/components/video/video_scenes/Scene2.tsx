import { motion } from 'framer-motion';
import { FullBleed, PageTag } from './pitchKit';

/** Scene 2 — PAGE 01: THE OPPORTUNITY. 200M tracks, zero certified. */
export function Scene2() {
  return (
    <FullBleed img="slide_hook.jpg" zoomFrom={1.03} zoomTo={1.0} duration={16}>
      <PageTag num="01" label="The Opportunity" />
      <motion.div
        className="absolute bottom-[6vh] left-0 right-0 z-30 flex justify-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 10.5, duration: 1 }}
      >
        <div className="px-[2.2vw] py-[1.5vh] border border-amber-500/50 bg-black/60 backdrop-blur-sm">
          <span className="text-[1.5vw] font-bold text-amber-400 tracking-[0.1em]">
            Zero certified. Until tonight.
          </span>
        </div>
      </motion.div>
    </FullBleed>
  );
}
