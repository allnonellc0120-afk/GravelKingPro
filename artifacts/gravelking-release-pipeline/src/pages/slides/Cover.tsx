const base = import.meta.env.BASE_URL;

export default function Cover() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <img src={`${base}studio-hero.jpg`} crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover opacity-70" alt="Professional recording studio" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#07111f] via-[#07111f]/90 to-[#07111f]/20" />
      <div className="absolute left-[5vw] right-[5vw] top-[5vh] flex items-center justify-between border-b border-white/20 pb-[2vh] text-[1.5vw]">
        <div className="flex items-center gap-[1vw] font-bold"><span className="h-[2vw] w-[2vw] rounded-[0.35vw] bg-[#f59e0b]" />GRAVELKING PRODUCTIONS</div>
        <div className="text-white/65">RELEASE + F6S + B2B BRIEFING · AUGUST 2026</div>
      </div>
      <div className="absolute left-[5vw] top-[24vh] w-[57vw]">
        <p className="mb-[2vh] text-[1.6vw] font-bold uppercase tracking-[0.16em] text-[#5eead4]">Studio · Proof · Release</p>
        <h1 className="font-display text-[6.4vw] font-extrabold leading-[0.98] tracking-[-0.04em] text-wrap-balance">GravelKing Pro — Studio, Proof &amp; Release</h1>
        <p className="mt-[4vh] max-w-[50vw] text-[2.1vw] leading-[1.45] text-white/80">One workspace for creating, recording, mastering, certifying, and verifying music.</p>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] right-[5vw] flex items-end justify-between border-t border-white/20 pt-[2vh] text-[1.5vw] text-white/65">
        <div>All N One LLC · gravelkingpro.it.com</div>
        <div>Confidential &amp; Proprietary</div>
      </div>
    </div>
  );
}