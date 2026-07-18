import { motion } from 'framer-motion';
import { FullBleed, PageTag, LowerThird } from './pitchKit';

/** Scene 3 — PAGE 02: THE RULING. The copyright exception we operationalize. */
export function Scene3() {
  return (
    <FullBleed img="presenter_gesture.jpg" zoomFrom={1.0} zoomTo={1.08} duration={25}>
      <PageTag num="02" label="The Ruling" />

      <motion.div
        className="absolute left-[4vw] bottom-[18vh] z-30 max-w-[54vw]"
        initial={{ opacity: 0, y: 26 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.9 }}
      >
        <div className="border-l-4 border-amber-500 pl-[1.6vw]">
          <p className="text-[2.2vw] font-bold text-white leading-tight drop-shadow-lg">
            &ldquo;Human creative contribution qualifies&nbsp;&mdash;<br />
            <span className="text-amber-400">if you can prove it.&rdquo;</span>
          </p>
          <p className="mt-[1.2vh] text-[0.95vw] font-mono text-white/55 tracking-[0.2em] uppercase">
            U.S. Copyright Office · 2023 Ruling
          </p>
        </div>
        <motion.p
          className="mt-[2.6vh] text-[1.4vw] text-white/90 font-semibold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 18, duration: 0.9 }}
        >
          No platform existed to prove it. <span className="text-amber-400">We built the proof.</span>
        </motion.p>
      </motion.div>

      <LowerThird delay={0.6} />
    </FullBleed>
  );
}
