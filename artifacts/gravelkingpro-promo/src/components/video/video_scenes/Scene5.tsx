import { motion } from "framer-motion";

const base = import.meta.env.BASE_URL;

export function Scene5() {
  return <motion.section className="scene-shell absolute inset-0 overflow-hidden" initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }} transition={{ duration: .7 }}>
    <video className="footage absolute inset-0 h-full w-full object-cover" src={`${base}videos/songwriter-mic.mp4`} autoPlay muted loop playsInline />
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,22,20,.94),rgba(10,22,20,.56),rgba(255,93,71,.16))]" />
    <div className="absolute left-[8%] top-[16%] z-10 w-[49%]">
      <p className="micro-type mb-[2%] text-[#f4c444]">05 / make it yours</p>
      <motion.h2 initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .12, duration: .62 }} className="display-type text-[7.7cqw] leading-[.8] text-[#f6f2e9]">OWN<br /><span className="text-[#ff5d47]">THE</span><br />POINT.</motion.h2>
      <p className="mt-[5%] max-w-[76%] text-[1.5cqw] leading-[1.15] text-[#f6f2e9]/88">GKP is built around editability, authorship documentation, and an integrated creator workflow.</p>
    </div>
    <motion.div initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .72, duration: .55 }} className="absolute bottom-[9%] left-[8%] z-10 flex items-center gap-[1%]">
      {["Lyrics", "Edit", "Document", "Build"].map((item, i) => <div key={item} className="flex items-center gap-[1%]"><span className={`rounded-full px-[1.7%] py-[1%] text-[.9cqw] font-semibold whitespace-nowrap ${i === 3 ? "bg-[#f4c444] text-[#12211e]" : "border border-[#f4c444]/55 bg-[#12211e]/75 text-[#f6f2e9]"}`}>{item}</span>{i < 3 && <span className="px-[.4%] text-[1.2cqw] text-[#f4c444]">→</span>}</div>)}
    </motion.div>
  </motion.section>;
}