import { motion } from "framer-motion";
const base = import.meta.env.BASE_URL;
export function Scene2() {
  return <motion.section className="scene-shell absolute inset-0 overflow-hidden" initial={{ opacity: 0, x: "5%" }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: "-4%" }} transition={{ duration: .55 }}>
    <video className="footage absolute inset-0 h-full w-full object-cover" src={`${base}videos/songwriter-editing.mp4`} autoPlay muted loop playsInline />
    <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(15,28,27,.96),rgba(15,28,27,.58),rgba(23,41,38,.24))]" />
    <motion.div className="absolute right-[4%] top-[8%] h-[4%] w-[24%] rotate-[-5deg] bg-[#f4c444]" animate={{ x: ["0%", "-12%", "8%", "0%"] }} transition={{ duration: 6.5, ease: "easeInOut" }} />
    <div className="absolute left-[8%] top-[16%] z-10 w-[50%]">
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="micro-type mb-[2%] text-[#f4c444]">02 / shape the spark</motion.p>
      <motion.h2 initial={{ opacity: 0, scale: .85, x: -20 }} animate={{ opacity: 1, scale: 1, x: 0 }} transition={{ delay: .1, duration: .65, type: "spring", stiffness: 120 }} className="display-type text-[8.1cqw] leading-[.82] text-[#f6f2e9]">GIVE IT<br /><span className="text-[#f4c444]">DETAIL.</span></motion.h2>
      <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .65 }} className="mt-[4%] max-w-[70%] text-[1.55cqw] leading-[1.15]">Your story becomes a direction — not a blank prompt.</motion.p>
    </div>
    <motion.div initial={{ opacity: 0, rotate: 5, x: 50 }} animate={{ opacity: 1, rotate: 2, x: 0 }} transition={{ delay: .42, duration: .7, type: "spring" }} className="absolute bottom-[10%] right-[7%] z-10 w-[40%] rounded-[1.2cqw] border-[.12cqw] border-[#f4c444]/55 bg-[#14211f]/90 p-[2.4%] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-[#f4c444]/25 pb-[3%] text-[1cqw] uppercase tracking-[.16em] text-[#f4c444]"><span>GKP / lyrics generator</span><span className="h-[.7cqw] w-[.7cqw] rounded-full bg-[#ff5d47]" /></div>
      <p className="mt-[5%] text-[2cqw] leading-[1.1] text-[#f6f2e9]">Concrete plot, narrative details,<br /><span className="text-[#ff5d47]">specific metaphors.</span></p>
      <div className="mt-[5%] flex gap-[2%] text-[.95cqw] text-[#f6f2e9]/78"><span className="rounded-full border border-[#f4c444]/55 px-[2%] py-[1.5%]">Gritty soul</span><span className="rounded-full border border-[#f4c444]/55 px-[2%] py-[1.5%]">Rapid-fire verses</span></div>
    </motion.div>
    <div className="absolute bottom-[4%] left-[8%] text-[.9cqw] uppercase tracking-[.16em] text-[#f6f2e9]/55">storyline / core theme</div>
  </motion.section>;
}