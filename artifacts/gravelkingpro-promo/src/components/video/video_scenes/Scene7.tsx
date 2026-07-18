import { motion } from 'framer-motion';

export function Scene7() {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-hidden bg-[#09090b] flex items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.6 }}
    >
      {/* Ambient glow right */}
      <div className="absolute right-[-5vw] top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
        style={{ width: '55vw', height: '55vw', background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 65%)' }} />

      {/* Left — headline */}
      <div className="relative z-10 w-[44vw] pl-[6vw] flex flex-col justify-center">
        <motion.p
          className="font-mono text-[0.8vw] tracking-[0.35em] text-[#f59e0b] uppercase mb-[3vh]"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          06 — Artist Label Page
        </motion.p>

        <motion.h2
          className="text-[5.5vw] font-black tracking-tighter text-white leading-none mb-[3vh]"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          Publish.<br />
          <span style={{ color: '#f59e0b' }}>In 5</span><br />
          Minutes.
        </motion.h2>

        <motion.p
          className="text-[1.05vw] text-[#52525b] leading-relaxed max-w-[28vw] mb-[5vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.55 }}
        >
          Push your certified master directly to your storefront.
          Certified IP attached. Streaming-ready. From final mix to live release.
        </motion.p>

        {/* Time breakdown */}
        <motion.div
          className="flex flex-col gap-[1.5vh]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.75 }}
        >
          {[
            { step: 'Upload certified master', time: '30 sec' },
            { step: 'Set price & description', time: '2 min' },
            { step: 'Go live on storefront', time: '1 min' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-[1.5vw]">
              <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-[#f59e0b] shrink-0" />
              <span className="text-[0.95vw] text-[#a1a1aa] flex-1">{item.step}</span>
              <span className="font-mono text-[0.85vw] text-[#f59e0b]">{item.time}</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Right — release card */}
      <motion.div
        className="relative z-10 flex-1 mr-[5vw] flex flex-col"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 30 }}
        transition={{ duration: 1.1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Album art — pure CSS gradient */}
        <div className="relative w-full rounded-2xl overflow-hidden mb-[2.5vh]" style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(135deg, #1a0a00 0%, #3d1f00 30%, #0a0a0f 60%, #0f0a1a 100%)',
          }} />
          {/* Decorative light rays */}
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at 30% 50%, rgba(245,158,11,0.18) 0%, transparent 55%)',
          }} />
          <div className="absolute inset-0" style={{
            background: 'radial-gradient(ellipse at 80% 30%, rgba(120,80,200,0.10) 0%, transparent 50%)',
          }} />
          {/* Grid lines */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: 'linear-gradient(rgba(245,158,11,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.4) 1px, transparent 1px)',
            backgroundSize: '5vw 5vw',
          }} />

          {/* Title overlay */}
          <div className="absolute bottom-[3vh] left-[2.5vw]">
            <p className="text-[2.4vw] font-black tracking-tighter text-white leading-none">Neon Bleeding</p>
            <p className="font-mono text-[0.85vw] text-[#f59e0b] mt-[0.5vh]">Released via GravelKing</p>
          </div>

          {/* Cert badge */}
          <motion.div
            className="absolute top-[2.5vh] right-[2vw] flex items-center gap-[0.5vw] px-[1vw] py-[0.8vh] rounded-full"
            style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 1.2 }}
          >
            <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-[#f59e0b]" />
            <span className="font-mono text-[0.72vw] text-[#f59e0b]">IP CERTIFIED</span>
          </motion.div>
        </div>

        {/* Action buttons */}
        <motion.div
          className="flex gap-[1.5vw]"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.85 }}
        >
          <motion.button
            className="flex-1 py-[2vh] rounded-xl text-black font-bold text-[1.1vw] tracking-wide flex items-center justify-center gap-[0.8vw]"
            style={{ background: '#f59e0b' }}
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Publish Release
          </motion.button>
          <button
            className="flex-1 py-[2vh] rounded-xl font-semibold text-[1.1vw] text-white tracking-wide"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Preview Storefront
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
