import { motion } from 'framer-motion';
import { ShieldCheck, PenLine, Music, Mic, AudioWaveform } from 'lucide-react';

const STEPS = [
  { icon: PenLine, label: 'WRITE' },
  { icon: Music, label: 'COMPOSE' },
  { icon: Mic, label: 'RECORD' },
  { icon: AudioWaveform, label: 'MASTER' },
];

export function Scene6() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10 px-[6vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#08090c] via-violet-950/20 to-[#08090c] z-0" />

      <div className="z-20 flex flex-col items-center">
        <div className="grid grid-cols-4 gap-[4vw] mb-[6vh]">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.label}
              className="flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 30, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.4, type: 'spring', bounce: 0.4 }}
            >
              <div className="w-[14vw] h-[14vw] rounded-2xl border border-violet-400/40 bg-violet-500/10 flex items-center justify-center shadow-[0_0_25px_rgba(167,139,250,0.15)]">
                <step.icon className="w-[6vw] h-[6vw] text-violet-300" />
              </div>
              <span className="text-[2.6vw] font-mono tracking-widest text-white/70">{step.label}</span>
            </motion.div>
          ))}
        </div>

        <motion.div
          className="flex items-center gap-4 mb-[5vh]"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 2.0 }}
        >
          <ShieldCheck className="w-[8vw] h-[8vw] text-emerald-400" />
          <h2 className="text-[7vw] font-bold tracking-tight leading-none">RELEASE<br />WITH PROOF</h2>
        </motion.div>

        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 3.2 }}
        >
          <p className="text-[4vw] text-white/60 mb-2">JAX Songwriting Companion</p>
          <p className="text-[5.5vw] font-bold text-violet-300 tracking-wide">GravelKing Pro</p>
        </motion.div>
      </div>
    </motion.div>
  );
}
