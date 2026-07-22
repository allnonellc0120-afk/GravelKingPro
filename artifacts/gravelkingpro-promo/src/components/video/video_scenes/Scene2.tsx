import { motion } from 'framer-motion';
import { CharacterVideo } from './CharacterVideo';

export function Scene2() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center bg-[#09090b]"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      {/* Background elements */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(245,166,35,0.05)_0%,transparent_70%)]" />

      <div className="relative z-10 w-full h-full flex items-center justify-center gap-[10vw]">
        
        {/* Left Side: Character */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="flex-shrink-0"
        >
          <CharacterVideo 
            className="w-[30vw]" 
            dialogue="Heh heh... they stole your song, dumbass." 
            speaker="right"
          />
        </motion.div>

        {/* Right Side: The Breaking Chain & ID3 Tag */}
        <div className="flex flex-col items-start w-[40vw]">
          <div className="relative h-[20vw] w-full flex items-center justify-center mb-[2vh]">
            
            {/* The Database Node / Chain */}
            <motion.svg 
              viewBox="0 0 200 100" 
              className="absolute w-[15vw] drop-shadow-[0_0_15px_rgba(0,255,229,0.5)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {/* Left Link */}
              <motion.path 
                d="M 60,30 L 40,30 C 20,30 20,70 40,70 L 60,70" 
                stroke="#00FFE5" 
                strokeWidth="10" 
                fill="none" 
                strokeLinecap="round"
                animate={{ x: [0, -10], opacity: [1, 0.5] }}
                transition={{ delay: 2, duration: 0.5, ease: "easeIn" }}
              />
              {/* Right Link */}
              <motion.path 
                d="M 140,30 L 160,30 C 180,30 180,70 160,70 L 140,70" 
                stroke="#00FFE5" 
                strokeWidth="10" 
                fill="none" 
                strokeLinecap="round"
                animate={{ x: [0, 10], opacity: [1, 0.5] }}
                transition={{ delay: 2, duration: 0.5, ease: "easeIn" }}
              />
              
              {/* Middle Link (Breaks) */}
              <motion.path 
                d="M 50,50 L 150,50" 
                stroke="#F5A623" 
                strokeWidth="12" 
                strokeLinecap="round"
                initial={{ pathLength: 1, opacity: 1 }}
                animate={{ opacity: 0, pathLength: 0, scale: 1.5 }}
                transition={{ delay: 1.8, duration: 0.4 }}
              />
              
              <motion.circle 
                cx="100" cy="50" r="8" 
                fill="#F5A623"
                initial={{ scale: 1, opacity: 1 }}
                animate={{ scale: 3, opacity: 0 }}
                transition={{ delay: 1.8, duration: 0.4 }}
              />
            </motion.svg>
            
            {/* ID3 Tag Box that gets stripped */}
            <motion.div
              className="absolute bg-[#18181b] border border-[#00FFE5] rounded px-[2vw] py-[1vw] shadow-[0_0_20px_rgba(0,255,229,0.2)]"
              initial={{ y: -80, opacity: 0 }}
              animate={{ 
                y: [-80, 0, 0, 150], 
                opacity: [0, 1, 1, 0],
                rotateZ: [0, 0, -10, -45],
                scale: [1, 1, 1, 0.5]
              }}
              transition={{ 
                times: [0, 0.1, 0.6, 1], 
                duration: 3, 
                delay: 0.8 
              }}
            >
              <div className="text-[#00FFE5] font-mono text-[1vw] mb-1">ID3 METADATA</div>
              <div className="text-[#a1a1aa] font-mono text-[0.8vw]">ARTIST: GRAVELKING</div>
              <div className="text-[#a1a1aa] font-mono text-[0.8vw]">ISRC: US-S1Z-99-00001</div>
            </motion.div>
            
            {/* Particle Explosion on Break */}
            <motion.div 
              className="absolute w-[2vw] h-[2vw] bg-[#F5A623] rounded-full blur-[10px]"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 5], opacity: [1, 0] }}
              transition={{ delay: 1.8, duration: 0.6 }}
            />
          </div>

          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.2, duration: 0.6 }}
            className="text-[3vw] font-bold uppercase tracking-tight text-white leading-tight"
          >
            Metadata stripped? <br/>
            <span className="text-[#F5A623]">Chain broken.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.8, duration: 0.6 }}
            className="text-[1.2vw] text-[#71717a] font-mono mt-[2vh] uppercase"
          >
            Receipts don't stop audio theft.
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}
