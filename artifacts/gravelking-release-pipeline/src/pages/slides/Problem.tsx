export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[4vh]">
        <div className="flex items-center justify-between text-[1.5vw] text-white/55">
          <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
          <div>THE PROBLEM</div>
        </div>
        <h2 className="mt-[3.5vh] font-display text-[3.8vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>AI flooded music with tracks nobody can attribute</h2>
        <div className="mt-[4vh] grid flex-1 grid-cols-2 content-start gap-[1.6vw]">
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[2vw] font-extrabold text-[#f59e0b]">No proof of authorship</p>
            <p className="mt-[1vh] text-[1.8vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Millions of independent tracks ship with no verifiable record of who wrote what — AI tools make the question harder, not easier.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[2vw] font-extrabold text-[#f59e0b]">AI work is unlabeled</p>
            <p className="mt-[1vh] text-[1.8vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>When a model writes the beat or the lyrics, nothing in the file says so. Platforms and labels are demanding disclosure — creators have no tool for it.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[2vw] font-extrabold text-[#f59e0b]">Stolen work gets certified nowhere</p>
            <p className="mt-[1vh] text-[1.8vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>There is no consumer-priced way to screen a track against the commercial catalog before claiming it as yours.</p>
          </div>
          <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.6vw]">
            <p className="text-[2vw] font-extrabold text-[#f59e0b]">Pro mastering is priced out</p>
            <p className="mt-[1vh] text-[1.8vw] leading-[1.4] text-white/80" style={{ textWrap: 'pretty' }}>Studio mastering costs $50–$200 per track and takes days — independents skip it and sound like it.</p>
          </div>
        </div>
        <div className="mt-[2vh] flex items-center justify-between border-t border-white/15 pt-[1.6vh] text-[1.5vw] text-white/55">
          <div>Attribution is becoming a legal requirement, not a feature</div>
          <div>02</div>
        </div>
      </div>
    </div>
  );
}
