export default function Provenance() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1828] via-[#07111f] to-[#0a1828]" />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[4vh]">
        <div className="flex items-center justify-between text-[1.5vw] text-white/55">
          <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
          <div>PROVENANCE</div>
        </div>
        <h2 className="mt-[3vh] font-display text-[3.4vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>Human part, AI part, and a clean-hands check — on every certificate</h2>
        <div className="mt-[3.5vh] grid grid-cols-3 gap-[1.6vw]">
          <div className="rounded-[0.8vw] border border-[#5eead4]/35 bg-[#5eead4]/8 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Part A — The human</p>
            <p className="mt-[0.8vh] text-[1.9vw] font-extrabold leading-[1.2]">Authorship is scored, not assumed</p>
            <p className="mt-[1.2vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>Lyrics carry a 0–100 authorship score measured against the AI draft — below 25, certification is refused.</p>
          </div>
          <div className="rounded-[0.8vw] border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#f59e0b]">Part B — The AI</p>
            <p className="mt-[0.8vh] text-[1.9vw] font-extrabold leading-[1.2]">AI-made means AI-marked</p>
            <p className="mt-[1.2vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>When the platform's models generate the instrumental or full track, provenance is marked machine-generated and the generating model is tracked through the pipeline.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/15 bg-white/5 p-[1.6vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-white/70">The screen</p>
            <p className="mt-[0.8vh] text-[1.9vw] font-extrabold leading-[1.2]">No cert for stolen work</p>
            <p className="mt-[1.2vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>Every track is fingerprinted against the commercial recording catalog before certification. A match means no certificate.</p>
          </div>
        </div>
        <div className="mt-[3vh] rounded-[0.8vw] border border-white/15 bg-white/5 p-[1.5vw]">
          <p className="text-[1.8vw] leading-[1.4]" style={{ textWrap: 'pretty' }}><span className="font-extrabold text-[#5eead4]">Why it matters:</span> the industry is moving toward mandatory AI disclosure. GravelKing certificates already separate the human's work from the machine's.</p>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-white/15 pt-[1.6vh] text-[1.5vw] text-white/55">
          <div>Shipping in production — not a roadmap item</div>
          <div>04</div>
        </div>
      </div>
    </div>
  );
}
