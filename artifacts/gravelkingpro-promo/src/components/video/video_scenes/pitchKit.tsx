import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export const BASE = import.meta.env.BASE_URL;

/** Full-bleed image scene with slow Ken Burns motion and a readability gradient. */
export function FullBleed({
  img,
  zoomFrom = 1.06,
  zoomTo = 1.0,
  duration = 14,
  children,
}: {
  img: string;
  zoomFrom?: number;
  zoomTo?: number;
  duration?: number;
  children?: ReactNode;
}) {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
    >
      <motion.div
        className="absolute inset-[-2%] bg-cover bg-center"
        style={{ backgroundImage: `url(${BASE}images/${img})` }}
        initial={{ scale: zoomFrom }}
        animate={{ scale: zoomTo }}
        transition={{ duration, ease: 'linear' }}
      />
      {/* Readability gradient — inline style because this artifact's Tailwind v4
          setup (legacy at-tailwind directives) does not compile gradient-stop
          utilities like from-black or via-black. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.30) 100%)',
        }}
      />
      {children}
    </motion.div>
  );
}

/** Cinematic gold corner brackets. */
export function Brackets() {
  return (
    <>
      <div className="absolute top-[3vh] left-[2vw] w-[3vw] h-[3vw] border-t-2 border-l-2 border-amber-500/50 z-20" />
      <div className="absolute top-[3vh] right-[2vw] w-[3vw] h-[3vw] border-t-2 border-r-2 border-amber-500/50 z-20" />
      <div className="absolute bottom-[3vh] left-[2vw] w-[3vw] h-[3vw] border-b-2 border-l-2 border-amber-500/50 z-20" />
      <div className="absolute bottom-[3vh] right-[2vw] w-[3vw] h-[3vw] border-b-2 border-r-2 border-amber-500/50 z-20" />
    </>
  );
}

/** Deck page marker, top right. */
export function PageTag({ num, label }: { num: string; label: string }) {
  return (
    <motion.div
      className="absolute top-[4vh] right-[4vw] z-30 flex items-baseline gap-[0.8vw]"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.5, duration: 0.7 }}
    >
      <span className="font-mono text-[2.2vw] font-black text-amber-500 leading-none">{num}</span>
      <span className="text-[0.85vw] font-semibold tracking-[0.35em] text-white/70 uppercase">{label}</span>
    </motion.div>
  );
}

/** Presenter lower-third: name, title, LIVE dot. */
export function LowerThird({ delay = 1.0 }: { delay?: number }) {
  return (
    <motion.div
      className="absolute bottom-[5vh] left-[4vw] right-[4vw] z-30"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.8, ease: 'easeOut' }}
    >
      <div className="h-px bg-gradient-to-r from-amber-500/70 via-amber-500/25 to-transparent mb-[1.6vh]" />
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[2.6vw] font-black text-white leading-none drop-shadow-lg">Kevin Morris</div>
          <div className="text-[0.95vw] text-amber-400 font-semibold tracking-[0.25em] uppercase mt-[0.8vh]">
            Founder &amp; CEO · GravelKing Pro
          </div>
        </div>
        <div className="flex items-center gap-[0.6vw] pb-[0.4vh]">
          <motion.div
            className="w-[0.55vw] h-[0.55vw] rounded-full bg-red-500"
            animate={{ opacity: [1, 0.15, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
          <span className="font-mono text-[0.75vw] text-white/50 tracking-[0.3em] uppercase">Live Pitch</span>
        </div>
      </div>
    </motion.div>
  );
}
