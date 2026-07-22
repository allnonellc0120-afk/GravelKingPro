import { motion } from 'framer-motion';
import { Beavis } from './Beavis';
import { Butthead } from './Butthead';

export const Scene1 = () => {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center w-full h-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
      transition={{ duration: 0.5 }}
    >
      
      {/* Background glitch effect */}
      <motion.div 
        className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"
        animate={{ backgroundPosition: ['0% 0%', '100% 100%'] }}
        transition={{ repeat: Infinity, duration: 0.2 }}
      />

      {/* Main TV Screen content */}
      <div className="relative z-10 w-[80vw] h-[40vw] border-[0.5vw] border-zinc-800 bg-black/80 rounded-[2vw] flex flex-col items-center justify-center overflow-hidden mb-[10vw] shadow-[0_0_50px_rgba(0,255,229,0.1)]">
        
        {/* Flat Waveform */}
        <div className="absolute inset-0 flex items-center justify-center opacity-30">
          <motion.div 
            className="w-[90%] h-[2vw] bg-[#00FFE5]"
            animate={{ 
              scaleY: [1, 1.2, 0.8, 1],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ repeat: Infinity, duration: 0.1 }}
          />
        </div>

        {/* Glitch Overlay */}
        <motion.div 
          className="absolute inset-0 bg-[#F5A623] mix-blend-overlay pointer-events-none"
          animate={{ opacity: [0, 0.2, 0, 0.5, 0] }}
          transition={{ repeat: Infinity, duration: 2, times: [0, 0.1, 0.2, 0.3, 1] }}
        />

        {/* Text */}
        <motion.h1 
          className="font-mono text-[#00FFE5] text-[4vw] font-bold text-center tracking-tighter uppercase relative z-20"
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <motion.span
            animate={{ x: [-2, 2, -2, 0] }}
            transition={{ repeat: Infinity, duration: 0.1, repeatDelay: 3 }}
            className="inline-block"
          >
            PASSIVE TIMESTAMPS
          </motion.span>
          <br/>
          ARE OBSOLETE.
        </motion.h1>
        
        <motion.p 
          className="font-mono text-[#F5A623] text-[1.5vw] mt-[2vw] relative z-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1 }}
        >
          External ledgers can't protect your actual audio.
        </motion.p>
      </div>

      {/* Couch / Characters foreground */}
      <div className="absolute bottom-[-5vw] left-0 right-0 h-[25vw] flex items-end justify-center z-30">
        <div className="absolute bottom-0 w-[90vw] h-[15vw] bg-zinc-900 rounded-t-[5vw] border-t-[1vw] border-zinc-700 shadow-2xl flex justify-center items-end px-[10vw]">
          
          <div className="relative">
            <Beavis className="scale-[0.8] origin-bottom mb-[-5vw] mr-[2vw]" />
            {/* Speech bubble */}
            <motion.div 
              className="absolute top-[-5vw] right-[-10vw] bg-white text-black font-['Permanent_Marker'] text-[1.5vw] px-[1.5vw] py-[1vw] rounded-[1vw] border-[0.3vw] border-black z-50"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 2, type: 'spring' }}
            >
              Uh... this sucks.
              <div className="absolute bottom-[-1vw] left-[2vw] w-[1vw] h-[1.5vw] bg-white border-l-[0.3vw] border-b-[0.3vw] border-black transform -rotate-45" />
            </motion.div>
          </div>

          <Butthead className="scale-[0.85] origin-bottom mb-[-5vw]" />
        </div>
      </div>
    </motion.div>
  );
};
