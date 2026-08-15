const base = import.meta.env.BASE_URL;

export default function Cover() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <img src={`${base}studio-hero.jpg`} crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover opacity-60" alt="Professional recording studio" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#07111f] via-[#07111f]/92 to-[#07111f]/25" />
      <div className="absolute left-[5vw] right-[5vw] top-[5vh] flex items-center justify-between border-b border-white/20 pb-[2vh] text-[1.5vw]">
        <div className="flex items-center gap-[1vw] font-extrabold tracking-[0.08em]"><span className="h-[2vw] w-[2vw] rounded-[0.35vw] bg-[#f59e0b]" />GRAVELKING PRODUCTIONS</div>
        <div className="text-white/65">F6S INVESTOR DECK · AUGUST 2026</div>
      </div>
      <div className="absolute left-[5vw] top-[18vh] w-[58vw]">
        <p className="mb-[1.5vh] text-[1.6vw] font-bold uppercase tracking-[0.16em] text-[#5eead4]">Prove who made the music</p>
        <h1 className="font-display text-[5.6vw] font-bold leading-[1.0] tracking-[-0.03em]" style={{ textWrap: 'balance' }}>Every track certified. Every AI credited. Every claim checked.</h1>
        <p className="mt-[3vh] max-w-[50vw] text-[2vw] leading-[1.45] text-white/80" style={{ textWrap: 'pretty' }}>GravelKing Pro masters, certifies, and attributes music — separating the human's part from the AI's, and screening every track before a certificate is issued.</p>
        <p className="mt-[2.5vh] text-[1.8vw] font-semibold text-[#f59e0b]">Raising $250K seed · Bootstrapped to live product</p>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] right-[5vw] flex items-end justify-between border-t border-white/20 pt-[2vh] text-[1.5vw] text-white/65">
        <div>All N One LLC · gravelkingpro.it.com</div>
        <div>Confidential &amp; Proprietary</div>
      </div>
    </div>
  );
}
