import { motion } from 'framer-motion';
import { Beavis } from './Beavis';
import { Butthead } from './Butthead';

export const Scene3 = () => {
  const bulletVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: { delay: 2 + i * 1, duration: 0.5 }
    }),
  };

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center w-full h-full overflow-hidden"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
      transition={{ duration: 0.5 }}
    >
      
      {/* Background glitch effect */}
      <motion.div 
        className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"
      />

      {/* Main TV Screen content */}
      <div className="relative z-10 w-[80vw] h-[40vw] border-[0.5vw] border-zinc-800 bg-black/90 rounded-[2vw] flex flex-row items-center justify-start overflow-hidden mb-[10vw] shadow-[0_0_80px_rgba(0,255,229,0.3)] pl-[5vw]">
        
        {/* Left column: Text */}
        <div className="flex flex-col w-[40vw] relative z-20">
          <motion.div 
            className="flex items-center gap-[1vw] mb-[2vw]"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            {/* Lightning bolt logo */}
            <motion.svg 
              viewBox="0 0 24 24" 
              className="w-[4vw] h-[4vw] text-[#00FFE5]" 
              fill="currentColor"
              animate={{ opacity: [1, 0.5, 1], scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
            >
              <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
            </motion.svg>
            <h1 className="font-heading font-bold text-[3vw] text-[#fafafa] tracking-tight">
              GRAVELKING <span className="text-[#00FFE5]">PRO</span>
            </h1>
          </motion.div>
          
          <motion.div 
            className="text-[#F5A623] font-mono text-[1.5vw] mb-[2vw] tracking-widest"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            MLK V3.5 ENGINE
          </motion.div>

          <div className="flex flex-col gap-[1.5vw]">
            {[
              "Signal-Level LSB Steganography",
              "Dual-Anchor Server Handshake (Anchor A + B)",
              "Default of Warrant on Alteration"
            ].map((text, i) => (
              <motion.div 
                key={i}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={bulletVariants}
                className="flex items-center gap-[1vw]"
              >
                <div className="w-[0.5vw] h-[0.5vw] bg-[#00FFE5] rounded-full" />
                <span className="font-mono text-[1.2vw] text-zinc-300">{text}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right column: Visuals (High-def audio signal with code bits) */}
        <div className="absolute right-0 top-0 bottom-0 w-[40vw] flex items-center justify-center opacity-80">
           {/* Grid background */}
           <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,229,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,229,0.1)_1px,transparent_1px)] bg-[size:2vw_2vw] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_70%)]" />
           
           {/* Animated Waveform */}
           <div className="relative w-full h-[20vw] flex items-center justify-center gap-[0.5vw]">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-[1vw] bg-gradient-to-t from-[#00FFE5] to-[#F5A623] rounded-full relative overflow-hidden"
                  animate={{ 
                    height: ['2vw', `${Math.random() * 15 + 5}vw`, '2vw'] 
                  }}
                  transition={{ 
                    repeat: Infinity, 
                    duration: Math.random() * 0.5 + 0.5,
                    ease: "easeInOut"
                  }}
                >
                  {/* Injecting code bits */}
                  <motion.div 
                    className="absolute bottom-0 w-full bg-white font-mono text-[0.5vw] leading-none text-black text-center break-all"
                    animate={{ height: ['0%', '100%', '0%'] }}
                    transition={{ repeat: Infinity, duration: 1.5, delay: Math.random() }}
                  >
                    10110
                  </motion.div>
                </motion.div>
              ))}
           </div>
        </div>

      </div>

      {/* Couch / Characters foreground */}
      <div className="absolute bottom-[-5vw] left-0 right-0 h-[25vw] flex items-end justify-center z-30">
        <div className="absolute bottom-0 w-[90vw] h-[15vw] bg-zinc-900 rounded-t-[5vw] border-t-[1vw] border-zinc-700 shadow-2xl flex justify-center items-end px-[10vw]">
          
          <div className="relative">
            <Beavis standing className="scale-[0.8] origin-bottom mb-[-5vw] mr-[2vw]" />
            {/* Speech bubble */}
            <motion.div 
              className="absolute top-[-10vw] left-[-15vw] bg-white text-black font-['Permanent_Marker'] text-[2.5vw] px-[2vw] py-[1vw] rounded-[1vw] border-[0.4vw] border-black z-50 whitespace-nowrap text-red-600"
              initial={{ opacity: 0, scale: 0, rotate: -10 }}
              animate={{ opacity: 1, scale: 1, rotate: [-10, 5, -5, 0] }}
              transition={{ delay: 0.5, type: 'spring', bounce: 0.6 }}
            >
              FIRE! FIRE! <br/>This is cool!
              <div className="absolute bottom-[-1vw] right-[5vw] w-[1.5vw] h-[2vw] bg-white border-r-[0.4vw] border-b-[0.4vw] border-black transform rotate-45" />
            </motion.div>
          </div>

          <Butthead className="scale-[0.85] origin-bottom mb-[-5vw]" />
        </div>
      </div>
    </motion.div>
  );
};
