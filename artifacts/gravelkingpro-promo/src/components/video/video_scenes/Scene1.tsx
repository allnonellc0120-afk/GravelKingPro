import { motion } from "framer-motion";
const base = import.meta.env.BASE_URL;
export function Scene1() {
  return <motion.section className="scene-shell absolute inset-0 overflow-hidden" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }} transition={{ duration: .7 }}>
    <video className="footage absolute inset-0 h-full w-full object-cover" src={`${base}videos/songwriter-desk.mp4`} autoPlay muted loop playsInline />
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,23,22,.94),rgba(10,23,22,.4),rgba(255,93,71,.12))]" />
    <motion.div className="absolute -right-[9%] -top-[25%] h-[90%] w-[55%] rounded-full bg-[#ff5d47]/25 blur-[7cqw]" animate={{ rotate: [0, 12, -5, 0], scale: [1, 1.15, .95, 1] }} transition={{ duration: 7, ease: "easeInOut" }} />
    <div className="absolute left-[8%] top-[19%] z-10 max-w-[57%]">
      <motion.p initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .35 }} className="micro-type mb-[2.2%] text-[#f4c444]">01 / start with the real thing</motion.p>
      <motion.h1 initial={{ opacity: 0, y: 32, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: .16, duration: .7, type: "spring", stiffness: 120 }} className="display-type hero-type text-[#f6f2e9]">IDEA<br /><span className="text-[#ff5d47]">FIRST.</span></motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .75, duration: .5 }} className="mt-[4%] max-w-[62%] text-[1.65cqw] leading-[1.15] text-[#f6f2e9]/88">A night. A person. One line you cannot forget.</motion.p>
    </div>
    <motion.div initial={{ opacity: 0, rotate: -7, y: 30 }} animate={{ opacity: 1, rotate: -4, y: 0 }} transition={{ delay: .85, duration: .65 }} className="paper-card absolute bottom-[10%] right-[9%] z-10 w-[25%] p-[2.2%]">
      <div className="mb-[10%] text-[1cqw] font-semibold uppercase tracking-[.14em] text-[#ff5d47]">voice memo / 11:48 pm</div>
      <p className="font-serif text-[2.1cqw] leading-[1.05]">“The bus was late.<br />She stayed anyway.”</p>
      <div className="mt-[12%] h-[.18cqw] w-[40%] bg-[#ff5d47]" />
    </motion.div>
    <div className="absolute bottom-0 left-0 h-[1.3%] w-[46%] bg-[#f4c444]" />
  </motion.section>;
}