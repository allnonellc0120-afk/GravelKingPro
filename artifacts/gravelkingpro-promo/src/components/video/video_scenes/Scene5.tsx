import { motion } from 'framer-motion';

const LYRICS = [
  { text: 'Late nights in the city,', active: false },
  { text: 'the neon\'s bleeding through', active: true },
  { text: 'Every shadow on the wall', active: false },
  { text: 'is looking just like you', active: false },
];

export function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-hidden bg-[#09090b] flex items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.6 }}
    >
      {/* Ambient glow left */}
      <div className="absolute left-[-5vw] top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{ width: '55vw', height: '55vw', background: 'radial-gradient(circle, rgba(245,158,11,0.055) 0%, transparent 65%)' }} />

      {/* Left — waveform + title */}
      <div className="relative z-10 w-[44vw] pl-[6vw] flex flex-col justify-center">
        <motion.p
          className="font-mono text-[0.8vw] tracking-[0.35em] text-[#f59e0b] uppercase mb-[3vh]"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          04 — Vocal Booth
        </motion.p>

        <motion.h2
          className="text-[5.5vw] font-black tracking-tighter text-white leading-none mb-[4vh]"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          Record Over<br />
          <span style={{ color: '#f59e0b' }}>Backing</span><br />
          Tracks.
        </motion.h2>

        {/* Waveform visualization */}
        <motion.div
          className="flex items-center gap-[0.25vw] h-[10vh] mb-[4vh]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.6 }}
        >
          {Array.from({ length: 50 }).map((_, i) => {
            const seed = Math.sin(i * 0.8) * 0.5 + 0.5;
            return (
              <motion.div
                key={i}
                className="flex-1 rounded-full"
                style={{ background: i % 3 === 0 ? '#f59e0b' : 'rgba(255,255,255,0.18)' }}
                animate={{ height: [`${seed * 80 + 10}%`, `${(1 - seed) * 70 + 10}%`] }}
                transition={{
                  duration: 0.3 + seed * 0.4,
                  repeat: Infinity,
                  repeatType: 'reverse',
                  delay: i * 0.025,
                  ease: 'easeInOut',
                }}
              />
            );
          })}
        </motion.div>

        {/* REC badge */}
        <motion.div
          className="flex items-center gap-[1vw]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: 0.85 }}
        >
          <motion.div
            className="w-[0.9vw] h-[0.9vw] rounded-full bg-red-500"
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: 0.9, repeat: Infinity }}
          />
          <span className="font-mono text-[0.85vw] text-red-400 tracking-widest">RECORDING</span>
          <span className="font-mono text-[0.85vw] text-[#52525b] ml-auto">01:24:08</span>
        </motion.div>
      </div>

      {/* Right — Teleprompter panel */}
      <motion.div
        className="relative z-10 flex-1 mr-[5vw] h-[72vh] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: '#0a0a0c', border: '1px solid rgba(245,158,11,0.12)' }}
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 30 }}
        transition={{ duration: 1.1, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Header */}
        <div className="h-[6vh] flex items-center justify-between px-[2vw] shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="font-mono text-[0.75vw] text-[#52525b] tracking-wider">TELEPROMPTER</span>
          <div className="flex items-center gap-[0.7vw]">
            <motion.div className="w-[0.6vw] h-[0.6vw] rounded-full bg-red-500" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />
            <span className="font-mono text-[0.72vw] text-red-400">LIVE</span>
          </div>
        </div>

        {/* Active line indicator */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18vh] bg-[#f59e0b] rounded-r-full" />

        {/* Lyrics */}
        <div className="flex-1 flex flex-col justify-center px-[3.5vw] gap-[3.5vh] overflow-hidden">
          {LYRICS.map((line, i) => (
            <motion.div
              key={i}
              className={`text-[2.6vw] font-black tracking-tight leading-none transition-all ${
                line.active ? '' : 'opacity-20'
              }`}
              style={{ color: line.active ? '#f59e0b' : 'white' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{
                opacity: line.active ? 1 : 0.2,
                y: 0,
                color: line.active ? '#f59e0b' : '#ffffff',
              }}
              transition={{ duration: 0.7, delay: 0.6 + i * 0.2 }}
            >
              {line.text}
            </motion.div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="h-[1.5vh] mx-[2vw] mb-[3vh] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div
            className="h-full bg-[#f59e0b] rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: '38%' }}
            transition={{ duration: 2.5, delay: 1.2, ease: 'linear' }}
          />
        </div>

        {/* Effects strip */}
        <motion.div
          className="mx-[2vw] mb-[3vh] rounded-xl px-[1.5vw] py-[1.5vh] flex items-center gap-[1.5vw]"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: 1.8 }}
        >
          {['EQ', 'Compressor', 'Reverb', 'De-esser'].map(fx => (
            <div key={fx} className="flex items-center gap-[0.4vw]">
              <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-[#f59e0b]" />
              <span className="font-mono text-[0.75vw] text-[#71717a]">{fx}</span>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
