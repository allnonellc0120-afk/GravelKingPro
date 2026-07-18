import { motion } from 'framer-motion';

const PILLARS = [
  {
    label: 'Human Authorship Scored',
    sub: 'Every BPM, instrument, structure, and style you specify is measured. Score ≥25/100 = copyright eligible.',
  },
  {
    label: 'Split-Key Cryptography',
    sub: 'Nominator embedded in track. Denominator + HMAC on server only. Neither half alone proves ownership.',
  },
  {
    label: 'Dual Cloud Backup',
    sub: 'PostgreSQL + Google Firestore. Firestore is independently subpoenable — the record survives GravelKing.',
  },
  {
    label: 'Legally Pioneering',
    sub: 'First platform to cryptographically timestamp human creative direction in AI-assisted music.',
  },
];

export function Scene9() {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-hidden bg-[#09090b] flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.6 }}
    >
      {/* Ambient — indigo/gold blend for IP theme */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-[20%] top-1/2 -translate-y-1/2 rounded-full"
          style={{ width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 65%)' }} />
        <div className="absolute right-[10%] top-[30%] rounded-full"
          style={{ width: '35vw', height: '35vw', background: 'radial-gradient(circle, rgba(245,158,11,0.055) 0%, transparent 65%)' }} />
      </div>

      {/* Header */}
      <div className="relative z-10 pt-[6vh] px-[6vw]">
        <motion.p
          className="font-mono text-[0.8vw] tracking-[0.35em] uppercase mb-[2vh]"
          style={{ color: '#818cf8' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          IP Infrastructure
        </motion.p>
        <motion.h2
          className="text-[5.4vw] font-black tracking-tighter leading-none"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="text-white">AI Music.</span>{' '}
          <span style={{ color: '#818cf8' }}>Finally</span>{' '}
          <span style={{ color: '#f59e0b' }}>Owned.</span>
        </motion.h2>
      </div>

      {/* Authorship score meter — hero visual */}
      <motion.div
        className="relative z-10 mx-[6vw] mt-[4vh] mb-[4vh]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, delay: 0.45 }}
      >
        <div className="flex items-center justify-between mb-[1.5vh]">
          <span className="font-mono text-[0.78vw] text-[#52525b] tracking-widest uppercase">Authorship Score</span>
          <motion.span
            className="font-mono text-[1.2vw] font-bold text-[#f59e0b]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 1.6 }}
          >
            87 / 100
          </motion.span>
        </div>
        {/* Track */}
        <div className="h-[2.8vh] rounded-full overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.06)' }}>
          {/* Copyright threshold marker */}
          <div className="absolute top-0 bottom-0 w-[2px] z-10" style={{ left: '25%', background: 'rgba(255,255,255,0.25)' }} />
          <div className="absolute bottom-[calc(100%+0.6vh)] font-mono text-[0.65vw] text-[#52525b]" style={{ left: '25%', transform: 'translateX(-50%)' }}>
            ≥25 threshold
          </div>
          {/* Fill */}
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #818cf8, #f59e0b)' }}
            initial={{ width: '0%' }}
            animate={{ width: '87%' }}
            transition={{ duration: 1.8, delay: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        {/* Sub-dimension chips */}
        <motion.div
          className="flex gap-[1vw] mt-[2vh] flex-wrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: 1.5 }}
        >
          {[
            { name: 'BPM specified', score: 90 },
            { name: 'Instruments named', score: 85 },
            { name: 'Style described', score: 92 },
            { name: 'Structure designed', score: 88 },
            { name: 'Lyric originality', score: 79 },
          ].map(d => (
            <div key={d.name} className="flex items-center gap-[0.5vw] px-[1vw] py-[0.6vh] rounded-full"
              style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.18)' }}>
              <span className="font-mono text-[0.7vw] text-[#818cf8]">{d.name}</span>
              <span className="font-mono text-[0.7vw] text-[#a5b4fc] font-semibold">{d.score}</span>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* 4 Pillars */}
      <div className="relative z-10 flex-1 grid grid-cols-2 gap-[1.5vw] px-[6vw] pb-[5vh]">
        {PILLARS.map((p, i) => (
          <motion.div
            key={i}
            className="rounded-2xl p-[2vw] flex flex-col gap-[1.2vh]"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, delay: 0.7 + i * 0.12 }}
          >
            <div className="flex items-center gap-[1vw]">
              <div className="w-[0.55vw] h-[0.55vw] rounded-full shrink-0"
                style={{ background: i % 2 === 0 ? '#818cf8' : '#f59e0b' }} />
              <span className="text-[1vw] font-bold text-white">{p.label}</span>
            </div>
            <p className="text-[0.82vw] text-[#52525b] leading-relaxed">{p.sub}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
