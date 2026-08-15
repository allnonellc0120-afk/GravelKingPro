export default function Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="absolute left-[5vw] right-[5vw] top-[5vh] flex items-center justify-between text-[1.5vw] text-white/55">
        <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
        <div>THE PROBLEM</div>
      </div>
      <div className="absolute left-[5vw] top-[16vh] w-[88vw]">
        <h2 className="font-display text-[4.2vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>AI flooded music with tracks nobody can attribute</h2>
      </div>
      <div className="absolute left-[5vw] top-[34vh] grid w-[90vw] grid-cols-2 gap-[2vw]">
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[2vw]">
          <p className="text-[2.2vw] font-extrabold text-[#f59e0b]">No proof of authorship</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.45] text-white/80" style={{ textWrap: 'pretty' }}>Millions of independent tracks ship every year with no verifiable record of who wrote what — and AI tools make the question harder, not easier.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[2vw]">
          <p className="text-[2.2vw] font-extrabold text-[#f59e0b]">AI work is unlabeled</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.45] text-white/80" style={{ textWrap: 'pretty' }}>When a model writes the beat or the lyrics, nothing in the file says so. Platforms, labels, and courts are demanding disclosure — creators have no tool for it.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[2vw]">
          <p className="text-[2.2vw] font-extrabold text-[#f59e0b]">Stolen work slips through</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.45] text-white/80" style={{ textWrap: 'pretty' }}>Uploads that lift commercial recordings get distributed anyway. Disputes surface after release, when takedowns and clawbacks are the only remedy.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[2vw]">
          <p className="text-[2.2vw] font-extrabold text-[#f59e0b]">Mastering is a luxury</p>
          <p className="mt-[1.2vh] text-[2vw] leading-[1.45] text-white/80" style={{ textWrap: 'pretty' }}>Studio mastering runs $300–$2,000 per track. Independent artists release unmastered or pay rates built for label budgets.</p>
        </div>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] right-[5vw] flex items-center justify-between border-t border-white/15 pt-[2vh] text-[1.5vw] text-white/55">
        <div>Proof, attribution, and screening are missing from the release pipeline</div>
        <div>02</div>
      </div>
    </div>
  );
}
