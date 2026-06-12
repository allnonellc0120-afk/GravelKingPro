import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene11() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 3500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-black"
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -100 }}
      transition={{ duration: 0.8 }}
    >
      <motion.h2 
        className="text-[4vw] font-bold text-white mb-12"
        initial={{ opacity: 0 }}
        animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
      >
        Affordable Subscriptions.
      </motion.h2>

      <div className="flex gap-8 w-full max-w-5xl px-8">
        <motion.div 
          className="flex-1 bg-[#1c1c1f] rounded-2xl p-8 border border-white/10"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
        >
          <div className="text-white/60 text-xl font-bold mb-2">GravelKing Splits</div>
          <div className="text-[3vw] font-black text-white mb-4">$9.99<span className="text-xl text-white/50">/mo</span></div>
          <ul className="space-y-2 text-white/70">
            <li>Unlimited voice removal</li>
            <li>Unlimited stem splitting</li>
            <li>All 6 mastering presets</li>
          </ul>
        </motion.div>

        <motion.div 
          className="flex-1 bg-[var(--color-primary)]/10 rounded-2xl p-8 border border-[var(--color-primary)]/50 relative overflow-hidden"
          initial={{ opacity: 0, y: 50 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
        >
          <div className="absolute top-0 right-0 bg-[var(--color-primary)] text-black font-bold px-4 py-1 rounded-bl-lg text-sm">
            Full Studio
          </div>
          <div className="text-[var(--color-primary)] text-xl font-bold mb-2">GravelKing Pro</div>
          <div className="text-[3vw] font-black text-white mb-4">$39.99<span className="text-xl text-white/50">/mo</span></div>
          <ul className="space-y-2 text-white/70">
            <li>Full Mix Studio access</li>
            <li>Beat Maker + Songwriter</li>
            <li>Kernel Dashboard</li>
          </ul>
        </motion.div>
      </div>
    </motion.div>
  );
}