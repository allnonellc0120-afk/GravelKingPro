export default function SolutionSlide() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(52,211,153,0.07),transparent_55%)]" />

      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between">
        <p className="font-body text-[1.05vw] font-semibold tracking-[0.35em] text-primary">
          03 · THE SOLUTION
        </p>
        <p className="font-body text-[1.05vw] tracking-[0.3em] text-muted">
          GRAVELKING PRODUCTIONS
        </p>
      </div>

      <div className="absolute left-[6vw] top-[20vh] w-[34vw]">
        <h2 className="font-display font-bold text-[4.4vw] leading-[1.05] tracking-tight [text-wrap:balance]">
          One Integrated System
        </h2>
        <div className="mt-[5vh] flex gap-[1.4vw]">
          <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-[1.2vw] py-[2.2vh]">
            <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] text-primary" aria-hidden="true">
              <path d="M5 4 v16 M12 4 v16 M19 4 v16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="5" cy="9" r="2.2" fill="currentColor" />
              <circle cx="12" cy="15" r="2.2" fill="currentColor" />
              <circle cx="19" cy="7" r="2.2" fill="currentColor" />
            </svg>
            <p className="font-body mt-[1.4vh] text-[1.05vw] font-semibold tracking-[0.14em] text-text">
              MASTERING
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-[1.2vw] py-[2.2vh]">
            <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] text-primary" aria-hidden="true">
              <path d="M12 3 L20 6 V12 C20 17 16.5 20 12 21.5 C7.5 20 4 17 4 12 V6 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M8.5 12 L11 14.5 L15.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="font-body mt-[1.4vh] text-[1.05vw] font-semibold tracking-[0.14em] text-text">
              IP SHIELD
            </p>
          </div>
          <div className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-[1.2vw] py-[2.2vh]">
            <svg viewBox="0 0 24 24" className="w-[2.2vw] h-[2.2vw] text-primary" aria-hidden="true">
              <rect x="5" y="10.5" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <path d="M8 10.5 V8 a4 4 0 0 1 8 0 v2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="12" cy="15" r="1.6" fill="currentColor" />
            </svg>
            <p className="font-body mt-[1.4vh] text-[1.05vw] font-semibold tracking-[0.14em] text-text">
              CRYPTO
            </p>
          </div>
        </div>
      </div>

      <div className="absolute right-[6vw] top-[20vh] w-[46vw] flex flex-col gap-[3.2vh]">
        <div className="flex items-start gap-[1.4vw]">
          <div className="w-[0.9vw] h-[0.9vw] rounded-full bg-primary shrink-0 mt-[1.1vh]" />
          <p className="font-body text-[1.9vw] leading-[1.4] [text-wrap:pretty]">
            Superior adaptive mastering (Numba accelerated)
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw]">
          <div className="w-[0.9vw] h-[0.9vw] rounded-full bg-primary shrink-0 mt-[1.1vh]" />
          <p className="font-body text-[1.9vw] leading-[1.4] [text-wrap:pretty]">
            Robust watermarking that survives re-encoding
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw]">
          <div className="w-[0.9vw] h-[0.9vw] rounded-full bg-primary shrink-0 mt-[1.1vh]" />
          <p className="font-body text-[1.9vw] leading-[1.4] [text-wrap:pretty]">
            Cryptographic proof of human authorship + specific ownership
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw]">
          <div className="w-[0.9vw] h-[0.9vw] rounded-full bg-accent shrink-0 mt-[1.1vh]" />
          <p className="font-body text-[1.9vw] leading-[1.4] [text-wrap:pretty]">
            Optional blockchain-anchored immutability
          </p>
        </div>
        <div className="flex items-start gap-[1.4vw]">
          <div className="w-[0.9vw] h-[0.9vw] rounded-full bg-accent shrink-0 mt-[1.1vh]" />
          <p className="font-body text-[1.9vw] leading-[1.4] [text-wrap:pretty]">
            Verification reports suitable for copyright office and courts
          </p>
        </div>
      </div>

      <div className="absolute bottom-[4.5vh] left-[6vw] right-[6vw] flex items-center justify-between border-t border-white/10 pt-[1.6vh]">
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">MORRIS LAW KERNEL V3.5</p>
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">03 / 10</p>
      </div>
    </div>
  );
}
