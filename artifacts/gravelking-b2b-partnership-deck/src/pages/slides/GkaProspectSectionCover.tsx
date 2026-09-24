export default function GkaProspectSectionCover() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0c080f] px-[8vw] py-[8vh] text-[#f0ece4]">
      <div className="absolute right-[8vw] top-[12vh] h-[36vw] w-[36vw] rounded-full border border-[#c4a060]/30" />
      <div className="absolute right-[14vw] top-[18vh] h-[24vw] w-[24vw] rounded-full border border-[#9b8bb4]/20" />
      <div className="relative z-10">
        <div className="font-body text-[1.1vw] tracking-[.2em] text-[#9b8bb4]">
          09 <span className="text-[#c4a060]">—</span> GKA PROSPECTING BRIEF
        </div>
        <h2 className="mt-[7vh] max-w-[70vw] font-display text-[5.4vw] leading-[1.04]">
          Fifty AI workflow companies.
          <br />
          <i>One measurable pilot.</i>
        </h2>
        <p className="mt-[6vh] max-w-[50vw] font-body text-[1.45vw] leading-[1.55] text-[#9b8bb4]">
          A ranked target list for GravelKing Advantage: companies with
          recurring agent, voice, support, coding, or content workflows where
          context bloat can become a material model-cost problem.
        </p>
        <div className="mt-[8vh] flex gap-[4vw] font-body text-[1.1vw] tracking-[.08em]">
          <div>
            <div className="text-[2.6vw] text-[#c4a060]">50</div>
            <div className="mt-[1vh] text-[#9b8bb4]">RANKED TARGETS</div>
          </div>
          <div>
            <div className="text-[2.6vw] text-[#c4a060]">5</div>
            <div className="mt-[1vh] text-[#9b8bb4]">FIT TIERS</div>
          </div>
          <div>
            <div className="text-[2.6vw] text-[#c4a060]">1</div>
            <div className="mt-[1vh] text-[#9b8bb4]">VERIFIED EMAIL ROUTE</div>
          </div>
        </div>
      </div>
    </div>
  );
}