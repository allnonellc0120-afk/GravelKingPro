export default function Provenance() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1828] via-[#07111f] to-[#0a1828]" />
      <div className="absolute left-[5vw] right-[5vw] top-[5vh] flex items-center justify-between text-[1.5vw] text-white/55">
        <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
        <div>THE CORE UPDATE — PROVENANCE</div>
      </div>
      <div className="absolute left-[5vw] top-[14vh] w-[90vw]">
        <h2 className="font-display text-[4vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>Human part, AI part, and a clean-hands check — on every certificate</h2>
      </div>
      <div className="absolute left-[5vw] top-[31vh] grid w-[90vw] grid-cols-3 gap-[1.8vw]">
        <div className="rounded-[0.8vw] border border-[#5eead4]/35 bg-[#5eead4]/8 p-[1.8vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#5eead4]">Part A — The human</p>
          <p className="mt-[1.2vh] text-[2vw] font-extrabold leading-[1.2]">Authorship is scored, not assumed</p>
          <p className="mt-[1.4vh] text-[2vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>Lyrics carry a 0–100 authorship score measured against the AI draft — below 25, certification is refused. The artist's creative direction is scored and recorded the same way.</p>
        </div>
        <div className="rounded-[0.8vw] border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-[1.8vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#f59e0b]">Part B — The AI</p>
          <p className="mt-[1.2vh] text-[2vw] font-extrabold leading-[1.2]">AI-made means AI-marked</p>
          <p className="mt-[1.4vh] text-[2vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>When the platform's models generate the instrumental or full track, the record says so: provenance is marked machine-generated, categorized by part, and the generating model is tracked through the pipeline.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/15 bg-white/5 p-[1.8vw]">
          <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-white/70">The screen</p>
          <p className="mt-[1.2vh] text-[2vw] font-extrabold leading-[1.2]">No cert for stolen work</p>
          <p className="mt-[1.4vh] text-[2vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>Before certification, every track is fingerprinted and screened against the commercial recording catalog, plus metadata and ownership checks. A match means no certificate — full stop.</p>
        </div>
      </div>
      <div className="absolute left-[5vw] top-[72vh] w-[90vw] rounded-[0.8vw] border border-white/15 bg-white/5 p-[1.6vw]">
        <p className="text-[2vw] leading-[1.45]" style={{ textWrap: 'pretty' }}><span className="font-extrabold text-[#5eead4]">Why it matters:</span> platforms and labels are moving toward mandatory AI disclosure. GravelKing certificates already separate the human's work from the machine's — that's the record the industry is about to require.</p>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] right-[5vw] flex items-center justify-between border-t border-white/15 pt-[2vh] text-[1.5vw] text-white/55">
        <div>Shipping in production — not a roadmap item</div>
        <div>04</div>
      </div>
    </div>
  );
}
