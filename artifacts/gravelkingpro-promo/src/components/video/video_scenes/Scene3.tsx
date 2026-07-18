import { motion } from 'framer-motion';

const PLATFORMS = [
  { name: 'Club / Venue',   lufs: '-11 LUFS', fill: 0.90, color: '#f59e0b' },
  { name: 'Streaming',      lufs: '-14 LUFS', fill: 0.74, color: '#f59e0b' },
  { name: 'Apple Music',    lufs: '-16 LUFS', fill: 0.62, color: '#f59e0b' },
  { name: 'Radio / FM',     lufs: '-23 LUFS', fill: 0.38, color: '#f59e0b' },
];

export function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-hidden bg-[#09090b] flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.6 }}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: '70vw', height: '50vw', background: 'radial-gradient(ellipse, rgba(245,158,11,0.055) 0%, transparent 65%)' }} />
      </div>

      {/* Header */}
      <div className="relative z-10 pt-[7vh] pb-[3vh] px-[6vw]">
        <motion.p
          className="font-mono text-[0.8vw] tracking-[0.35em] text-[#f59e0b] uppercase mb-[2vh]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          02 — Mastering Tool
        </motion.p>
        <motion.h2
          className="text-[5.8vw] font-black tracking-tighter text-white leading-none"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          Broadcast Ready.{' '}
          <span style={{ color: '#f59e0b' }}>Instantly.</span>
        </motion.h2>
      </div>

      {/* LUFS platform bars */}
      <div className="relative z-10 flex-1 px-[6vw] flex flex-col justify-center gap-[2.8vh] pb-[8vh]">
        {PLATFORMS.map((p, i) => (
          <motion.div
            key={p.name}
            className="flex items-center gap-[2vw]"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, delay: 0.5 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Platform name */}
            <div className="w-[12vw] shrink-0 text-right">
              <div className="text-[1.05vw] font-semibold text-white">{p.name}</div>
              <div className="font-mono text-[0.78vw] text-[#52525b]">{p.lufs}</div>
            </div>

            {/* Bar track */}
            <div className="flex-1 h-[3vh] rounded-full bg-white/5 overflow-hidden relative">
              {/* Segment markers */}
              {[0.25, 0.5, 0.75].map(pos => (
                <div key={pos} className="absolute top-0 bottom-0 w-[1px] bg-white/8 z-10" style={{ left: `${pos * 100}%` }} />
              ))}
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${p.color}80, ${p.color})` }}
                initial={{ width: '0%' }}
                animate={{ width: `${p.fill * 100}%` }}
                transition={{ duration: 1.3, delay: 0.8 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            {/* Value pill */}
            <motion.div
              className="shrink-0 w-[4vw] text-center font-mono text-[0.9vw] font-semibold text-[#f59e0b]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 1.2 + i * 0.15 }}
            >
              {Math.round(p.fill * 100)}%
            </motion.div>
          </motion.div>
        ))}
      </div>

      {/* Bottom badge */}
      <motion.div
        className="absolute bottom-[4.5vh] left-1/2 -translate-x-1/2 flex items-center gap-[1.5vw] px-[2.5vw] py-[1.8vh] rounded-full border"
        style={{ background: 'rgba(245,158,11,0.07)', borderColor: 'rgba(245,158,11,0.2)' }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.7, delay: 1.8 }}
      >
        <div className="w-[0.55vw] h-[0.55vw] rounded-full bg-[#f59e0b]" />
        <span className="font-mono text-[0.85vw] text-white tracking-wide">
          Local MLK v3.5 kernel — 44.1kHz · No cloud uploads · &lt;2 min
        </span>
      </motion.div>
    </motion.div>
  );
}
