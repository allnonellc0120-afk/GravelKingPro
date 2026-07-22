import { motion } from 'framer-motion';

export const Beavis = ({ className = '', standing = false }: { className?: string, standing?: boolean }) => {
  return (
    <motion.div 
      className={`relative w-[25vw] h-[40vw] ${className}`}
      animate={standing ? { y: -100 } : { y: 0 }}
      transition={{ type: "spring", bounce: 0.5 }}
    >
      {/* Arms up for standing */}
      {standing && (
        <>
          <motion.div 
            className="absolute bottom-[10vw] left-[-2vw] w-[4vw] h-[12vw] bg-[#fcdbb4] border-4 border-black rounded-full z-0 origin-bottom"
            animate={{ rotate: [-20, -40, -20] }}
            transition={{ repeat: Infinity, duration: 0.3 }}
          />
          <motion.div 
            className="absolute bottom-[10vw] right-[-2vw] w-[4vw] h-[12vw] bg-[#fcdbb4] border-4 border-black rounded-full z-0 origin-bottom"
            animate={{ rotate: [20, 40, 20] }}
            transition={{ repeat: Infinity, duration: 0.3, delay: 0.1 }}
          />
        </>
      )}

      {/* Body / Shirt */}
      <div className={`absolute bottom-0 left-[2vw] right-[2vw] ${standing ? 'h-[25vw]' : 'h-[15vw] rounded-t-[5vw]'} bg-gray-300 overflow-hidden border-4 border-black transition-all duration-300`}>
        <div className="text-center font-['Permanent_Marker'] mt-[3vw] text-black text-[2vw] font-bold tracking-tighter">
          DEATH
          <br />ROCK
        </div>
      </div>
      
      {/* Neck */}
      <div className={`absolute ${standing ? 'bottom-[24vw]' : 'bottom-[14vw]'} left-[10vw] w-[4vw] h-[5vw] bg-[#fcdbb4] border-4 border-black z-10 transition-all duration-300`} />
      
      {/* Head */}
      <div className={`absolute ${standing ? 'bottom-[27vw]' : 'bottom-[17vw]'} left-[4vw] w-[15vw] h-[18vw] z-20 origin-bottom transition-all duration-300`}>
        <motion.div
          animate={standing ? { rotate: [-10, 10, -10] } : { rotate: [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: standing ? 0.2 : 1.5, ease: "easeInOut" }}
          className="relative w-full h-full"
        >
          {/* Hair back */}
          <div className="absolute top-[-3vw] left-0 right-0 h-[10vw] bg-[#ffe066] rounded-t-[8vw] border-4 border-black" />
          
          {/* Face */}
          <div className="absolute top-[3vw] left-[1vw] right-[1vw] bottom-0 bg-[#fcdbb4] border-4 border-black rounded-[4vw]" />
          
          {/* Overbite/Jaw */}
          <div className={`absolute ${standing ? 'bottom-[-2vw]' : 'bottom-[-1vw]'} left-[2vw] w-[14vw] ${standing ? 'h-[8vw]' : 'h-[6vw]'} bg-[#fcdbb4] border-4 border-black rounded-b-[4vw] rounded-tr-[2vw] z-30 flex flex-col items-start justify-end p-[0.5vw] transition-all duration-300`}>
             {/* Teeth */}
             <div className="w-[8vw] h-[1.5vw] bg-white border-2 border-black ml-[4vw] mb-[1vw] flex">
                <div className="w-1/4 h-full border-r-2 border-black" />
                <div className="w-1/4 h-full border-r-2 border-black" />
                <div className="w-1/4 h-full border-r-2 border-black" />
             </div>
             {/* Open mouth when standing */}
             {standing && (
                <div className="absolute top-[1vw] left-[5vw] w-[6vw] h-[3vw] bg-black rounded-full" />
             )}
          </div>

          {/* Eyes */}
          <div className="absolute top-[6vw] left-[3vw] w-[4vw] h-[4vw] bg-white border-4 border-black rounded-full z-30 overflow-hidden flex items-center justify-center">
             <div className="w-[1vw] h-[1vw] bg-black rounded-full" />
          </div>
          <div className="absolute top-[6vw] right-[3vw] w-[4vw] h-[4vw] bg-white border-4 border-black rounded-full z-30 overflow-hidden flex items-center justify-center">
             <div className="w-[1vw] h-[1vw] bg-black rounded-full" />
          </div>

          {/* Nose */}
          <div className="absolute top-[9vw] left-[6vw] w-[2vw] h-[4vw] border-l-4 border-b-4 border-black rounded-bl-[1vw] z-40" />

          {/* Hair pompadour / spikes */}
          <div className="absolute top-[-4vw] left-[2vw] w-[3vw] h-[5vw] bg-[#ffe066] border-4 border-black rounded-t-[1vw] origin-bottom -rotate-12" />
          <div className="absolute top-[-5vw] left-[6vw] w-[3vw] h-[6vw] bg-[#ffe066] border-4 border-black rounded-t-[1vw]" />
          <div className="absolute top-[-4vw] right-[3vw] w-[3vw] h-[5vw] bg-[#ffe066] border-4 border-black rounded-t-[1vw] origin-bottom rotate-12" />
        </motion.div>
      </div>

    </motion.div>
  );
};