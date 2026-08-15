export default function CertStripe() {
  return <div className="relative w-screen h-screen overflow-hidden bg-[#fafbfc] p-[4vh_4vw] font-body text-primary">
    <div className="flex justify-between border-b border-[#dbe4ea] pb-[2vh] text-[1.5vw] font-bold"><span>GRAVELKING PRO</span><span className="text-muted">ACCESS + PAYMENT · 07</span></div>
    <h1 className="mt-[4vh] text-[4vw] font-extrabold">How certificate access and Stripe work</h1>
    <div className="mt-[6vh] grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-[1.5vw]">
      <div className="rounded-[1vw] border border-[#cbd5e1] bg-white p-[2.5vh_1.8vw]"><p className="text-[1.5vw] font-bold text-accent">01 · OWNER</p><p className="mt-[2vh] text-[2vw] font-bold">Open certificate status</p><p className="mt-[1vh] text-[1.5vw] text-muted">Non-owners fail closed.</p></div>
      <span className="text-[3vw] text-accent">→</span>
      <div className="rounded-[1vw] bg-primary p-[2.5vh_1.8vw] text-white"><p className="text-[1.5vw] font-bold text-[#5eead4]">02 · CHOOSE</p><p className="mt-[2vh] text-[2vw] font-bold">$1.99 unlock</p><p className="mt-[1vh] text-[1.5vw] text-white/65">Or use the Studio / Node Auditor allowance.</p></div>
      <span className="text-[3vw] text-accent">→</span>
      <div className="rounded-[1vw] bg-[#0d9488] p-[2.5vh_1.8vw] text-white"><p className="text-[1.5vw] font-bold text-white/75">03 · CONFIRM</p><p className="mt-[2vh] text-[2vw] font-bold">Webhook unlock</p><p className="mt-[1vh] text-[1.5vw] text-white/75">Stripe completion updates the owner-scoped record idempotently.</p></div>
    </div>
    <div className="mt-[7vh] flex gap-[1.5vw]"><div className="flex-1 rounded-[1vw] border border-emerald-200 bg-emerald-50 p-[2.5vh_2vw] text-[1.65vw] font-bold text-emerald-800">✓ Status page can show the included unlock before checkout.</div><div className="flex-1 rounded-[1vw] border border-amber-200 bg-amber-50 p-[2.5vh_2vw] text-[1.65vw] font-bold text-amber-800">AMBER — Complete a real live purchase to verify the production handoff.</div></div>
    <div className="absolute bottom-[3vh] left-[4vw] right-[4vw] flex justify-between border-t border-[#dbe4ea] pt-[1.5vh] text-[1.5vw] text-muted"><span>Paid document access is owner-only</span><span>Confidential · 07</span></div>
  </div>;
}