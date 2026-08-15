export default function Valuation() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1828] via-[#07111f] to-[#0a1828]" />
      <div className="absolute left-[5vw] right-[5vw] top-[5vh] flex items-center justify-between text-[1.5vw] text-white/55">
        <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
        <div>WHAT THE COMPANY IS WORTH</div>
      </div>
      <div className="absolute left-[5vw] top-[14vh] w-[88vw]">
        <h2 className="font-display text-[4.2vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>Asset-based view of GravelKing Productions</h2>
        <p className="mt-[1.2vh] text-[2vw] text-white/65">Internal estimates by replacement cost — pre-revenue figures, stated as ranges on purpose.</p>
      </div>
      <div className="absolute left-[5vw] top-[32vh] w-[56vw]">
        <div className="flex items-center justify-between border-b border-white/12 py-[1.6vh]">
          <p className="text-[2vw] text-white/85">Morris Law Kernel v3.5 (proprietary DSP)</p>
          <p className="text-[2vw] font-extrabold text-[#5eead4]">$800K–$1.2M</p>
        </div>
        <div className="flex items-center justify-between border-b border-white/12 py-[1.6vh]">
          <p className="text-[2vw] text-white/85">Split-key cert + provenance architecture</p>
          <p className="text-[2vw] font-extrabold text-[#5eead4]">$200K–$500K</p>
        </div>
        <div className="flex items-center justify-between border-b border-white/12 py-[1.6vh]">
          <p className="text-[2vw] text-white/85">Generative pipeline + AI integrations</p>
          <p className="text-[2vw] font-extrabold text-[#5eead4]">$150K–$400K</p>
        </div>
        <div className="flex items-center justify-between border-b border-white/12 py-[1.6vh]">
          <p className="text-[2vw] text-white/85">Registry data + customer base (growing)</p>
          <p className="text-[2vw] font-extrabold text-[#5eead4]">$50K–$200K</p>
        </div>
        <div className="flex items-center justify-between py-[1.6vh]">
          <p className="text-[2vw] text-white/85">Brand, domain, store presence</p>
          <p className="text-[2vw] font-extrabold text-[#5eead4]">$20K–$80K</p>
        </div>
      </div>
      <div className="absolute right-[5vw] top-[32vh] w-[30vw] rounded-[0.8vw] border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-[2vw]">
        <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#f59e0b]">Estimated total</p>
        <p className="mt-[1vh] font-display text-[3.8vw] font-bold leading-none">$1.2M–$2.4M</p>
        <p className="mt-[2vh] text-[1.9vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>Ask: $250K for 15% — implied $1.67M pre-money, inside the asset range.</p>
      </div>
      <div className="absolute left-[5vw] top-[78vh] w-[90vw] rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.4vw]">
        <p className="text-[1.9vw] leading-[1.4] text-white/75" style={{ textWrap: 'pretty' }}>Reference points: early music-tech SaaS (LANDR, DistroKid at seed stage) priced on product + pipeline, not revenue. These are founder estimates, not an independent appraisal — the model behind each range is available in diligence.</p>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] right-[5vw] flex items-center justify-between border-t border-white/15 pt-[2vh] text-[1.5vw] text-white/55">
        <div>All figures founder-estimated · full model available in diligence</div>
        <div>10</div>
      </div>
    </div>
  );
}
