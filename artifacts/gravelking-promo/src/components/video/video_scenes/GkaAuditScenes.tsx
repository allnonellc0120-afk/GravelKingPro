import { motion } from "framer-motion";
import type { ReactNode } from "react";

const cyan = "#62f6ff";
const green = "#8dffb3";
const violet = "#a88bff";

function SceneFrame({
  eyebrow,
  title,
  index,
  children,
}: {
  eyebrow: string;
  title: string;
  index: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      className="absolute inset-0 overflow-hidden bg-[#05080d] text-[#e8f6f7]"
      initial={{ opacity: 0, scale: 1.015 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="absolute inset-0 gka-grid opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(98,246,255,.11),transparent_32%),radial-gradient(circle_at_15%_85%,rgba(141,255,179,.08),transparent_35%)]" />
      <div className="absolute inset-x-0 top-0 h-[0.18cqw] bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent gka-scanline" />
      <header className="relative z-10 flex items-center justify-between px-[6cqw] pt-[4.2cqw]">
        <div>
          <div className="gka-eyebrow text-cyan-200/70">{eyebrow}</div>
          <div className="mt-[0.8cqw] gka-title">{title}</div>
        </div>
        <div className="flex items-center gap-[1.2cqw] gka-mono text-[1.1cqw] uppercase tracking-[0.2em] text-white/45">
          <span className="h-[0.65cqw] w-[0.65cqw] rounded-full bg-[#8dffb3] shadow-[0_0_1.2cqw_#8dffb3]" />
          Customer Zero
          <span className="text-white/20">/</span>
          {index}
        </div>
      </header>
      <div className="relative z-10 h-[calc(100%-8cqw)]">{children}</div>
      <div className="absolute bottom-[2.8cqw] left-[6cqw] right-[6cqw] z-10 flex items-center justify-between gka-mono text-[0.9cqw] uppercase tracking-[0.18em] text-white/35">
        <span>GravelKing Advantage // Morris Law Kernel V2</span>
        <span>LIVE BENCHMARK / 2026.09</span>
      </div>
    </motion.section>
  );
}

function TerminalBar({ label, status = "LIVE" }: { label: string; status?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.035] px-[1.6cqw] py-[1.05cqw]">
      <div className="flex items-center gap-[0.55cqw]">
        <span className="h-[0.65cqw] w-[0.65cqw] rounded-full bg-[#ff6c7b]" />
        <span className="h-[0.65cqw] w-[0.65cqw] rounded-full bg-[#ffd66c]" />
        <span className="h-[0.65cqw] w-[0.65cqw] rounded-full bg-[#8dffb3]" />
      </div>
      <span className="gka-mono text-[1.05cqw] tracking-[0.1em] text-white/48">{label}</span>
      <span className="gka-mono text-[0.95cqw] tracking-[0.16em] text-[#8dffb3]">{status}</span>
    </div>
  );
}

function Meter({ label, value, delay = 0 }: { label: string; value: string; delay?: number }) {
  return (
    <div className="flex items-center gap-[1cqw]">
      <span className="w-[10cqw] shrink-0 gka-mono text-[0.9cqw] uppercase tracking-[0.12em] text-white/42">{label}</span>
      <div className="h-[0.55cqw] flex-1 overflow-hidden rounded-full bg-white/[0.08]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#62f6ff] to-[#8dffb3] shadow-[0_0_1.4cqw_rgba(98,246,255,.75)]"
          initial={{ width: 0 }}
          animate={{ width: value }}
          transition={{ duration: 1.4, delay, ease: "easeOut" }}
        />
      </div>
      <span className="w-[4.5cqw] text-right gka-mono text-[0.95cqw] text-cyan-100/80">{value}</span>
    </div>
  );
}

function SceneBleed() {
  return (
    <SceneFrame eyebrow="01 // THE BLEED" title="Full history. Zero shortcuts." index="01 / 04">
      <div className="flex h-full flex-col items-center justify-center px-[10cqw] pb-[4cqw]">
        <motion.div
          className="mb-[1.8cqw] flex w-full items-center justify-between"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.5 }}
        >
          <div className="gka-mono text-[1.05cqw] uppercase tracking-[0.18em] text-cyan-200/55">MULTI-TURN AGENT PAYLOAD</div>
          <div className="gka-mono text-[1.05cqw] uppercase tracking-[0.18em] text-[#8dffb3]">2,108 TOKENS / INBOUND</div>
        </motion.div>
        <motion.div
          className="w-full overflow-hidden rounded-[1.2cqw] border border-cyan-200/20 bg-[#091119]/90 shadow-[0_0_4cqw_rgba(98,246,255,.12)]"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.65 }}
        >
          <TerminalBar label="agent://customer-zero/session-04" />
          <div className="grid grid-cols-[1fr_28%] gap-[2cqw] p-[2.2cqw]">
            <div className="gka-mono text-[1.22cqw] leading-[1.85]">
              <div className="text-[#8dffb3]"><span className="text-white/30">01</span> system :: preserve arrangement constraints</div>
              <div className="text-cyan-100/80"><span className="text-white/30">02</span> user :: revise the chorus hook</div>
              <div className="text-cyan-100/80"><span className="text-white/30">03</span> assistant :: context acknowledged / lyric pass</div>
              <div className="text-cyan-100/80"><span className="text-white/30">04</span> user :: open the chord progression</div>
              <div className="text-cyan-100/80"><span className="text-white/30">05</span> assistant :: harmonic drop proposed</div>
              <div className="mt-[1.1cqw] text-white/34"><span className="text-[#62f6ff]">06</span> user :: structure the final JSON package<span className="gka-cursor" /></div>
            </div>
            <div className="space-y-[1.35cqw] border-l border-white/10 pl-[2cqw]">
              <div className="gka-mono text-[0.9cqw] uppercase tracking-[0.14em] text-white/42">Provider meters</div>
              <Meter label="history" value="100%" delay={0.45} />
              <Meter label="schema" value="92%" delay={0.58} />
              <Meter label="latency" value="78%" delay={0.7} />
              <div className="mt-[1.4cqw] border-t border-white/10 pt-[1.3cqw]">
                <div className="gka-mono text-[0.85cqw] uppercase tracking-[0.12em] text-white/35">transport status</div>
                <div className="mt-[0.55cqw] flex items-center gap-[0.6cqw] gka-mono text-[1cqw] text-[#ffd66c]">
                  <span className="gka-pulse h-[0.6cqw] w-[0.6cqw] rounded-full bg-[#ffd66c]" />
                  BLEEDING CONTEXT
                </div>
              </div>
            </div>
          </div>
        </motion.div>
        <motion.div
          className="mt-[1.8cqw] flex w-full items-center justify-between gka-mono text-[0.98cqw] uppercase tracking-[0.16em] text-white/42"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75 }}
        >
          <span>4 turns / 2,108 baseline tokens</span>
          <span className="text-[#ffd66c]">provider meter running <span className="gka-blink">_</span></span>
        </motion.div>
      </div>
    </SceneFrame>
  );
}

function SceneCarve() {
  return (
    <SceneFrame eyebrow="02 // THE CARVE" title="History enters. Signal leaves." index="02 / 04">
      <div className="flex h-full flex-col justify-center px-[7cqw] pb-[3cqw]">
        <div className="mb-[2.2cqw] flex items-end justify-between">
          <div>
            <div className="gka-mono text-[1.1cqw] uppercase tracking-[0.2em] text-[#8dffb3]">ACTIVE LISTENER / 127.0.0.1:8090</div>
            <div className="mt-[0.8cqw] max-w-[48cqw] text-[3.25cqw] font-semibold leading-[0.98] tracking-[-0.05em] text-white">
              Zero Prompt Summarization.<br /><span className="text-cyan-200">Zero Schema Drift.</span>
            </div>
          </div>
          <div className="rounded-full border border-[#8dffb3]/30 bg-[#8dffb3]/[0.08] px-[1.2cqw] py-[0.7cqw] gka-mono text-[0.9cqw] uppercase tracking-[0.13em] text-[#8dffb3]">GKA CARVER / ONLINE</div>
        </div>
        <div className="grid grid-cols-[28%_44%_28%] items-center gap-[1.4cqw]">
          <motion.div
            className="rounded-[1cqw] border border-white/10 bg-white/[0.035] p-[1.4cqw]"
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="mb-[1.1cqw] flex items-center justify-between gka-mono text-[0.88cqw] uppercase tracking-[0.12em] text-white/42">
              <span>raw history</span><span className="text-[#ffd66c]">2,108</span>
            </div>
            {[1, 2, 3, 4].map((turn, index) => (
              <motion.div
                key={turn}
                className="mb-[0.65cqw] flex items-center gap-[0.7cqw] rounded-[0.5cqw] border border-white/[0.08] px-[0.75cqw] py-[0.62cqw] gka-mono text-[0.85cqw] text-white/58"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.13 }}
              >
                <span className="text-[#62f6ff]">T{turn}</span>
                <span className="truncate">{turn === 1 ? "system / constraints" : turn === 2 ? "assistant / lyric pass" : turn === 3 ? "assistant / chords" : "user / final JSON"}</span>
              </motion.div>
            ))}
          </motion.div>
          <div className="relative flex h-[16cqw] items-center justify-center">
            <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-[#ffd66c]/0 via-[#62f6ff] to-[#8dffb3]/0" />
            {[0, 1, 2, 3, 4, 5, 6].map((byte, index) => (
              <motion.div
                key={byte}
                className="absolute h-[0.6cqw] w-[0.6cqw] rounded-full bg-[#62f6ff] shadow-[0_0_1.4cqw_#62f6ff]"
                initial={{ left: "3%", opacity: 0 }}
                animate={{ left: "92%", opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.4, delay: 0.35 + index * 0.22, repeat: Infinity, repeatDelay: 1.5, ease: "linear" }}
                style={{ top: `${38 + (index % 3) * 12}%` }}
              />
            ))}
            <motion.div
              className="relative z-10 flex h-[9cqw] w-[9cqw] flex-col items-center justify-center rounded-[1.2cqw] border border-cyan-200/45 bg-[#071820] shadow-[0_0_3.5cqw_rgba(98,246,255,.25)]"
              animate={{ boxShadow: ["0 0 2cqw rgba(98,246,255,.12)", "0 0 4cqw rgba(98,246,255,.42)", "0 0 2cqw rgba(98,246,255,.12)"] }}
              transition={{ duration: 1.8, repeat: Infinity }}
            >
              <div className="gka-mono text-[1.15cqw] text-[#62f6ff]">8090</div>
              <div className="mt-[0.45cqw] gka-mono text-[0.7cqw] uppercase tracking-[0.12em] text-white/45">intercept</div>
            </motion.div>
            <div className="absolute bottom-0 gka-mono text-[0.82cqw] uppercase tracking-[0.16em] text-white/36">byte-level context carve</div>
          </div>
          <motion.div
            className="rounded-[1cqw] border border-[#8dffb3]/25 bg-[#091a13]/80 p-[1.4cqw] shadow-[0_0_2.8cqw_rgba(141,255,179,.1)]"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.35 }}
          >
            <div className="mb-[1.1cqw] flex items-center justify-between gka-mono text-[0.88cqw] uppercase tracking-[0.12em] text-white/42">
              <span>active context</span><span className="text-[#8dffb3]">420</span>
            </div>
            <div className="space-y-[0.75cqw] gka-mono text-[0.9cqw]">
              <div className="rounded-[0.5cqw] border border-[#8dffb3]/25 bg-[#8dffb3]/[0.07] px-[0.8cqw] py-[0.75cqw] text-[#8dffb3]">SYSTEM / DEDUPED</div>
              <div className="rounded-[0.5cqw] border border-cyan-200/20 bg-cyan-200/[0.06] px-[0.8cqw] py-[0.75cqw] text-cyan-100">ACTIVE TURN / PRESERVED</div>
              <div className="rounded-[0.5cqw] border border-white/10 bg-white/[0.025] px-[0.8cqw] py-[0.75cqw] text-white/38 line-through">HISTORICAL ASSISTANTS / STRIPPED</div>
            </div>
          </motion.div>
        </div>
        <div className="mt-[2.1cqw] flex items-center justify-center gap-[1.1cqw] gka-mono text-[0.9cqw] uppercase tracking-[0.16em] text-white/38">
          <span className="text-[#62f6ff]">turn 2</span><span>→</span><span className="text-[#62f6ff]">turn 3</span><span>→</span><span className="text-[#62f6ff]">turn 4</span><span className="ml-[1.1cqw] text-[#8dffb3]">signal preserved / sludge removed</span>
        </div>
      </div>
    </SceneFrame>
  );
}

function ProofCard({
  label,
  value,
  detail,
  tone = "cyan",
  delay = 0,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "cyan" | "green" | "violet";
  delay?: number;
}) {
  const color = tone === "green" ? green : tone === "violet" ? violet : cyan;
  return (
    <motion.div
      className="rounded-[1cqw] border border-white/10 bg-white/[0.035] p-[1.6cqw]"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.55 }}
      style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,.05), 0 0 2.5cqw ${color}10` }}
    >
      <div className="gka-mono text-[0.86cqw] uppercase tracking-[0.14em] text-white/42">{label}</div>
      <div className="mt-[0.7cqw] whitespace-nowrap font-semibold tracking-[-0.07em]" style={{ color, fontSize: "3.8cqw", lineHeight: 0.95 }}>{value}</div>
      <div className="mt-[0.8cqw] gka-mono text-[0.86cqw] text-white/42">{detail}</div>
    </motion.div>
  );
}

function SceneProof() {
  return (
    <SceneFrame eyebrow="03 // THE TELEMETRY PROOF" title="The math survives the demo." index="03 / 04">
      <div className="flex h-full flex-col justify-center px-[8cqw] pb-[4cqw]">
        <div className="mb-[2cqw] flex items-center justify-between">
          <div className="gka-mono text-[1cqw] uppercase tracking-[0.18em] text-cyan-200/65">Verified live / four-turn benchmark</div>
          <div className="flex items-center gap-[0.7cqw] gka-mono text-[0.9cqw] uppercase tracking-[0.13em] text-[#8dffb3]"><span className="h-[0.6cqw] w-[0.6cqw] rounded-full bg-[#8dffb3]" />RUNTIME GREEN</div>
        </div>
        <div className="grid grid-cols-[1.1fr_0.9fr] gap-[1.6cqw]">
          <motion.div
            className="relative overflow-hidden rounded-[1.2cqw] border border-cyan-200/20 bg-[#08131a] p-[2cqw]"
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15, duration: 0.6 }}
          >
            <div className="gka-mono text-[0.88cqw] uppercase tracking-[0.15em] text-white/42">Context economics</div>
            <div className="mt-[1.6cqw] flex items-end gap-[1.3cqw]">
              <div><div className="gka-mono text-[0.9cqw] uppercase tracking-[0.12em] text-white/45">baseline</div><div className="mt-[0.45cqw] text-[6.4cqw] font-semibold leading-none tracking-[-0.09em] text-white">2,108</div></div>
              <div className="mb-[0.7cqw] text-[3cqw] text-cyan-200/70">→</div>
              <div><div className="gka-mono text-[0.9cqw] uppercase tracking-[0.12em] text-[#8dffb3]/65">processed</div><div className="mt-[0.45cqw] text-[6.4cqw] font-semibold leading-none tracking-[-0.09em] text-[#8dffb3]">420</div></div>
            </div>
            <div className="mt-[2cqw] h-[0.8cqw] overflow-hidden rounded-full bg-white/[0.08]">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-[#62f6ff] via-[#8dffb3] to-[#a88bff]" initial={{ width: 0 }} animate={{ width: "19.92%" }} transition={{ delay: 0.55, duration: 1.25, ease: "easeOut" }} />
            </div>
            <div className="mt-[0.8cqw] flex justify-between gka-mono text-[0.82cqw] uppercase tracking-[0.14em] text-white/34"><span>raw history</span><span>active signal</span></div>
            <div className="absolute right-[2cqw] top-[2cqw] rounded-full bg-[#8dffb3]/[0.1] px-[0.9cqw] py-[0.5cqw] gka-mono text-[0.78cqw] uppercase tracking-[0.15em] text-[#8dffb3]">-1,688 tokens</div>
          </motion.div>
          <div className="grid grid-cols-2 gap-[1.1cqw]">
            <ProofCard label="Slashed" value="80.08%" detail="token suppression" tone="green" delay={0.3} />
            <ProofCard label="Latency overhead" value="0.2577 ms" detail="< 1.0 ms contract" tone="cyan" delay={0.42} />
            <ProofCard label="Schema & output" value="100%" detail="fidelity / PASS" tone="violet" delay={0.54} />
            <ProofCard label="Gain signal" value="4.02×" detail="less context sent" tone="green" delay={0.66} />
          </div>
        </div>
        <motion.div
          className="mt-[1.7cqw] flex items-center justify-between rounded-[0.8cqw] border border-[#8dffb3]/20 bg-[#8dffb3]/[0.05] px-[1.4cqw] py-[1cqw] gka-mono text-[0.95cqw] uppercase tracking-[0.13em]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85 }}
        >
          <span className="text-[#8dffb3]">✓ output text preserved / final JSON fidelity pass</span>
          <span className="text-white/38">audit stamp / 4 turns / live</span>
        </motion.div>
      </div>
    </SceneFrame>
  );
}

function SceneCta() {
  return (
    <SceneFrame eyebrow="04 // THE PILOT" title="Make the context work harder." index="04 / 04">
      <div className="relative flex h-full flex-col items-center justify-center px-[8cqw] pb-[4cqw] text-center">
        <motion.div
          className="absolute left-1/2 top-[12%] h-[25cqw] w-[25cqw] -translate-x-1/2 rounded-full bg-cyan-300/10 blur-[5cqw]"
          animate={{ scale: [0.9, 1.15, 0.9], opacity: [0.35, 0.62, 0.35] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div className="relative z-10 gka-mono text-[1.15cqw] uppercase tracking-[0.28em] text-[#8dffb3]" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          customer zero / pilot offer
        </motion.div>
        <motion.h2
          className="relative z-10 mt-[1.6cqw] max-w-[80cqw] text-[6.8cqw] font-semibold leading-[0.88] tracking-[-0.09em] text-white"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.25, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="text-[#62f6ff]">$0 UPFRONT</span>
          <br />
          <span className="text-white/80">67-33 GAIN-SHARE PILOT</span>
        </motion.h2>
        <motion.div
          className="relative z-10 mt-[2.1cqw] flex items-center gap-[1cqw] rounded-full border border-cyan-200/25 bg-cyan-200/[0.07] px-[1.5cqw] py-[0.85cqw] gka-mono text-[1.18cqw] uppercase tracking-[0.12em] text-cyan-50"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <span className="text-[#8dffb3]">↳</span> Deploy via 1-line base_url redirect in 60s
        </motion.div>
        <motion.div
          className="relative z-10 mt-[3.3cqw] text-[3.2cqw] font-semibold tracking-[-0.06em] text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          GravelKing <span className="text-[#62f6ff]">Advantage</span> <span className="text-white/45">(GKA)</span>
        </motion.div>
        <motion.div className="relative z-10 mt-[1cqw] gka-mono text-[0.9cqw] uppercase tracking-[0.22em] text-white/38" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
          context efficiency / measurable / production-ready
        </motion.div>
      </div>
    </SceneFrame>
  );
}

export const GkaAuditScenes = [SceneBleed, SceneCarve, SceneProof, SceneCta];