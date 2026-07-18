import { motion } from 'framer-motion';

export function Scene4() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10 overflow-hidden"
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 bg-[#09090b] -z-10"></div>
      
      {/* Abstract Dashboard UI */}
      <motion.div
        className="absolute inset-0 z-0 opacity-20"
        initial={{ scale: 1.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.2 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 8, ease: "easeOut" }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/dashboard_abstract.jpg`}
          alt="Mix Studio"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-[#09090b]/60"></div>
      </motion.div>

      <div className="relative z-10 w-full max-w-[85vw] px-[3vw] mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="text-center mb-[8vh]"
        >
          <div className="text-[#f59e0b] font-mono text-[1vw] tracking-widest uppercase mb-[2vh]">Step 03 // Mix Studio</div>
          <h2 className="text-[4vw] font-bold tracking-tight">8-Track Live Multitrack</h2>
        </motion.div>

        {/* Mixer UI */}
        <motion.div
          className="flex gap-[1vw] w-full justify-center h-[40vh]"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
        >
          {[1,2,3,4,5,6,7,8].map((track, i) => (
            <motion.div 
              key={track}
              className="w-[6vw] bg-[#18181b]/80 border border-white/5 rounded-t-xl backdrop-blur-md flex flex-col items-center py-[3vh]"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 + (i * 0.1) }}
            >
              <div className="text-[0.8vw] font-mono text-[#71717a] mb-[3vh]">CH 0{track}</div>
              
              {/* EQ Knobs */}
              <div className="space-y-[2vh] mb-auto">
                {[1,2,3].map(knob => (
                  <div key={knob} className="w-[2vw] h-[2vw] rounded-full border-2 border-[#27272a] bg-[#09090b] flex items-center justify-center relative">
                    <motion.div 
                      className="absolute w-[2px] h-[1vh] bg-[#f59e0b] top-[20%]"
                      animate={{ rotate: [-45, 45, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", delay: i * 0.2 + knob * 0.1 }}
                      style={{ originY: "1vh" }}
                    />
                  </div>
                ))}
              </div>

              {/* Fader */}
              <div className="w-[0.5vw] h-[15vh] bg-black rounded-full relative mt-[3vh] border border-white/5 shadow-inner">
                <motion.div 
                  className="absolute w-[1.5vw] h-[4vh] bg-gradient-to-b from-gray-300 to-gray-500 rounded left-1/2 -translate-x-1/2 shadow-lg"
                  initial={{ bottom: "10%" }}
                  animate={{ bottom: `${40 + (Math.sin(i) * 30)}%` }}
                  transition={{ duration: 2, ease: "easeInOut" }}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>
        
        <motion.div
          className="absolute bottom-[6vh] bg-black/60 backdrop-blur-md border border-white/10 px-[2vw] py-[2vh] rounded-full"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 2 }}
        >
          <span className="text-[1.2vw] font-light">Real-time EQ • Compression • Metering • <span className="text-[#f59e0b] font-semibold">Zero Latency</span></span>
        </motion.div>
      </div>
    </motion.div>
  );
}
