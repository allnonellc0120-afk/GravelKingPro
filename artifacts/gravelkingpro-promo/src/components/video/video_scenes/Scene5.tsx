import { motion } from 'framer-motion';

export function Scene5() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center z-10 overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 bg-[#09090b] -z-10"></div>
      
      <motion.div
        className="absolute inset-0 z-0"
        initial={{ opacity: 0, scale: 1.05 }}
        animate={{ opacity: 0.5, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 2 }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/vocal_booth.jpg`}
          alt="Vocal Booth"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09090b] via-[#09090b]/90 to-transparent"></div>
      </motion.div>

      <div className="relative z-10 w-full max-w-[85vw] px-[4vw] mx-auto grid grid-cols-2 gap-[4vw] items-center">
        
        {/* Text Column */}
        <div className="flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          >
            <div className="text-[#f59e0b] font-mono text-[1vw] tracking-widest uppercase mb-[2vh]">Step 04 // Vocal Booth</div>
            <h2 className="text-[4vw] font-bold tracking-tight mb-[3vh] leading-tight">
              Record Over<br />Backing Tracks
            </h2>
            <p className="text-[#71717a] text-[1.2vw] max-w-[30vw] font-light mb-[4vh]">
              Synchronized teleprompter lyrics. Punch in seamlessly. Professional vocal chain applied instantly.
            </p>
          </motion.div>
        </div>

        {/* Teleprompter UI */}
        <motion.div
          className="relative h-[55vh] w-full rounded-2xl border-2 border-[#f59e0b]/20 bg-black/80 backdrop-blur-xl overflow-hidden shadow-[0_0_50px_rgba(245,158,11,0.1)] flex flex-col"
          initial={{ opacity: 0, x: 50, rotateY: -15 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          exit={{ opacity: 0, x: 50 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
          style={{ perspective: 1000 }}
        >
          {/* Recording header */}
          <div className="w-full h-[8vh] border-b border-white/10 flex items-center justify-between px-[2vw] bg-black">
            <div className="flex items-center gap-[1vw] text-red-500 font-mono text-[1.2vw]">
              <motion.div 
                className="w-[1vw] h-[1vw] rounded-full bg-red-500"
                animate={{ opacity: [1, 0.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              REC
            </div>
            <div className="font-mono text-white tracking-widest text-[1.2vw]">01:24:08</div>
          </div>

          {/* Teleprompter Text */}
          <div className="flex-1 relative flex flex-col justify-center px-[3vw] overflow-hidden">
            <motion.div
              className="absolute left-0 w-[0.3vw] h-[12vh] bg-[#f59e0b] top-1/2 -translate-y-1/2"
              layoutId="prompter-line"
            />
            
            <div className="space-y-[3vh] text-[2.5vw] font-bold tracking-tight text-white/20">
              <motion.div animate={{ y: "-6vh", opacity: 0 }} transition={{ duration: 3 }}>
                Late nights in the city
              </motion.div>
              <motion.div 
                animate={{ color: ["rgba(255,255,255,0.2)", "rgba(245,158,11,1)", "rgba(255,255,255,0.2)"] }}
                transition={{ duration: 2, times: [0, 0.2, 1], delay: 0.5 }}
                className="text-white"
              >
                The neon's bleeding through
              </motion.div>
              <motion.div 
                animate={{ color: ["rgba(255,255,255,0.2)", "rgba(245,158,11,1)"] }}
                transition={{ duration: 1, delay: 1.5 }}
              >
                Every shadow on the wall
              </motion.div>
              <div>Is looking just like you</div>
            </div>
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}
