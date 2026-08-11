import { motion } from "framer-motion";
import lyricsEditor from "@assets/IMG_1956_1786448818552.png";

export function Scene4() {
  return <motion.section className="scene-shell absolute inset-0 overflow-hidden" initial={{ opacity: 0, y: "4%" }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: "-4%" }} transition={{ duration: .55 }}>
    <div className="absolute inset-0 bg-[linear-gradient(135deg,#142421,#10201d)]" />
    <div className="absolute right-0 top-0 h-full w-[54%] bg-[radial-gradient(circle_at_62%_45%,rgba(255,93,71,.3),transparent_55%)]" />
    <div className="absolute left-[8%] top-[17%] z-10 w-[47%]">
      <p className="micro-type mb-[2%] text-[#ff5d47]">04 / keep the human hand</p>
      <motion.h2 initial={{ opacity: 0, x: -25 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: .12, duration: .6 }} className="display-type text-[7.6cqw] leading-[.8] text-[#f6f2e9]">EDIT<br /><span className="text-[#f4c444]">EVERY</span><br />LINE.</motion.h2>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .68 }} className="mt-[5%] flex flex-col gap-[2%] text-[1.35cqw] text-[#f6f2e9]/88">
        <div><span className="mr-[2%] text-[#f4c444]">01</span>line-by-line control</div>
        <div><span className="mr-[2%] text-[#f4c444]">02</span>your point of view stays visible</div>
        <div><span className="mr-[2%] text-[#f4c444]">03</span>a draft you can build on</div>
      </motion.div>
    </div>
    <motion.div initial={{ opacity: 0, x: 60, rotate: 7 }} animate={{ opacity: 1, x: 0, rotate: -2 }} transition={{ delay: .23, duration: .72, type: "spring", stiffness: 85 }} className="phone-frame absolute right-[9%] top-[11%] z-10 h-[76%] w-[24%] overflow-hidden rounded-[2.2cqw] border-[.42cqw] border-[#0b1211]">
      <img src={lyricsEditor} alt="GKP style editor interface" className="h-full w-full object-cover object-top" />
      <motion.div initial={{ x: "-100%" }} animate={{ x: "130%" }} transition={{ delay: 1, duration: 1.2, repeat: Infinity, repeatDelay: 2.2 }} className="absolute left-0 top-[53%] h-[.22cqw] w-[58%] bg-[#f4c444]" />
    </motion.div>
    <div className="absolute bottom-[6%] right-[9%] rounded-[.6cqw] bg-[#ff5d47] px-[2%] py-[1%] text-[.9cqw] font-bold uppercase tracking-[.12em]">you keep the pen</div>
  </motion.section>;
}