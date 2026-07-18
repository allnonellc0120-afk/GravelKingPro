import { motion } from 'framer-motion';

const HASH = 'e3b0c44298fc1c149afb f4c8996fb924 27ae41e4649b 934ca495991b 7852b855';
const HMAC  = 'a94a8fe5ccb1 9ba61c4c0873 d391e9879 82fbbd3dc226';

export function Scene6() {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-hidden bg-[#09090b] flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.6 }}
    >
      {/* Ambient gold bloom */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: '65vw', height: '65vw', background: 'radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 60%)' }}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Label */}
      <motion.p
        className="relative z-10 font-mono text-[0.8vw] tracking-[0.35em] text-[#f59e0b] uppercase mb-[2vh]"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.7, delay: 0.1 }}
      >
        05 — IP Certification
      </motion.p>

      {/* Headline */}
      <motion.h2
        className="relative z-10 text-[5.8vw] font-black tracking-tighter text-white leading-none text-center mb-[1.5vh]"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        Cryptographic{' '}
        <span style={{ color: '#f59e0b' }}>Proof.</span>
      </motion.h2>

      <motion.p
        className="relative z-10 text-[1.05vw] text-[#52525b] mb-[5vh]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.7, delay: 0.4 }}
      >
        Embedded invisibly into your audio's least-significant bits. Only GravelKing's server can verify.
      </motion.p>

      {/* Cert card */}
      <motion.div
        className="relative z-10 w-[68vw] rounded-2xl overflow-hidden"
        style={{ background: '#0d0d10', border: '1px solid rgba(245,158,11,0.15)' }}
        initial={{ opacity: 0, y: 36, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Scanning line */}
        <motion.div
          className="absolute left-0 w-full h-[2px] z-20"
          style={{ background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)', boxShadow: '0 0 20px rgba(245,158,11,0.9)' }}
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', delay: 0.8 }}
        />

        {/* Card header */}
        <div className="flex items-center justify-between px-[3vw] py-[2.5vh]" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div className="font-mono text-[0.72vw] text-[#52525b] tracking-widest uppercase mb-[0.5vh]">File</div>
            <div className="text-[1.2vw] font-semibold text-white">master_final_v3.wav</div>
          </div>
          <div>
            <div className="font-mono text-[0.72vw] text-[#52525b] tracking-widest uppercase mb-[0.5vh]">Authorship Score</div>
            <div className="text-[1.2vw] font-semibold text-emerald-400">87 / 100 — ELIGIBLE</div>
          </div>
          <div>
            <div className="font-mono text-[0.72vw] text-[#52525b] tracking-widest uppercase mb-[0.5vh]">Certified</div>
            <div className="text-[1.2vw] font-semibold text-white">2026-07-18 03:14:07 UTC</div>
          </div>
        </div>

        {/* Hash fields */}
        <div className="px-[3vw] py-[3vh] space-y-[3vh]">
          {/* SHA-256 nominator */}
          <div>
            <div className="flex items-center gap-[1vw] mb-[1.2vh]">
              <div className="font-mono text-[0.72vw] text-[#52525b] tracking-widest uppercase">SHA-256 Nominator (Public)</div>
              <div className="ml-auto font-mono text-[0.72vw] text-[#f59e0b]">IN TRACK LSBs</div>
            </div>
            <motion.div
              className="font-mono text-[1vw] text-[#f59e0b] p-[1.5vh] rounded-xl tracking-wider break-all"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.1 }}
            >
              {HASH}
            </motion.div>
          </div>

          {/* HMAC */}
          <div>
            <div className="flex items-center gap-[1vw] mb-[1.2vh]">
              <div className="font-mono text-[0.72vw] text-[#52525b] tracking-widest uppercase">HMAC Denominator (Server-only)</div>
              <div className="ml-auto font-mono text-[0.72vw] text-white/30">NEVER LEAVES SERVER</div>
            </div>
            <motion.div
              className="font-mono text-[1vw] text-[#a1a1aa] p-[1.5vh] rounded-xl tracking-wider break-all"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1.4 }}
            >
              {HMAC}
            </motion.div>
          </div>
        </div>

        {/* Footer */}
        <motion.div
          className="flex items-center gap-[2vw] px-[3vw] py-[2vh]"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(245,158,11,0.04)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, delay: 1.9 }}
        >
          <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-[#f59e0b]" />
          <span className="font-mono text-[0.78vw] text-[#71717a]">Backed up — PostgreSQL + Google Cloud Firestore</span>
          <span className="ml-auto font-mono text-[0.78vw] text-[#f59e0b]">✓ COURT-SUBPOENABLE RECORD</span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
