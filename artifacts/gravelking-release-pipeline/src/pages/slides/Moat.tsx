export default function Moat() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07111f] font-body text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-[#07111f] via-[#0a1828] to-[#07111f]" />
      <div className="absolute left-[5vw] right-[5vw] top-[5vh] flex items-center justify-between text-[1.5vw] text-white/55">
        <div className="flex items-center gap-[0.8vw] font-bold text-white/80"><span className="h-[1.4vw] w-[1.4vw] rounded-[0.25vw] bg-[#f59e0b]" />GRAVELKING</div>
        <div>THE MOAT</div>
      </div>
      <div className="absolute left-[5vw] top-[14vh] w-[88vw]">
        <h2 className="font-display text-[4.2vw] font-bold leading-[1.05] tracking-[-0.02em]" style={{ textWrap: 'balance' }}>Four layers competitors have to rebuild from scratch</h2>
      </div>
      <div className="absolute left-[5vw] top-[30vh] grid w-[90vw] grid-cols-2 gap-[1.8vw]">
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.8vw]">
          <div className="flex items-baseline gap-[1vw]">
            <span className="font-display text-[2.6vw] font-bold text-[#f59e0b]">1</span>
            <p className="text-[2.1vw] font-extrabold">Proprietary DSP</p>
          </div>
          <p className="mt-[1vh] text-[2vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>Morris Law Kernel v3.5 — years of multi-band mastering R&amp;D with no open-source equivalent, running every track that touches the platform.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.8vw]">
          <div className="flex items-baseline gap-[1vw]">
            <span className="font-display text-[2.6vw] font-bold text-[#f59e0b]">2</span>
            <p className="text-[2.1vw] font-extrabold">Split-key certificate architecture</p>
          </div>
          <p className="mt-[1vh] text-[2vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>Half the proof lives in the audio itself, half on the server — a certificate can't be forged by copying the file, and can't be verified without us.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.8vw]">
          <div className="flex items-baseline gap-[1vw]">
            <span className="font-display text-[2.6vw] font-bold text-[#f59e0b]">3</span>
            <p className="text-[2.1vw] font-extrabold">The provenance record</p>
          </div>
          <p className="mt-[1vh] text-[2vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>Human-vs-AI attribution plus commercial-catalog screening on every cert. Each certified track grows a registry no competitor can copy retroactively.</p>
        </div>
        <div className="rounded-[0.8vw] border border-white/12 bg-white/5 p-[1.8vw]">
          <div className="flex items-baseline gap-[1vw]">
            <span className="font-display text-[2.6vw] font-bold text-[#f59e0b]">4</span>
            <p className="text-[2.1vw] font-extrabold">Full-pipeline lock-in</p>
          </div>
          <p className="mt-[1vh] text-[2vw] leading-[1.45] text-white/78" style={{ textWrap: 'pretty' }}>Write, record, master, certify in one place. Leaving means abandoning your certificates, your vault, and your provenance history.</p>
        </div>
      </div>
      <div className="absolute left-[5vw] top-[74vh] w-[90vw] rounded-[0.8vw] border border-[#5eead4]/30 bg-[#5eead4]/8 p-[1.5vw]">
        <p className="text-[2vw] leading-[1.4]" style={{ textWrap: 'pretty' }}><span className="font-extrabold text-[#5eead4]">Estimated moat value: $800K–$2.4M</span> — internal estimate based on replacement cost of the DSP and cert stack, switching cost, and the growing registry data asset.</p>
      </div>
      <div className="absolute bottom-[5vh] left-[5vw] right-[5vw] flex items-center justify-between border-t border-white/15 pt-[2vh] text-[1.5vw] text-white/55">
        <div>Defensibility compounds with every certified track</div>
        <div>05</div>
      </div>
    </div>
  );
}
