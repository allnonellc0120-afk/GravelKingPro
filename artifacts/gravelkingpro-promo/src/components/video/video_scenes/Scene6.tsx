import { motion } from 'framer-motion';
import { FullBleed, PageTag, LowerThird } from './pitchKit';

const STATS = [
  { v: '200M', l: 'Independent Artists' },
  { v: '$200B', l: 'Global Music Industry' },
  { v: '40%', l: 'New Releases AI-Assisted' },
];

/** Scene 6 — PAGE 05: THE MARKET. The market is ownership. */
export function Scene6() {
  return (
    <FullBleed img="presenter_closeup.jpg" zoomFrom={1.0} zoomTo={1.09} duration={25}>
      <PageTag num="05" label="The Market" />

      <div className="absolute right-[4vw] top-[22vh] z-30 flex flex-col gap-[3vh] items-end">
        {STATS.map((s, i) => (
          <motion.div
            key={s.v}
            className="text-right"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.4 + i * 1.7, duration: 0.8 }}
          >
            <div className="text-[3.8vw] font-black text-white leading-none drop-shadow-xl">{s.v}</div>
            <div className="text-[0.9vw] text-amber-400 font-semibold tracking-[0.25em] uppercase mt-[0.6vh]">
              {s.l}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="absolute left-[4vw] bottom-[16vh] z-30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 18, duration: 0.9 }}
      >
        <p className="text-[1.7vw] font-bold text-white drop-shadow-lg">
          The market is not software. <span className="text-amber-400">The market is ownership.</span>
        </p>
      </motion.div>

      <LowerThird delay={0.6} />
    </FullBleed>
  );
}
