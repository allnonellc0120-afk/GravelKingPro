export default function Valuation() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a1828] via-[#07111f] to-[#0a1828]" />
      <div className="relative flex h-full w-full flex-col px-[5vw] py-[4vh]">
        <div className="flex items-center justify-between text-[1.5vw] text-white/55">
          <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
          <div>WHY CREATORS USE IT</div>
        </div>
        <h2 className="mt-[3vh] font-display text-[3.6vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>A clearer path from idea to release</h2>
        <p className="mt-[0.8vh] text-[1.7vw] text-white/65">One creator workspace for sound, story, attribution, and release-ready proof.</p>
        <div className="mt-[3vh] flex gap-[3vw]">
          <div className="w-[54vw]">
            <div className="flex items-center justify-between border-b border-white/12 py-[1.3vh]">
              <p className="text-[1.8vw] text-white/85">Polished audio</p>
              <p className="text-[1.8vw] font-extrabold text-[#5eead4]">Master</p>
            </div>
            <div className="flex items-center justify-between border-b border-white/12 py-[1.3vh]">
              <p className="text-[1.8vw] text-white/85">Clear release record</p>
              <p className="text-[1.8vw] font-extrabold text-[#5eead4]">Certify</p>
            </div>
            <div className="flex items-center justify-between border-b border-white/12 py-[1.3vh]">
              <p className="text-[1.8vw] text-white/85">Human + AI credits</p>
              <p className="text-[1.8vw] font-extrabold text-[#5eead4]">Attribute</p>
            </div>
            <div className="flex items-center justify-between border-b border-white/12 py-[1.3vh]">
              <p className="text-[1.8vw] text-white/85">Browser recording tools</p>
              <p className="text-[1.8vw] font-extrabold text-[#5eead4]">Create</p>
            </div>
            <div className="flex items-center justify-between py-[1.3vh]">
              <p className="text-[1.8vw] text-white/85">One shareable workspace</p>
              <p className="text-[1.8vw] font-extrabold text-[#5eead4]">Release</p>
            </div>
          </div>
          <div className="flex-1 rounded-[0.8vw] border border-[#f59e0b]/40 bg-[#f59e0b]/10 p-[1.8vw]">
            <p className="text-[1.5vw] font-bold uppercase tracking-[0.12em] text-[#f59e0b]">Start today</p>
            <p className="mt-[0.8vh] font-display text-[3.4vw] font-bold leading-none">$9.99<span className="text-[1.7vw] font-semibold text-white/60">/mo</span></p>
            <p className="mt-[1.6vh] text-[1.7vw] leading-[1.4] text-white/78" style={{ textWrap: 'pretty' }}>Studio includes mastering, Vocal Booth, browser DAW tools, vault access, and a rolling certificate allowance.</p>
          </div>
        </div>
        <div className="mt-[2.5vh] rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.3vw]">
          <p className="text-[1.7vw] leading-[1.4] text-white/75" style={{ textWrap: 'pretty' }}><span className="font-extrabold text-white">For creators:</span> make the track, document the contribution, and share a release record that is easier for collaborators and partners to understand.</p>
        </div>
        <div className="mt-auto flex items-center justify-between border-t border-white/15 pt-[1.6vh] text-[1.5vw] text-white/55">
          <div>Built for independent creators and modern music teams</div>
          <div>10</div>
        </div>
      </div>
    </div>
  );
}
