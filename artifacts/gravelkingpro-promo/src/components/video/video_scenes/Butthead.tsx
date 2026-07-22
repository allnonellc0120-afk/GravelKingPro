import { motion } from 'framer-motion';

export const Butthead = ({ className = '', pointing = false, thumbsUp = false }: { className?: string, pointing?: boolean, thumbsUp?: boolean }) => {
  return (
    <div className={`relative w-[25vw] h-[40vw] ${className}`}>
      {/* Body / Shirt */}
      <div className="absolute bottom-0 left-[2vw] right-[2vw] h-[15vw] bg-gray-400 rounded-t-[5vw] overflow-hidden border-4 border-black flex items-center justify-center flex-col">
        <div className="text-center font-['Permanent_Marker'] mt-[2vw] text-[#cc0000] text-[2.5vw] font-bold tracking-tighter">
          SKULL
        </div>
      </div>
      
      {/* Arm pointing or thumbs up */}
      {pointing && (
        <motion.div 
          className="absolute bottom-[8vw] left-[-4vw] w-[12vw] h-[3vw] bg-[#e6c299] border-4 border-black rounded-full z-50 origin-right"
          animate={{ rotate: [-10, 10, -10] }}
          transition={{ repeat: Infinity, duration: 1 }}
        >
          <div className="absolute left-[-2vw] top-[-0.5vw] w-[4vw] h-[4vw] bg-[#e6c299] border-4 border-black rounded-full" />
        </motion.div>
      )}

      {thumbsUp && (
        <motion.div 
          className="absolute bottom-[8vw] left-[-2vw] w-[6vw] h-[8vw] bg-[#e6c299] border-4 border-black rounded-[2vw] z-50 flex items-start justify-center"
          animate={{ y: [0, "-1vw", 0] }}
          transition={{ repeat: Infinity, duration: 1.2 }}
        >
           <div className="w-[3vw] h-[5vw] bg-[#e6c299] border-4 border-black rounded-full mt-[-3vw] ml-[-1vw]" />
        </motion.div>
      )}

      {/* Neck */}
      <div className="absolute bottom-[14vw] left-[10vw] w-[4vw] h-[4vw] bg-[#e6c299] border-4 border-black z-10" />
      
      {/* Head */}
      <div className="absolute bottom-[16vw] left-[5vw] w-[14vw] h-[19vw] z-20 origin-bottom">
        <motion.div
          animate={{ rotate: [1, -1, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="relative w-full h-full"
        >
          {/* Hair back */}
          <div className="absolute top-[0vw] left-[-1vw] right-[-1vw] h-[10vw] bg-[#5c4033] rounded-[5vw] border-4 border-black z-10" />
          
          {/* Face */}
          <div className="absolute top-[2vw] left-[1vw] right-[1vw] bottom-[-2vw] bg-[#e6c299] border-4 border-black rounded-[4vw] z-20" />
          
          {/* Gum / Jaw / Overbite */}
          <div className="absolute bottom-[0vw] left-[2vw] w-[10vw] h-[8vw] bg-[#e6c299] border-4 border-black rounded-b-[4vw] z-30 flex items-start justify-center pt-[1vw]">
             <div className="w-[6vw] h-[3vw] bg-[#e68a8a] border-2 border-black rounded-full" />
          </div>

          {/* Eyes */}
          <div className="absolute top-[5vw] left-[2.5vw] w-[3vw] h-[3vw] bg-white border-4 border-black rounded-full z-30 overflow-hidden flex items-center justify-center">
             <div className="w-[0.8vw] h-[0.8vw] bg-black rounded-full" />
          </div>
          <div className="absolute top-[5vw] right-[2.5vw] w-[3vw] h-[3vw] bg-white border-4 border-black rounded-full z-30 overflow-hidden flex items-center justify-center">
             <div className="w-[0.8vw] h-[0.8vw] bg-black rounded-full" />
          </div>

          {/* Nose */}
          <div className="absolute top-[7vw] left-[5vw] w-[4vw] h-[4vw] border-l-4 border-b-4 border-black rounded-bl-[1vw] z-40" />
        </motion.div>
      </div>

    </div>
  );
};