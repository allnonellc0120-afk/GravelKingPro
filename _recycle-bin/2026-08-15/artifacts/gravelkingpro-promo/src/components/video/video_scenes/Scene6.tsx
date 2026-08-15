import { motion } from "framer-motion";
const base = import.meta.env.BASE_URL;
export function Scene6() {
  return <motion.section className="scene-shell absolute inset-0 overflow-hidden" initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)" }} animate={{ opacity: 1, clipPath: "inset(0 0% 0 0)" }} exit={{ opacity: 0, clipPath: "inset(0 0 0 100%)" }} transition={{ duration: .7 }}>
    <video className="footage absolute inset-0 h-full w-full object-cover" src={`${base}videos/keyboard_play.mp4`} autoPlay muted loop playsInline />
    <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(13,30,27,.95),rgba(13,30,27,.68),rgba(244,196,68,.14))]" />
    <motion.div className="absolute right-[6%] top-[7%] h-[22%] w-[22%] rotate-[8deg] border-[.35cqw] border-[#ff5d47]" animate={{ rotate: [8, 15, 4, 8], scale: [1, 1.05, .96, 1] }} transition={{ duration: 6, ease: "easeInOut" }} />
    <div className="absolute left-[8%] top-[19%] z-10 w-[53%]">
      <p className="micro-type mb-[2%] text-[#ff5d47]">06 / document the authorship trail</p>
      <motion.h2 initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .65, type: "spring" }} className="display-type text-[7.3cqw] leading-[.8] text-[#f6f2e9]">SAVE<br /><span className="text-[#f4c444]">THE</span><br />PROOF.</motion.h2>
      <p className="mt-[5%] max-w-[72%] text-[1.5cqw] leading-[1.15] text-[#f6f2e9]/86">Keep your edits and authorship notes connected to the work as it moves forward.</p>
    </div>
    <motion.div initial={{ opacity: 0, rotate: 4, x: 40 }} animate={{ opacity: 1, rotate: -3, x: 0 }} transition={{ delay: .42, duration: .65, type: "spring" }} className="paper-card absolute bottom-[10%] right-[10%] z-10 w-[28%] p-[2.3%]">
      <div className="flex items-center justify-between text-[1cqw] uppercase tracking-[.15em] text-[#ff5d47]"><span>creator record</span><span>saved</span></div>
      <div className="mt-[9%] space-y-[7%] text-[1.45cqw]"><p>Title <b className="float-right">Night Bus</b></p><p>Version <b className="float-right">03 / edited</b></p><p>Notes <b className="float-right">attached</b></p></div>
      <div className="mt-[10%] h-[.25cqw] w-[78%] bg-[#f4c444]" />
    </motion.div>
  </motion.section>;
}