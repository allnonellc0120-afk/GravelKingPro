import { motion } from 'framer-motion';

const CHANNELS = [
  { name: 'KICK',   color: '#f59e0b', fader: 0.72 },
  { name: 'SNARE',  color: '#f59e0b', fader: 0.65 },
  { name: 'HI-HAT', color: '#f59e0b', fader: 0.48 },
  { name: 'BASS',   color: '#f59e0b', fader: 0.80 },
  { name: 'LEAD',   color: '#f59e0b', fader: 0.58 },
  { name: 'PAD',    color: '#f59e0b', fader: 0.42 },
  { name: 'VX 1',   color: '#f59e0b', fader: 0.88 },
  { name: 'VX 2',   color: '#f59e0b', fader: 0.35 },
];

export function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 z-10 overflow-hidden bg-[#09090b] flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.6 }}
    >
      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: '90vw', height: '60vw', background: 'radial-gradient(ellipse, rgba(245,158,11,0.045) 0%, transparent 65%)' }} />
      </div>

      {/* Header */}
      <div className="relative z-10 pt-[7vh] px-[6vw]">
        <motion.p
          className="font-mono text-[0.8vw] tracking-[0.35em] text-[#f59e0b] uppercase mb-[2vh]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
        >
          03 — Mix Studio
        </motion.p>
        <motion.h2
          className="text-[5.8vw] font-black tracking-tighter text-white leading-none"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          8-Track Live{' '}
          <span style={{ color: '#f59e0b' }}>Multitrack.</span>
        </motion.h2>
      </div>

      {/* Mixer console */}
      <motion.div
        className="relative z-10 flex-1 flex items-end px-[5vw] pb-[8vh] gap-[1.2vw] justify-center"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 1, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {CHANNELS.map((ch, i) => (
          <motion.div
            key={ch.name}
            className="flex-1 max-w-[8vw] flex flex-col items-center gap-[1.5vh] rounded-2xl py-[2.5vh] px-[0.5vw]"
            style={{ background: 'rgba(255,255,255,0.028)', border: '1px solid rgba(255,255,255,0.06)' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.55 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Channel name */}
            <div className="font-mono text-[0.65vw] text-[#52525b] tracking-widest">{ch.name}</div>

            {/* EQ knobs */}
            <div className="flex flex-col gap-[1.4vh]">
              {[0, 1, 2].map((k) => (
                <div key={k} className="relative w-[2.2vw] h-[2.2vw] rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <motion.div
                    className="absolute w-[1.5px] bg-[#f59e0b] rounded-full"
                    style={{ height: '45%', top: '10%', transformOrigin: 'bottom center' }}
                    animate={{ rotate: [-35, 35, -20][k] + Math.sin(i * 1.2 + k) * 25 }}
                    transition={{ duration: 3, repeat: Infinity, repeatType: 'reverse', delay: i * 0.2 + k * 0.4, ease: 'easeInOut' }}
                  />
                </div>
              ))}
            </div>

            {/* Fader track */}
            <div className="relative flex-1 w-full flex justify-center mt-[1vh]">
              <div className="relative w-[2px] h-[16vh] rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <motion.div
                  className="absolute left-1/2 -translate-x-1/2 w-[2.4vw] h-[3vh] rounded-md shadow-lg cursor-pointer"
                  style={{
                    background: 'linear-gradient(180deg, #d4d4d8, #71717a)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    bottom: 0,
                  }}
                  initial={{ bottom: '10%' }}
                  animate={{ bottom: `${ch.fader * 75}%` }}
                  transition={{ duration: 1.4, delay: 0.9 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>

            {/* Level meter */}
            <div className="w-full h-[5vh] flex gap-[1.5px] items-end px-[0.3vw]">
              {Array.from({ length: 8 }).map((_, bar) => (
                <motion.div
                  key={bar}
                  className="flex-1 rounded-sm"
                  style={{ background: bar < 5 ? '#f59e0b' : bar < 7 ? '#f97316' : '#ef4444' }}
                  animate={{ height: [`${(Math.random() * 0.5 + 0.2) * ch.fader * 100}%`, `${(Math.random() * 0.5 + 0.2) * ch.fader * 100}%`] }}
                  transition={{ duration: 0.18, repeat: Infinity, delay: bar * 0.02 + i * 0.05 }}
                />
              ))}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Bottom strip */}
      <motion.div
        className="absolute bottom-[3vh] left-1/2 -translate-x-1/2 font-mono text-[0.82vw] text-[#3f3f46] tracking-widest"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, delay: 1.6 }}
      >
        Real-time EQ · Compression · Reverb · Metering ·{' '}
        <span className="text-[#f59e0b]">Zero Latency</span>
      </motion.div>
    </motion.div>
  );
}
