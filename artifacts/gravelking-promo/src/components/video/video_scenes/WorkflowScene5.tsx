import { motion } from 'framer-motion';
import { ArrowUpRight, Download, ShoppingBag, Sparkles } from 'lucide-react';

export function WorkflowScene5() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ scale: 0.9, opacity: 0, filter: 'blur(18px)' }}
      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
      exit={{ scale: 1.08, opacity: 0, filter: 'blur(12px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[#08090c] z-0" />
      <motion.img
        src={`${import.meta.env.BASE_URL}images/gold_record.jpg`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-screen"
        initial={{ scale: 1.2, rotate: -4 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 8, ease: 'easeOut' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#08090c]/80 via-[#08090c]/25 to-[#08090c]" />

      <div className="relative z-20 flex w-full flex-col items-center px-[8vw]">
        <motion.div
          className="mb-[7vh] overflow-hidden"
          initial={{ y: '80%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2, type: 'spring', bounce: 0.35 }}
        >
          <h1 className="text-[19vw] font-bold leading-none tracking-tighter text-amber-300 drop-shadow-[0_0_36px_rgba(251,191,36,0.45)]">
            SELL IT.
          </h1>
        </motion.div>

        <motion.div
          className="relative w-[85vw] overflow-hidden rounded-3xl border border-amber-400/30 bg-black/65 p-6 shadow-[0_0_60px_rgba(251,191,36,0.16)] backdrop-blur-xl"
          initial={{ y: 60, opacity: 0, rotateX: 18 }}
          animate={{ y: 0, opacity: 1, rotateX: 0 }}
          transition={{ duration: 0.9, delay: 1, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformPerspective: 1000 }}
        >
          <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <ShoppingBag className="h-7 w-7 text-amber-300" />
              <span className="text-[4.5vw] font-bold tracking-wide text-white">YOUR RELEASE</span>
            </div>
            <ArrowUpRight className="h-6 w-6 text-amber-300" />
          </div>

          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-amber-400 shadow-lg">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[4.5vw] font-semibold text-white">Night Shift</div>
              <div className="font-mono text-[3vw] uppercase tracking-widest text-white/45">Certified master • ready to share</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-3 text-[3.3vw] text-white/70">
              <Download className="h-4 w-4" /> DOWNLOAD
            </div>
            <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-[3.3vw] font-bold text-black">
              <ArrowUpRight className="h-4 w-4" /> RELEASE
            </div>
          </div>
        </motion.div>

        <motion.div
          className="mt-[7vh] text-center font-mono text-[3.5vw] uppercase tracking-[0.22em] text-white/55"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 4.8, duration: 0.6 }}
        >
          gravelkingpro.com
        </motion.div>
        <motion.div
          className="mt-3 text-center text-[4vw] font-medium text-white/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 5.5, duration: 0.7 }}
        >
          Create It. Own It. Release It.
        </motion.div>
      </div>
    </motion.div>
  );
}