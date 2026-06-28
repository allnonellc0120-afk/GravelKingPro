import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const embedLines = [
  '<!-- GravelKingPro IP Certificate -->',
  '<div class="gkp-ip-embed"',
  '  data-track="My Track"',
  '  data-score="82"',
  '  data-certified="2024-06-28"',
  '  data-hash="gkp_a7f2c91e..."',
  '/>',
];

export function Scene4() {
  const [phase, setPhase] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4500),
      setTimeout(() => setPhase(4), 7000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  useEffect(() => {
    if (phase < 2) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setVisibleLines(i);
      if (i >= embedLines.length) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [phase]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center overflow-hidden bg-[#080808]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 0.6 }}
    >
      {/* Scanline effect */}
      <div
        className="absolute inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #ffffff10 2px, #ffffff10 4px)',
        }}
      />

      <div className="relative z-10 flex w-full px-[8vw] items-center justify-between gap-[4vw]">

        {/* Left: headline */}
        <div className="flex flex-col gap-[2vh] w-[45vw]">
          <motion.div
            className="text-[1.3vw] font-black uppercase tracking-[0.5em] text-[#c9a227]/60 font-mono"
            initial={{ opacity: 0 }}
            animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          >
            IP Embed Certificate
          </motion.div>

          <motion.div className="overflow-hidden">
            <motion.h2
              className="text-[5.5vw] font-black uppercase leading-tight tracking-tighter text-white"
              initial={{ y: '110%' }}
              animate={phase >= 1 ? { y: 0 } : { y: '110%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            >
              Prove it's
            </motion.h2>
          </motion.div>
          <motion.div className="overflow-hidden -mt-[1vh]">
            <motion.h2
              className="text-[5.5vw] font-black uppercase leading-tight tracking-tighter text-[#c9a227]"
              initial={{ y: '110%' }}
              animate={phase >= 1 ? { y: 0 } : { y: '110%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.1 }}
            >
              yours.
            </motion.h2>
          </motion.div>

          <AnimatePresence>
            {phase >= 3 && (
              <motion.div
                className="flex flex-col gap-[1.2vh]"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                {['Paste it on your website', 'Add it to your press kit', 'Lock it into your distribution profile', 'Works with Suno, Udio, any platform'].map((item, i) => (
                  <motion.div
                    key={i}
                    className="flex items-center gap-[1.5vw]"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.15 }}
                  >
                    <div className="w-[1.5vw] h-[1.5vw] rounded-full bg-[#c9a227] flex-shrink-0" />
                    <span className="text-[1.8vw] font-bold text-white/70">{item}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: code block */}
        <AnimatePresence>
          {phase >= 2 && (
            <motion.div
              className="w-[42vw] bg-[#0d0d0d] border border-[#c9a227]/30 rounded-xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.9, x: 40 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 0.6, type: 'spring' }}
            >
              <div className="flex items-center gap-2 px-4 py-3 bg-[#c9a227]/10 border-b border-[#c9a227]/20">
                <div className="w-3 h-3 rounded-full bg-red-500/60" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                <div className="w-3 h-3 rounded-full bg-green-500/60" />
                <span className="ml-2 text-[1.2vw] font-mono text-[#c9a227]/60">ip-certificate.html</span>
              </div>
              <div className="p-5 font-mono text-[1.3vw] leading-relaxed">
                {embedLines.map((line, i) => (
                  <motion.div
                    key={i}
                    className={i === 0 ? 'text-white/40' : i >= 4 ? 'text-[#c9a227]' : 'text-white/70'}
                    initial={{ opacity: 0 }}
                    animate={i < visibleLines ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {line}
                  </motion.div>
                ))}
                {visibleLines < embedLines.length && (
                  <motion.span
                    className="inline-block w-2 h-5 bg-[#c9a227]"
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {phase >= 4 && (
          <motion.div
            className="absolute bottom-[4vh] left-0 right-0 flex justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-[#c9a227] text-black px-[4vw] py-[1.2vh] rounded-full font-black text-[1.6vw] uppercase tracking-widest">
              Tamper-Proof · Time-Stamped · Legally Actionable
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
