import { motion } from 'framer-motion';

const LINES = [
  { text: '[Verse 1]', dim: true, delay: 0.9 },
  { text: 'Late nights in the city,', delay: 1.2 },
  { text: 'the neon\'s bleeding through', delay: 1.6, gold: true },
  { text: 'Every shadow on the wall', delay: 2.1 },
  { text: 'is looking just like you', delay: 2.5 },
  { text: '', delay: 2.8 },
  { text: '[Chorus]', dim: true, delay: 3.0 },
  { text: 'I keep chasing every fire', delay: 3.3 },
  { text: 'but you burned it all so bright', delay: 3.7, gold: true },
];

export function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-hidden bg-[#09090b] flex items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.6 }}
    >
      {/* Ambient glow — right side behind editor */}
      <div className="absolute right-[-5vw] top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{ width: '55vw', height: '55vw', background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 65%)' }} />

      {/* Left — Headline column */}
      <div className="relative z-10 w-[42vw] pl-[6vw] flex flex-col justify-center">
        <motion.p
          className="font-mono text-[0.8vw] tracking-[0.35em] text-[#f59e0b] uppercase mb-[3vh]"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          01 — Songwriting Studio
        </motion.p>

        <motion.h2
          className="text-[5.5vw] font-black tracking-tighter text-white leading-none mb-[2vh]"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          AI-Assisted<br />
          <span style={{ color: '#f59e0b' }}>Lyric</span><br />
          Writing.
        </motion.h2>

        <motion.p
          className="text-[1.05vw] text-[#52525b] leading-relaxed max-w-[28vw] mb-[5vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
        >
          Co-write with advanced models. Every creative decision scored. 
          IP stamped with SHA-256 on save.
        </motion.p>

        {/* Stats */}
        <motion.div
          className="flex gap-[2.5vw]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.75 }}
        >
          <div>
            <div className="text-[2vw] font-black text-white">15 min</div>
            <div className="text-[0.72vw] font-mono text-[#52525b] tracking-widest uppercase">Full draft</div>
          </div>
          <div className="w-[1px] bg-white/10" />
          <div>
            <div className="text-[2vw] font-black text-[#f59e0b]">≥25</div>
            <div className="text-[0.72vw] font-mono text-[#52525b] tracking-widest uppercase">Copyright threshold</div>
          </div>
        </motion.div>
      </div>

      {/* Right — Editor panel */}
      <motion.div
        className="relative z-10 flex-1 mr-[5vw] h-[72vh] rounded-2xl overflow-hidden border border-white/8 bg-[#0d0d10]"
        style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        initial={{ opacity: 0, x: 40, rotateY: -8 }}
        animate={{ opacity: 1, x: 0, rotateY: 0 }}
        exit={{ opacity: 0, x: 30 }}
        transition={{ duration: 1.1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Editor chrome */}
        <div className="h-[5.5vh] border-b bg-[#0a0a0d] flex items-center px-[1.5vw] gap-[0.5vw]" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-red-500/50" />
          <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-yellow-500/50" />
          <div className="w-[0.7vw] h-[0.7vw] rounded-full bg-green-500/50" />
          <span className="ml-auto font-mono text-[0.75vw] text-[#3f3f46]">lyrics_v3_final.gkp</span>
        </div>

        {/* Line numbers + code */}
        <div className="flex h-full">
          <div className="w-[3vw] pt-[2vh] flex flex-col items-end pr-[0.8vw] border-r border-white/5 select-none">
            {LINES.map((_, i) => (
              <div key={i} className="font-mono text-[0.8vw] leading-[3.5vh] text-[#27272a]">{i + 1}</div>
            ))}
          </div>
          <div className="flex-1 pt-[2vh] pl-[1.2vw]">
            {LINES.map((line, i) => (
              <motion.div
                key={i}
                className={`font-mono text-[1vw] leading-[3.5vh] ${
                  line.dim ? 'text-[#3f3f46]' : line.gold ? 'text-[#f59e0b]' : 'text-[#d4d4d8]'
                }`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: line.delay }}
              >
                {line.text}
                {i === LINES.length - 1 && (
                  <motion.span
                    className="inline-block w-[0.55vw] h-[1.1em] bg-[#f59e0b] ml-[2px] align-middle"
                    animate={{ opacity: [1, 0, 1] }}
                    transition={{ duration: 0.9, repeat: Infinity }}
                  />
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* IP cert badge — slides in */}
        <motion.div
          className="absolute bottom-[3vh] left-[1.5vw] right-[1.5vw] rounded-xl border px-[1.5vw] py-[1.5vh] flex items-center gap-[1vw]"
          style={{ background: 'rgba(16,185,129,0.07)', borderColor: 'rgba(16,185,129,0.2)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 4.2 }}
        >
          <motion.div
            className="w-[0.9vw] h-[0.9vw] rounded-full border-2 border-emerald-400"
            style={{ borderTopColor: 'transparent' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <span className="font-mono text-[0.85vw] text-emerald-400">IP hash certified — SHA-256 embedded</span>
          <span className="ml-auto font-mono text-[0.75vw] text-emerald-600">✓ VERIFIED</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
