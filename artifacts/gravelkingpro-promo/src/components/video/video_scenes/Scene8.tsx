import { motion } from 'framer-motion';

const TOOLS = [
  { num: '01', name: 'Songwriting Studio',  detail: 'AI-assisted lyrics · IP certified on save',       time: '15 min' },
  { num: '02', name: 'Mastering Tool',       detail: 'MLK v3.5 kernel · 11 broadcast presets',         time: '<2 min' },
  { num: '03', name: 'Mix Studio',           detail: '8-track multitrack · real-time EQ & compression', time: '30 min' },
  { num: '04', name: 'Vocal Booth',          detail: 'Teleprompter sync · professional vocal chain',   time: '20 min' },
  { num: '05', name: 'Artist Label Page',    detail: 'Certified master → live storefront',             time: '5 min'  },
];

export function Scene8() {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-hidden bg-[#09090b] flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(12px)' }}
      transition={{ duration: 0.7 }}
    >
      {/* Ambient gold bloom */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: '90vw', height: '90vw', background: 'radial-gradient(circle, rgba(245,158,11,0.055) 0%, transparent 60%)' }}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 pt-[6vh] pb-[2vh] px-[6vw] flex items-end justify-between">
        <div>
          <motion.p
            className="font-mono text-[0.8vw] tracking-[0.35em] text-[#f59e0b] uppercase mb-[1.5vh]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            The Complete Workflow
          </motion.p>
          <motion.h2
            className="text-[5.5vw] font-black tracking-tighter text-white leading-none"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            The New{' '}
            <span style={{ color: '#f59e0b' }}>Standard.</span>
          </motion.h2>
        </div>

        {/* Price */}
        <motion.div
          className="text-right pb-[1vh]"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        >
          <div className="text-[4vw] font-black text-[#f59e0b] leading-none tracking-tight">$9.99</div>
          <div className="font-mono text-[0.78vw] text-[#52525b] tracking-widest uppercase mt-[0.5vh]">Per Week</div>
        </motion.div>
      </div>

      {/* Divider */}
      <motion.div
        className="relative z-10 mx-[6vw] h-[1px] bg-white/8"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.9, delay: 0.55, ease: [0.16, 1, 0.3, 1], transformOrigin: 'left' }}
      />

      {/* Tool rows */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-[6vw] py-[2vh] gap-[0.6vh]">
        {TOOLS.map((tool, i) => (
          <motion.div
            key={tool.num}
            className="flex items-center gap-[2.5vw] py-[2vh] rounded-xl"
            style={{ borderBottom: i < TOOLS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.6, delay: 0.65 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Number */}
            <div className="font-mono text-[1.1vw] text-[#f59e0b] w-[3vw] shrink-0">{tool.num}</div>

            {/* Name */}
            <div className="text-[1.4vw] font-bold text-white w-[20vw] shrink-0">{tool.name}</div>

            {/* Detail */}
            <div className="text-[0.9vw] text-[#52525b] flex-1">{tool.detail}</div>

            {/* Time */}
            <div className="font-mono text-[1vw] text-white shrink-0">{tool.time}</div>

            {/* Included pill */}
            <div className="font-mono text-[0.72vw] text-emerald-400 w-[5vw] text-right shrink-0">Included</div>
          </motion.div>
        ))}
      </div>

      {/* Bottom comparison */}
      <motion.div
        className="relative z-10 mx-[6vw] mb-[5vh] flex items-center gap-[3vw]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, delay: 1.4 }}
      >
        <div className="h-[1px] flex-1 bg-white/8" />
        <div className="font-mono text-[0.82vw] text-[#3f3f46]">
          Traditional equivalent:{' '}
          <span className="line-through text-[#52525b]">$200–$500/track + 2–5 days</span>
        </div>
        <div className="h-[1px] flex-1 bg-white/8" />
      </motion.div>

      {/* CTA */}
      <motion.div
        className="relative z-10 mx-[6vw] mb-[6vh] text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.9, delay: 1.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="inline-flex items-center gap-[1.5vw] px-[3vw] py-[2vh] rounded-full"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <motion.div
            className="w-[0.6vw] h-[0.6vw] rounded-full bg-[#f59e0b]"
            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-[1.1vw] font-semibold text-white">
            gravelkingpro.it.com
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
