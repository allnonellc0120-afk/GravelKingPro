export default function ArtifactStatus() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#fafbfc] to-[#f1f5f9] p-[4vh_4vw] font-body text-primary">
      <div className="flex items-center justify-between border-b border-[#dbe4ea] pb-[2vh] text-[1.5vw] font-bold"><span>GRAVELKING PRO</span><span className="text-muted">ARTIFACT INVENTORY · 04</span></div>
      <h1 className="mt-[4vh] text-[4vw] font-extrabold tracking-[-0.03em]">What is live, stopped, and quarantined</h1>
      <div className="mt-[4vh] grid grid-cols-3 gap-[1.5vw]">
        <div className="rounded-[1vw] border border-emerald-200 bg-white p-[2.5vh_2vw] shadow-sm"><p className="text-[1.5vw] font-bold uppercase text-emerald-700">Live</p><p className="mt-[2vh] text-[2.1vw] font-bold">✓ GravelKing Pro web app</p><p className="mt-[2vh] text-[2.1vw] font-bold">✓ GravelKing Pro API server</p></div>
        <div className="rounded-[1vw] border border-slate-200 bg-white p-[2.5vh_2vw] shadow-sm"><p className="text-[1.5vw] font-bold uppercase text-slate-600">Stopped</p><p className="mt-[2vh] text-[1.7vw] font-bold">Mobile Expo preview and mockup sandbox</p><p className="mt-[2vh] text-[1.7vw] font-bold">Promo videos, speed promo, and unrelated MLK product previews</p></div>
        <div className="rounded-[1vw] border border-rose-200 bg-rose-50 p-[2.5vh_2vw]"><p className="text-[1.5vw] font-bold uppercase text-rose-700">Excluded</p><p className="mt-[2vh] text-[2vw] font-bold">Matrix-multiplication MLK licensing site and pitch deck</p><p className="mt-[3vh] text-[1.6vw] leading-[1.4] text-rose-800">Separate product. No claims or assets mixed into this deck.</p></div>
      </div>
      <div className="mt-[3vh] grid grid-cols-2 gap-[1.5vw]">
        <div className="rounded-[1vw] bg-primary p-[2.6vh_2vw] text-white"><p className="text-[1.5vw] font-bold uppercase text-[#5eead4]">Keep archived</p><p className="mt-[1.5vh] text-[1.8vw] font-bold">Existing mobile, promo, MorrisLawKernel, and business-package files</p></div>
        <div className="rounded-[1vw] bg-[#f59e0b] p-[2.6vh_2vw] text-[#422006]"><p className="text-[1.5vw] font-bold uppercase">Delete now</p><p className="mt-[1.5vh] text-[1.8vw] font-bold">Nothing without explicit approval; cleanup means cancelling obsolete work, not destroying assets</p></div>
      </div>
      <div className="absolute bottom-[3vh] left-[4vw] right-[4vw] flex justify-between border-t border-[#dbe4ea] pt-[1.5vh] text-[1.5vw] text-muted"><span>Preservation-first cleanup policy</span><span>Confidential · 04</span></div>
    </div>
  );
}