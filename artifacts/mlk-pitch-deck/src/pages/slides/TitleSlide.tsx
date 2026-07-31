const base = import.meta.env.BASE_URL;

export default function TitleSlide() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-text">
      <img
        src={`${base}hero-console.jpg`}
        crossOrigin="anonymous"
        alt="Mastering console in a dark studio"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg/60" />

      <div className="absolute top-[5vh] left-[6vw] right-[6vw] flex items-center justify-between">
        <p className="font-body text-[1.05vw] font-semibold tracking-[0.35em] text-primary">
          GRAVELKING PRODUCTIONS
        </p>
        <p className="font-body text-[1.05vw] tracking-[0.3em] text-muted">JULY 2026</p>
      </div>

      <div className="absolute left-[6vw] bottom-[16vh] w-[62vw]">
        <svg viewBox="0 0 640 70" className="w-[26vw] h-[4.5vh] mb-[3.5vh]" aria-hidden="true">
          <defs>
            <linearGradient id="titleWave" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <path
            d="M0 35 L40 35 L52 20 L64 50 L76 12 L88 58 L100 30 L118 40 L134 8 L150 62 L166 24 L182 46 L198 35 L230 35 L244 18 L258 52 L272 28 L288 42 L304 14 L320 56 L336 30 L352 40 L370 35 L420 35 L434 24 L448 46 L462 30 L476 40 L494 35 L560 35 L574 28 L588 42 L604 35 L640 35"
            fill="none"
            stroke="url(#titleWave)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1 className="font-display font-bold text-[6.2vw] leading-[1.02] tracking-tight [text-wrap:balance]">
          Morris Law Kernel v3.5
        </h1>
        <p className="font-body mt-[3vh] text-[2.1vw] leading-[1.35] text-text/90 [text-wrap:pretty]">
          The First Adaptive Mastering Engine with{' '}
          <span className="text-primary font-semibold">Court-Grade IP Protection</span>
        </p>
      </div>

      <div className="absolute bottom-[4.5vh] left-[6vw] right-[6vw] flex items-center justify-between border-t border-white/10 pt-[1.6vh]">
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">
          GRAVELKING PRODUCTIONS · JULY 2026
        </p>
        <p className="font-body text-[1vw] tracking-[0.3em] text-muted">01 / 10</p>
      </div>
    </div>
  );
}
