export default function MarketSlide() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(52,211,153,0.06),transparent_55%)]" />

      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between">
        <p className="font-body text-[1.05vw] font-semibold tracking-[0.35em] text-primary">
          06 · MARKET
        </p>
        <p className="font-body text-[1.05vw] tracking-[0.3em] text-muted">
          GRAVELKING PRODUCTIONS
        </p>
      </div>

      <div className="absolute left-[6vw] top-[15vh]">
        <h2 className="font-display font-bold text-[4.2vw] leading-[1.05] tracking-tight">Market</h2>
        <p className="font-body mt-[1.8vh] text-[1.6vw] text-muted [text-wrap:pretty]">
          Everyone shipping audio needs better sound. Everyone owning audio needs proof.
        </p>
      </div>

      <div className="absolute left-[6vw] right-[6vw] top-[34vh] grid grid-cols-3 gap-[1.4vw]">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-[1.6vw] py-[3vh]">
          <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] text-primary" aria-hidden="true">
            <circle cx="12" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M5 20 C5 15.5 8 13.5 12 13.5 C16 13.5 19 15.5 19 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <p className="font-body mt-[2vh] text-[1.75vw] leading-[1.3] font-medium [text-wrap:pretty]">
            Independent musicians &amp; producers
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-[1.6vw] py-[3vh]">
          <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] text-primary" aria-hidden="true">
            <path d="M4 6 h6 l2 2.5 h8 V19 H4 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
          <p className="font-body mt-[2vh] text-[1.75vw] leading-[1.3] font-medium [text-wrap:pretty]">
            Music libraries &amp; sync agencies
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-[1.6vw] py-[3vh]">
          <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] text-primary" aria-hidden="true">
            <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="12" cy="12" r="2.4" fill="currentColor" />
          </svg>
          <p className="font-body mt-[2vh] text-[1.75vw] leading-[1.3] font-medium [text-wrap:pretty]">
            Labels and distributors
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.04] px-[1.6vw] py-[3vh]">
          <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] text-primary" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="11.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M9 20 h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M7 12.5 L9.5 9.5 L12 13.5 L14.5 8.5 L17 12.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="font-body mt-[2vh] text-[1.75vw] leading-[1.3] font-medium [text-wrap:pretty]">
            Audio platforms and DAWs seeking differentiation
          </p>
        </div>
        <div className="col-span-2 rounded-lg border border-primary/25 bg-primary/[0.06] px-[1.6vw] py-[3vh]">
          <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] text-primary" aria-hidden="true">
            <path d="M12 3.5 C14.8 3.5 17 5.7 17 8.5 C17 13 12 20.5 12 20.5 C12 20.5 7 13 7 8.5 C7 5.7 9.2 3.5 12 3.5 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" transform="rotate(180 12 12)" />
            <path d="M9.5 8.5 a2.5 2.5 0 0 0 5 0 a2.5 2.5 0 0 0 -5 0 M8.2 12.6 a3.8 3.8 0 0 1 7.6 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="font-body mt-[2vh] text-[1.75vw] leading-[1.3] font-medium [text-wrap:pretty]">
            Anyone who needs to prove ownership of audio content
          </p>
        </div>
      </div>

      <div className="absolute bottom-[4.5vh] left-[6vw] right-[6vw] flex items-center justify-between border-t border-white/10 pt-[1.6vh]">
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">MORRIS LAW KERNEL V3.5</p>
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">06 / 10</p>
      </div>
    </div>
  );
}
