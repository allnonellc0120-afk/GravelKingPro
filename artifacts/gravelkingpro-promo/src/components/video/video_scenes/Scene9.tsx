import { motion } from 'framer-motion';

const BULLETS = [
  {
    icon: '✍️',
    headline: 'Human Authorship — Measured, Not Assumed',
    body: 'Every creative decision is scored: BPM you specified, instruments you named, structure you designed, style you described. A score below 25 out of 100 is not enough. Above 25, the Copyright Office threshold for human creative control is met.',
  },
  {
    icon: '🔐',
    headline: 'The Split-Key System',
    body: 'Each certified track carries a nominator — a public half of a cryptographic fingerprint — embedded invisibly in the audio\'s least-significant bits. The denominator lives only on GravelKing\'s server. Neither half alone proves ownership. Together, with an HMAC handshake only GravelKing can regenerate, they are irrefutable.',
  },
  {
    icon: '☁️',
    headline: 'Double-Stored on Google Cloud',
    body: 'Every cert is written simultaneously to our PostgreSQL database AND Google Cloud Firestore. If GravelKing closes tomorrow, a court subpoena against Google retrieves the denominator. The system survives us.',
  },
  {
    icon: '⚖️',
    headline: 'Pioneering AI Music Copyright',
    body: 'The US Copyright Office says AI output alone is not copyrightable — but human selection, arrangement, and creative direction are. GravelKing is the first platform to cryptographically prove and timestamp that human input, making AI-assisted music legally certifiable.',
  },
];

export function Scene9() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[6vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Background pulse */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f]" />
      <motion.div
        className="absolute w-[60vw] h-[60vw] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
          top: '50%', left: '50%', translateX: '-50%', translateY: '-50%',
        }}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 w-full max-w-5xl space-y-[2.5vh]">
        {/* Header */}
        <motion.div
          className="text-center space-y-[0.8vh]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7 }}
        >
          <p className="font-mono text-[0.85vw] tracking-[0.3em] text-indigo-400 uppercase">
            Intellectual Property Infrastructure
          </p>
          <h2 className="text-[2.8vw] font-black leading-tight text-white">
            Copyrighting AI Music —<br />
            <span className="text-indigo-400">For the First Time, Legally</span>
          </h2>
          <p className="text-[1vw] text-[#71717a] max-w-2xl mx-auto leading-relaxed">
            GravelKing doesn't just add a watermark. It builds a tamper-proof legal record
            of every human creative decision — the kind courts recognize.
          </p>
        </motion.div>

        {/* Bullet cards */}
        <div className="grid grid-cols-2 gap-[1.5vw]">
          {BULLETS.map((b, i) => (
            <motion.div
              key={i}
              className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-[1.5vw] space-y-[0.6vh]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.18, duration: 0.6 }}
            >
              <div className="flex items-center gap-[0.8vw]">
                <span className="text-[1.4vw]">{b.icon}</span>
                <p className="text-[0.95vw] font-bold text-white leading-tight">{b.headline}</p>
              </div>
              <p className="text-[0.78vw] text-[#a1a1aa] leading-relaxed">{b.body}</p>
            </motion.div>
          ))}
        </div>

        {/* Bottom legal strip */}
        <motion.div
          className="flex items-center justify-center gap-[2vw] pt-[1vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
        >
          {[
            { label: 'SHA-256 Split Hash', sub: 'Cryptographic fingerprint' },
            { label: 'HMAC Handshake', sub: 'Server-only verification key' },
            { label: 'Dual Cloud Backup', sub: 'Google Firestore + PostgreSQL' },
            { label: 'Style Score 0–100', sub: 'Human authorship meter' },
          ].map((pill, i) => (
            <motion.div
              key={i}
              className="text-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.3 + i * 0.1 }}
            >
              <p className="text-[0.72vw] font-semibold text-indigo-300 tracking-wide">{pill.label}</p>
              <p className="text-[0.6vw] text-[#52525b]">{pill.sub}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
