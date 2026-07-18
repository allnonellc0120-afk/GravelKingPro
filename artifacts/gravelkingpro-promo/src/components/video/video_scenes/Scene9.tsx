import { motion } from 'framer-motion';
import { FullBleed, PageTag, LowerThird, BASE } from './pitchKit';

const ROUTES = ['PARTNER', 'ACQUIRE', 'INVEST'];

/** Scene 9 — PAGE 08: THE ASK. Partner. Acquire. Invest. */
export function Scene9() {
  return (
    <FullBleed img="presenter_leaning.jpg" zoomFrom={1.0} zoomTo={1.08} duration={27}>
      <PageTag num="08" label="The Ask" />

      <div className="absolute left-0 right-0 top-[14vh] z-30 flex flex-col items-center text-center">
        <div className="flex gap-[3vw]">
          {ROUTES.map((w, i) => (
            <motion.div
              key={w}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 + i * 0.9, duration: 0.7 }}
            >
              <span className="text-[1.7vw] font-black tracking-[0.3em] text-white border-b-4 border-amber-500 pb-[0.7vh] drop-shadow-lg">
                {w}
              </span>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="mt-[7vh]"
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 5, duration: 0.9 }}
        >
          <img
            src={`${BASE}images/logo_banner.png`}
            alt="GravelKing Productions"
            className="h-[7vh] mx-auto mb-[2.4vh] drop-shadow-xl"
          />
          <div className="text-[3.4vw] font-black text-amber-400 leading-none drop-shadow-xl">
            gravelkingpro.it.com
          </div>
          <div className="mt-[1.6vh] text-[0.95vw] font-mono text-white/70 tracking-[0.3em] uppercase">
            Patent Pending · Live in Production · No Direct Competitor
          </div>
        </motion.div>

        <motion.div
          className="mt-[5vh] text-[1.6vw] text-white/90 font-semibold"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 22, duration: 1 }}
        >
          Thank you.
        </motion.div>
      </div>

      <LowerThird delay={0.6} />
    </FullBleed>
  );
}
