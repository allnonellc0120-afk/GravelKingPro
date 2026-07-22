import { motion } from 'framer-motion';
import { Beavis } from './Beavis';
import { Butthead } from './Butthead';

export const Scene4 = () => {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center w-full h-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.5 }}
    >
      
      {/* Background glitch effect */}
      <motion.div 
        className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"
      />

      {/* Main TV Screen content */}
      <div className="relative z-10 w-[80vw] h-[40vw] border-[0.5vw] border-zinc-800 bg-black/80 rounded-[2vw] flex flex-col items-center justify-center overflow-hidden mb-[10vw] shadow-[0_0_80px_rgba(0,255,229,0.2)]">
        
        {/* Shield Icon / Animation */}
        <motion.div 
          className="relative flex flex-col items-center justify-center mt-[-4vw]"
          initial={{ scale: 3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.5 }}
        >
          <div className="relative w-[12vw] h-[14vw]">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-zinc-300 drop-shadow-[0_0_15px_rgba(0,255,229,0.5)]">
              <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="currentColor" strokeWidth="1" fill="#18181b" />
              <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="#00FFE5" strokeWidth="0.5" strokeDasharray="4 4" className="animate-[spin_10s_linear_infinite]" />
              <motion.path 
                d="M9 12L11 14L15 10" 
                stroke="#00FFE5" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: 1.5 }}
              />
            </svg>
            
            {/* Status Light */}
            <motion.div 
              className="absolute bottom-[-2vw] left-1/2 -translate-x-1/2 flex items-center gap-[0.5vw] bg-black/50 px-[1vw] py-[0.5vw] rounded-full border border-[#00FFE5]/30"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 2 }}
            >
              <motion.div 
                className="w-[0.8vw] h-[0.8vw] bg-[#00FFE5] rounded-full shadow-[0_0_10px_#00FFE5]"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              />
              <span className="font-mono text-[#00FFE5] text-[0.8vw] tracking-widest whitespace-nowrap">
                HANDSHAKE VALIDATED
              </span>
            </motion.div>
          </div>
        </motion.div>

        {/* Text Content */}
        <div className="flex flex-col items-center mt-[4vw] z-20">
          <motion.h1 
            className="font-heading font-bold text-[3.5vw] text-white tracking-tight uppercase"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.5 }}
          >
            Don't settle for <span className="text-[#F5A623]">passive receipts</span>.
          </motion.h1>
          
          <motion.p 
            className="font-mono text-[#00FFE5] text-[1.5vw] mt-[1vw] tracking-wide"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3 }}
          >
            Secure your masters at the signal level.
          </motion.p>

          <motion.div 
            className="mt-[2vw] bg-[#F5A623] text-black font-mono font-bold text-[2vw] px-[3vw] py-[1vw] rounded-[0.5vw]"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 3.5, type: "spring" }}
            whileHover={{ scale: 1.05 }}
          >
            gravelkingpro.it.com
          </motion.div>
        </div>

      </div>

      {/* Couch / Characters foreground */}
      <div className="absolute bottom-[-5vw] left-0 right-0 h-[25vw] flex items-end justify-center z-30">
        <div className="absolute bottom-0 w-[90vw] h-[15vw] bg-zinc-900 rounded-t-[5vw] border-t-[1vw] border-zinc-700 shadow-2xl flex justify-center items-end px-[10vw]">
          
          <Beavis className="scale-[0.8] origin-bottom mb-[-5vw] mr-[2vw]" />

          <div className="relative">
            <Butthead thumbsUp className="scale-[0.85] origin-bottom mb-[-5vw]" />
            {/* Speech bubble */}
            <motion.div 
              className="absolute top-[-7vw] left-[-20vw] bg-white text-black font-['Permanent_Marker'] text-[1.5vw] px-[1.5vw] py-[1vw] rounded-[1vw] border-[0.3vw] border-black z-50 whitespace-nowrap"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1, type: 'spring' }}
            >
              This is the greatest thing<br/>I have ever seen.
              <div className="absolute bottom-[-1vw] right-[2vw] w-[1vw] h-[1.5vw] bg-white border-r-[0.3vw] border-b-[0.3vw] border-black transform rotate-45" />
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
