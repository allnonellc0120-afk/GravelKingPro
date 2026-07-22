import { motion } from 'framer-motion';
import { Beavis } from './Beavis';
import { Butthead } from './Butthead';

export const Scene2 = () => {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center w-full h-full overflow-hidden"
      initial={{ opacity: 0, scale: 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: "blur(10px)" }}
      transition={{ duration: 0.5 }}
    >
      
      {/* Background glitch effect */}
      <motion.div 
        className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"
      />

      {/* Main TV Screen content */}
      <div className="relative z-10 w-[80vw] h-[40vw] border-[0.5vw] border-zinc-800 bg-black/80 rounded-[2vw] flex flex-col items-center justify-center overflow-hidden mb-[10vw] shadow-[0_0_50px_rgba(245,166,35,0.1)]">
        
        <div className="flex flex-col items-center w-full mt-[-5vw]">
          {/* Animated Chain and Metadata */}
          <div className="relative w-[40vw] h-[15vw] flex items-center justify-center">
            
            {/* The Chain */}
            <motion.div 
              className="absolute w-[20vw] h-[2vw] flex items-center justify-between"
              initial={{ opacity: 1 }}
              animate={{ opacity: [1, 1, 0] }}
              transition={{ duration: 3, times: [0, 0.8, 1] }}
            >
              <div className="w-[5vw] h-[2vw] border-[0.3vw] border-[#00FFE5] rounded-full" />
              <div className="w-[5vw] h-[2vw] border-[0.3vw] border-[#00FFE5] rounded-full" />
              <div className="w-[5vw] h-[2vw] border-[0.3vw] border-[#00FFE5] rounded-full" />
            </motion.div>

            <motion.div 
              className="absolute w-[20vw] h-[2vw] flex items-center justify-between z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0, 1] }}
              transition={{ duration: 3, times: [0, 0.8, 1] }}
            >
              <div className="w-[5vw] h-[2vw] border-[0.3vw] border-red-500 rounded-full transform -translate-x-[2vw] rotate-12" />
              <div className="w-[5vw] h-[2vw] border-[0.3vw] border-red-500 rounded-full" />
              <div className="w-[5vw] h-[2vw] border-[0.3vw] border-red-500 rounded-full transform translate-x-[2vw] -rotate-12" />
            </motion.div>

            {/* The Metadata Tag */}
            <motion.div 
              className="absolute bg-zinc-800 border-[0.2vw] border-[#F5A623] px-[2vw] py-[0.5vw] rounded-[0.5vw] font-mono text-[#F5A623] text-[1.5vw] z-20"
              initial={{ y: 0, opacity: 1, rotate: 0 }}
              animate={{ y: 150, opacity: 0, rotate: 45 }}
              transition={{ delay: 1.5, duration: 1.5, ease: "easeIn" }}
            >
              [ ID3_TAG: OWNER ]
            </motion.div>

          </div>

          {/* Text */}
          <motion.h1 
            className="font-mono text-[#F5A623] text-[3.5vw] font-bold text-center tracking-tighter uppercase mt-[2vw]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            Metadata stripped?
            <br/>
            <motion.span 
              className="text-red-500 inline-block"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ delay: 2.5, duration: 0.3 }}
            >
              Chain broken.
            </motion.span>
          </motion.h1>
          
          <motion.p 
            className="font-mono text-[#00FFE5] text-[1.5vw] mt-[1vw]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 3 }}
          >
            Receipts don't stop audio theft.
          </motion.p>
        </div>
      </div>

      {/* Couch / Characters foreground */}
      <div className="absolute bottom-[-5vw] left-0 right-0 h-[25vw] flex items-end justify-center z-30">
        <div className="absolute bottom-0 w-[90vw] h-[15vw] bg-zinc-900 rounded-t-[5vw] border-t-[1vw] border-zinc-700 shadow-2xl flex justify-center items-end px-[10vw]">
          
          <Beavis className="scale-[0.8] origin-bottom mb-[-5vw] mr-[2vw]" />

          <div className="relative">
            <Butthead pointing className="scale-[0.85] origin-bottom mb-[-5vw]" />
            {/* Speech bubble */}
            <motion.div 
              className="absolute top-[-6vw] left-[-15vw] bg-white text-black font-['Permanent_Marker'] text-[1.5vw] px-[1.5vw] py-[1vw] rounded-[1vw] border-[0.3vw] border-black z-50 whitespace-nowrap"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1, type: 'spring' }}
            >
              Heh heh... they stole<br/>your song, dumbass.
              <div className="absolute bottom-[-1vw] right-[2vw] w-[1vw] h-[1.5vw] bg-white border-r-[0.3vw] border-b-[0.3vw] border-black transform rotate-45" />
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
