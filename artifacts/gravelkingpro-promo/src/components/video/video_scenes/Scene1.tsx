import { motion } from 'framer-motion';

export function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-hidden bg-[#09090b] flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(12px)' }}
      transition={{ duration: 0.7 }}
    >
      {/* Ambient gold bloom — center */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: '40vw', height: '40vw', background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Thin horizontal rule — left */}
        <motion.div
          className="absolute top-1/2 left-0 h-[1px] bg-gradient-to-r from-transparent via-[#f59e0b]/30 to-transparent"
          style={{ width: '35vw' }}
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 1.4, delay: 1.8, ease: [0.16, 1, 0.3, 1], transformOrigin: 'left' }}
        />
        {/* Thin horizontal rule — right */}
        <motion.div
          className="absolute top-1/2 right-0 h-[1px] bg-gradient-to-l from-transparent via-[#f59e0b]/30 to-transparent"
          style={{ width: '35vw' }}
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 1.4, delay: 1.8, ease: [0.16, 1, 0.3, 1], transformOrigin: 'right' }}
        />
      </div>

      {/* Label */}
      <motion.p
        className="font-mono text-[0.85vw] tracking-[0.35em] text-[#f59e0b] uppercase mb-[3vh]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        GravelKing Pro — Studio V3.5
      </motion.p>

      {/* Hero headline */}
      <div className="text-center leading-none mb-[6vh]">
        <motion.div
          className="text-[6.5vw] font-black tracking-tighter text-white"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.9, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          The Entire Studio.
        </motion.div>
        <motion.div
          className="text-[6.5vw] font-black tracking-tighter"
          style={{ color: '#f59e0b' }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.9, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          One Browser Tab.
        </motion.div>
      </div>

      {/* Stats row */}
      <motion.div
        className="flex items-center gap-[6vw]"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, delay: 1.1 }}
      >
        {[
          { value: '3–4', label: 'Pro Tracks / Day' },
          { value: '$9.99', label: 'Per Week', gold: true },
          { value: '0', label: 'External Tools' },
        ].map((stat, i) => (
          <div key={i} className="flex flex-col items-center gap-[0.6vh]">
            <span
              className={`text-[3.2vw] font-black tracking-tight leading-none ${stat.gold ? 'text-[#f59e0b]' : 'text-white'}`}
            >
              {stat.value}
            </span>
            <span className="text-[0.8vw] font-mono text-[#52525b] tracking-widest uppercase">
              {stat.label}
            </span>
          </div>
        ))}
      </motion.div>

      {/* Progress bar */}
      <motion.div
        className="absolute bottom-0 left-0 h-[2px] bg-[#f59e0b]"
        initial={{ width: '0%' }}
        animate={{ width: '100%' }}
        transition={{ duration: 5.5, ease: 'linear' }}
      />
    </motion.div>
  );
}
