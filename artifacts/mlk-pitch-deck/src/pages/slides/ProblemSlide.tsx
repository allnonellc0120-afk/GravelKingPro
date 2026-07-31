export default function ProblemSlide() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(248,113,113,0.06),transparent_55%)]" />

      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between">
        <p className="font-body text-[1.05vw] font-semibold tracking-[0.35em] text-primary">
          02 · THE PROBLEM
        </p>
        <p className="font-body text-[1.05vw] tracking-[0.3em] text-muted">
          GRAVELKING PRODUCTIONS
        </p>
      </div>

      <div className="absolute left-[6vw] top-[22vh] w-[30vw]">
        <h2 className="font-display font-bold text-[4.6vw] leading-[1.05] tracking-tight">
          The Problem
        </h2>
        <p className="font-body mt-[3vh] text-[1.7vw] leading-[1.5] text-muted [text-wrap:pretty]">
          Two gaps, one market: sound quality and proof of ownership have never
          shipped in the same tool.
        </p>
      </div>

      <div className="absolute right-[6vw] top-[22vh] w-[50vw] flex flex-col gap-[4vh]">
        <div className="flex items-start gap-[1.6vw] border-b border-white/10 pb-[4vh]">
          <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] shrink-0 mt-[0.4vh] text-danger" aria-hidden="true">
            <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <p className="font-body text-[2.05vw] leading-[1.4] [text-wrap:pretty]">
            Great sounding masters are expensive or black-box.
          </p>
        </div>
        <div className="flex items-start gap-[1.6vw] border-b border-white/10 pb-[4vh]">
          <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] shrink-0 mt-[0.4vh] text-danger" aria-hidden="true">
            <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <p className="font-body text-[2.05vw] leading-[1.4] [text-wrap:pretty]">
            Proving human authorship and ownership of audio is weak and easily
            challenged.
          </p>
        </div>
        <div className="flex items-start gap-[1.6vw]">
          <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] shrink-0 mt-[0.4vh] text-danger" aria-hidden="true">
            <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <p className="font-body text-[2.05vw] leading-[1.4] [text-wrap:pretty]">
            Independent creators have no affordable way to get both superior
            sound <span className="font-semibold text-text">and</span> legally
            strong IP protection.
          </p>
        </div>
      </div>

      <div className="absolute bottom-[4.5vh] left-[6vw] right-[6vw] flex items-center justify-between border-t border-white/10 pt-[1.6vh]">
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">MORRIS LAW KERNEL V3.5</p>
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">02 / 10</p>
      </div>
    </div>
  );
}
