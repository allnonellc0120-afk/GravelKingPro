import { motion } from 'framer-motion';
import { CharacterVideo } from './CharacterVideo';

export function Scene4() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-[#09090b]"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      {/* Background Rings / Radial Glow */}
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
        <motion.div 
          className="absolute w-[80vw] h-[80vw] rounded-full border-[1px] border-[#00FFE5]/10"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
        <motion.div 
          className="absolute w-[60vw] h-[60vw] rounded-full border-[1px] border-[#00FFE5]/20"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear", delay: 1 }}
        />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-[5vw]">
        
        {/* Top: Character */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="absolute top-[8vh] right-[8vw]"
        >
          <CharacterVideo 
            className="w-[25vw]" 
            dialogue="This is the greatest thing I've ever seen." 
            speaker="left"
          />
        </motion.div>

        {/* Center: Metallic Shield */}
        <motion.div 
          className="relative w-[15vw] h-[18vw] mb-[4vh]"
          initial={{ scale: 0, rotateY: 90 }}
          animate={{ scale: 1, rotateY: 0 }}
          transition={{ delay: 0.8, type: "spring", stiffness: 100, damping: 15 }}
        >
          <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-[0_20px_30px_rgba(0,0,0,0.8)]">
            <defs>
              <linearGradient id="metalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4a4a52" />
                <stop offset="50%" stopColor="#27272a" />
                <stop offset="100%" stopColor="#18181b" />
              </linearGradient>
              <linearGradient id="edgeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#71717a" />
                <stop offset="50%" stopColor="#a1a1aa" />
                <stop offset="100%" stopColor="#f4f4f5" />
              </linearGradient>
            </defs>

            {/* Shield Base */}
            <path 
              d="M 10,10 L 90,10 L 90,60 C 90,90 50,110 50,110 C 50,110 10,90 10,60 Z" 
              fill="url(#metalGrad)" 
              stroke="url(#edgeGrad)" 
              strokeWidth="3" 
            />

            {/* Inner Shield Overlay */}
            <path 
              d="M 20,20 L 80,20 L 80,55 C 80,80 50,95 50,95 C 50,95 20,80 20,55 Z" 
              fill="#09090b" 
              stroke="#27272a" 
              strokeWidth="2" 
            />

            {/* Core Lock Symbol */}
            <rect x="35" y="45" width="30" height="25" rx="3" fill="#3f3f46" stroke="#00FFE5" strokeWidth="1" />
            <path d="M 40,45 L 40,35 C 40,25 60,25 60,35 L 60,45" fill="none" stroke="#00FFE5" strokeWidth="4" />
            
            {/* Status LED (Green) */}
            <motion.circle 
              cx="50" cy="58" r="4" 
              fill="#22c55e"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.5, 1] }}
              transition={{ delay: 1.5, duration: 1, repeat: Infinity, repeatType: "mirror" }}
            />
          </svg>

          {/* Validation Status Box */}
          <motion.div 
            className="absolute top-[70%] left-1/2 -translate-x-1/2 bg-black border border-[#22c55e] px-[1vw] py-[0.5vw] whitespace-nowrap rounded"
            initial={{ opacity: 0, y: 10, scale: 0.8, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            transition={{ delay: 1.8, type: "spring" }}
          >
            <span className="text-[#22c55e] font-mono text-[0.8vw] tracking-wider font-bold shadow-[#22c55e]">
              HANDSHAKE VALIDATED
            </span>
          </motion.div>
        </motion.div>

        {/* Typography */}
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2, duration: 0.6 }}
          className="text-[4vw] font-bold uppercase tracking-tight text-white leading-none text-center drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
        >
          Don't settle for <br/>
          <span className="text-[#00FFE5]">passive receipts.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.8, duration: 0.6 }}
          className="text-[1.5vw] text-[#a1a1aa] font-mono mt-[2vh] uppercase"
        >
          Secure your masters at the signal level.
        </motion.p>

        {/* URL Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.2, duration: 0.6 }}
          className="mt-[4vh] border-t border-b border-[#F5A623] py-[1vh] px-[4vw]"
        >
          <span className="text-[2vw] font-bold tracking-widest text-[#F5A623]">
            GRAVELKINGPRO.IT.COM
          </span>
        </motion.div>

      </div>
    </motion.div>
  );
}
