import { motion } from 'framer-motion';
import { Sparkles, CheckCircle2 } from 'lucide-react';

export function WorkflowScene1() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col justify-center items-center z-10"
      initial={{ clipPath: "circle(0% at 50% 50%)", filter: "blur(20px)" }}
      animate={{ clipPath: "circle(150% at 50% 50%)", filter: "blur(0px)" }}
      exit={{ scale: 1.1, opacity: 0, filter: "blur(15px)" }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[#08090c]/40 z-0 backdrop-blur-sm" />
      
      {/* Background asset if any */}
      <motion.video
        className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen"
        src={`${import.meta.env.BASE_URL}videos/songwriter-desk.mp4`}
        autoPlay muted loop playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#08090c] via-transparent to-[#08090c]" />

      <div className="z-20 w-full flex flex-col items-center justify-center px-[8vw]">
        {/* The Stamp: THINK IT. */}
        <motion.div
          className="overflow-hidden mb-[8vh]"
        >
          <motion.h1 
            className="text-[18vw] leading-none font-bold tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"
            initial={{ scale: 3, opacity: 0, y: "50%" }}
            animate={{ scale: 1, opacity: 1, y: "0%" }}
            transition={{ duration: 0.6, type: "spring", bounce: 0.4, delay: 0.3 }}
          >
            THINK IT.
          </motion.h1>
        </motion.div>

        {/* UI Mockup: Chat Input */}
        <motion.div 
          className="w-[85vw] rounded-3xl border border-white/10 bg-black/40 p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden"
          initial={{ y: 50, opacity: 0, rotateX: 20 }}
          animate={{ y: 0, opacity: 1, rotateX: 0 }}
          transition={{ duration: 0.8, delay: 1.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformPerspective: 1000 }}
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-violet-600/30 flex items-center justify-center border border-violet-500/50">
              <Sparkles className="text-violet-400 w-5 h-5" />
            </div>
            <div className="text-[4.5vw] font-medium text-white/90">JAX AI Companion</div>
          </div>
          
          <div className="flex flex-col gap-4">
            <div className="bg-white/5 rounded-2xl rounded-tr-sm p-4 w-[85%] self-end border border-white/10">
              <motion.p
                className="text-[4vw] text-white/80"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 2.0 }}
              >
                Help me write a gritty country-blues song about working the night shift.
              </motion.p>
            </div>

            <motion.div 
              className="bg-violet-900/20 rounded-2xl rounded-tl-sm p-4 w-[90%] self-start border border-violet-500/20"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 3.5 }}
            >
              <div className="flex items-center gap-2 mb-2 opacity-60">
                <Sparkles className="w-3 h-3 text-violet-400" />
                <span className="text-[3vw] font-mono text-violet-300">JAX GENERATING...</span>
              </div>
              <motion.div
                className="text-[4vw] text-white leading-relaxed font-mono"
                initial={{ clipPath: "inset(0 100% 0 0)" }}
                animate={{ clipPath: "inset(0 0% 0 0)" }}
                transition={{ duration: 3, delay: 4, ease: "linear" }}
              >
                "Headlights cut the dust at 2 AM,<br/>
                Steel toes heavy on the pedal again.<br/>
                Clock don't care if my bones are aching,<br/>
                Another grave shift, another dawn breaking..."
              </motion.div>
            </motion.div>
          </div>

          <motion.div 
            className="absolute right-6 bottom-6 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shadow-[0_0_15px_rgba(34,197,94,0.5)]"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4, delay: 7.2, type: "spring" }}
          >
            <CheckCircle2 className="w-5 h-5 text-white" />
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}