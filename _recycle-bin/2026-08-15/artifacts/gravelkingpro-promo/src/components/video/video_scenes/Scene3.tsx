import { motion } from "framer-motion";
import lyricsScreen from "@assets/IMG_1957_1786448818552.png";
export function Scene3() {
  return <motion.section className="scene-shell absolute inset-0 overflow-hidden" initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ duration: .7 }}>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_45%,rgba(244,196,68,.24),transparent_34%),linear-gradient(125deg,#12221f,#243d36)]" />
    <motion.div className="absolute left-[-10%] top-[14%] h-[70%] w-[38%] rounded-full bg-[#ff5d47]/28 blur-[7cqw]" animate={{ y: ["0%", "8%", "-4%", "0%"], rotate: [0, 6, -4, 0] }} transition={{ duration: 8, ease: "easeInOut" }} />
    <div className="absolute left-[8%] top-[19%] z-10 w-[47%]">
      <p className="micro-type mb-[2%] text-[#ff5d47]">03 / generate a draft</p>
      <motion.h2 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .13, duration: .62, type: "spring" }} className="display-type text-[8.4cqw] leading-[.78] text-[#f6f2e9]">MAKE<br /><span className="text-[#f4c444]">A MOVE.</span></motion.h2>
      <p className="mt-[5%] max-w-[70%] text-[1.55cqw] leading-[1.15] text-[#f6f2e9]/82">GKP gives you a usable first pass — while the idea is still yours.</p>
      <div className="mt-[5%] flex items-center gap-[2%] text-[1.1cqw] uppercase tracking-[.14em] text-[#f4c444]"><span className="h-[.8cqw] w-[.8cqw] rounded-full bg-[#ff5d47]" />generate / listen / decide</div>
    </div>
    <motion.div initial={{ opacity: 0, x: 50, rotate: 7 }} animate={{ opacity: 1, x: 0, rotate: 2 }} transition={{ delay: .26, duration: .85, type: "spring", stiffness: 90 }} className="phone-frame absolute right-[11%] top-[8%] z-10 h-[79%] w-[24%] overflow-hidden rounded-[2.2cqw] border-[.42cqw] border-[#0c1211] bg-[#0b0e0e]">
      <img src={lyricsScreen} alt="GKP lyrics generator interface" className="h-full w-full object-cover object-top" />
      <div className="pointer-events-none absolute inset-0 rounded-[1.8cqw] ring-1 ring-inset ring-[#f4c444]/55" /><div className="scanline absolute left-0 top-[54%] w-full" />
    </motion.div>
    <div className="absolute bottom-[5%] right-[9%] rounded-full bg-[#f4c444] px-[2%] py-[1%] text-[.9cqw] font-bold uppercase tracking-[.12em] text-[#10201c]">simple → advanced</div>
  </motion.section>;
}