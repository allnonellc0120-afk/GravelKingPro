export default function Changed() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#fafbfc] p-[4vh_4vw] font-body text-primary">
      <div className="flex items-center justify-between border-b border-[#dbe4ea] pb-[2vh] text-[1.5vw] font-bold"><span>GRAVELKING PRO</span><span className="text-muted">SCOPE CONTROL · 03</span></div>
      <div className="mt-[3vh]"><p className="text-[1.5vw] font-bold uppercase tracking-[0.14em] text-accent">Architecture decision</p><h1 className="mt-[1vh] text-[4.1vw] font-extrabold tracking-[-0.03em]">What changed — and what did not</h1></div>
      <div className="mt-[4vh] grid grid-cols-[1.05fr_0.95fr] gap-[3vw]">
        <div className="rounded-[1.2vw] bg-primary p-[3vh_2.5vw] text-white">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">The boundary</p>
          <p className="mt-[2vh] text-[3.5vw] font-extrabold leading-[1.05]">Studio owns certification.</p>
          <p className="mt-[3vh] text-[2vw] leading-[1.45] text-white/75">Vocal Booth is treated as recording + lyric timing, not a certificate issuer.</p>
          <div className="mt-[4vh] h-[0.8vh] w-[70%] rounded-full bg-[#0d9488]" />
        </div>
        <div className="space-y-[1.35vh]">
          <p className="rounded-[0.8vw] border border-emerald-200 bg-white p-[1.7vh_1.5vw] text-[1.55vw] font-bold text-emerald-700">✓ “Vocal performance” already exists as a Studio certificate category</p>
          <p className="rounded-[0.8vw] border border-emerald-200 bg-white p-[1.7vh_1.5vw] text-[1.55vw] font-bold text-emerald-700">✓ Certificate status, included unlock, checkout, PDF, and JSON routes already exist</p>
          <p className="rounded-[0.8vw] border border-emerald-200 bg-white p-[1.7vh_1.5vw] text-[1.55vw] font-bold text-emerald-700">✓ No new Vocal Booth certificate route was added</p>
          <p className="rounded-[0.8vw] border border-emerald-200 bg-white p-[1.7vh_1.5vw] text-[1.55vw] font-bold text-emerald-700">✓ Task #110 is obsolete and should be cancelled, not implemented</p>
          <p className="rounded-[0.8vw] border border-emerald-200 bg-white p-[1.7vh_1.5vw] text-[1.55vw] font-bold text-emerald-700">✓ No source assets, MorrisLawKernel files, branches, or unrelated products were deleted</p>
        </div>
      </div>
      <div className="absolute bottom-[3vh] left-[4vw] right-[4vw] flex justify-between border-t border-[#dbe4ea] pt-[1.5vh] text-[1.5vw] text-muted"><span>Recording and lyric timing remain available</span><span>Confidential · 03</span></div>
    </div>
  );
}