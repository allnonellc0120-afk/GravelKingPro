import { motion } from 'framer-motion';
import { FullBleed, PageTag } from './pitchKit';

/** Scene 7 — PAGE 06: REVENUE. Three streams, $1M ARR by Month 24. */
export function Scene7() {
  return (
    <FullBleed img="slide_revenue.jpg" zoomFrom={1.02} zoomTo={1.05} duration={38}>
      <PageTag num="06" label="Revenue" />

      <div className="absolute bottom-[6vh] left-0 right-0 z-30 flex justify-center gap-[3vw]">
        <motion.div
          className="text-center bg-black/65 border border-white/20 px-[2vw] py-[1.4vh]"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 24, duration: 0.8 }}
        >
          <div className="text-[0.8vw] font-mono text-white/55 tracking-[0.3em] uppercase">Month 12</div>
          <div className="text-[2vw] font-black text-white leading-tight">$230K ARR</div>
        </motion.div>
        <motion.div
          className="text-center bg-amber-500 px-[2vw] py-[1.4vh]"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0, scale: [1, 1.04, 1] }}
          transition={{
            opacity: { delay: 29, duration: 0.8 },
            y: { delay: 29, duration: 0.8 },
            scale: { delay: 29.8, duration: 1.6, repeat: Infinity },
          }}
        >
          <div className="text-[0.8vw] font-mono text-black/60 tracking-[0.3em] uppercase font-bold">Month 24</div>
          <div className="text-[2vw] font-black text-black leading-tight">$1M ARR</div>
        </motion.div>
      </div>
    </FullBleed>
  );
}
