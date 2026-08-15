export default function CertCreation() {
  return <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-br from-[#fafbfc] to-[#eef4f5] p-[4vh_4vw] font-body text-primary">
    <div className="flex justify-between border-b border-[#dbe4ea] pb-[2vh] text-[1.5vw] font-bold"><span>GRAVELKING PRO</span><span className="text-muted">CERTIFICATE PIPELINE · 06</span></div>
    <h1 className="mt-[4vh] text-[4vw] font-extrabold">How a certificate is created</h1><p className="mt-[1vh] text-[1.8vw] text-muted">Optional certification happens inside Studio mastering — never as a Vocal Booth side path.</p>
    <div className="mt-[7vh] flex items-center justify-between">
      <div className="w-[19vw] rounded-[1vw] bg-white p-[2.5vh_1.6vw] shadow-sm ring-1 ring-[#dbe4ea]"><b className="text-[1.5vw] text-accent">INPUT</b><p className="mt-[2vh] text-[2vw] font-bold">Mastered audio</p><p className="mt-[1vh] text-[1.5vw] text-muted">Owner + provenance supplied by Studio.</p></div>
      <div className="text-[3vw] text-accent">→</div>
      <div className="w-[19vw] rounded-[1vw] bg-primary p-[2.5vh_1.6vw] text-white"><b className="text-[1.5vw] text-[#5eead4]">SCREEN</b><p className="mt-[2vh] text-[2vw] font-bold">External upload check</p><p className="mt-[1vh] text-[1.5vw] text-white/65">Rejects unsafe or unsupported bytes before stamping.</p></div>
      <div className="text-[3vw] text-accent">→</div>
      <div className="w-[19vw] rounded-[1vw] bg-white p-[2.5vh_1.6vw] shadow-sm ring-1 ring-[#dbe4ea]"><b className="text-[1.5vw] text-accent">STAMP</b><p className="mt-[2vh] text-[2vw] font-bold">Signal + HMAC</p><p className="mt-[1vh] text-[1.5vw] text-muted">Nominator in track LSBs; denominator remains server-side.</p></div>
      <div className="text-[3vw] text-accent">→</div>
      <div className="w-[19vw] rounded-[1vw] bg-[#0d9488] p-[2.5vh_1.6vw] text-white"><b className="text-[1.5vw] text-white/75">RECORD</b><p className="mt-[2vh] text-[2vw] font-bold">Cert record</p><p className="mt-[1vh] text-[1.5vw] text-white/75">Owner, category, hash, provenance, handshake.</p></div>
    </div>
    <div className="mt-[7vh] rounded-[1vw] border border-emerald-200 bg-emerald-50 p-[2.2vh_2vw] text-[1.65vw] font-bold text-emerald-800">✓ “vocal_performance” is already a valid Studio certificate category. The PDF remains optional and unlock-gated.</div>
    <div className="absolute bottom-[3vh] left-[4vw] right-[4vw] flex justify-between border-t border-[#dbe4ea] pt-[1.5vh] text-[1.5vw] text-muted"><span>Certificate creation is opt-in</span><span>Confidential · 06</span></div>
  </div>;
}