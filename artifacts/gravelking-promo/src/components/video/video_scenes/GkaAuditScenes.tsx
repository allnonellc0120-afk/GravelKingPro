import { motion } from "framer-motion";
import type { ReactNode } from "react";

const amber = "#f5b83d";
const amberBright = "#ffd978";
const ice = "#dbe8e6";
const muted = "rgba(219, 232, 230, .48)";

const waveform = [18, 36, 22, 52, 30, 76, 42, 26, 62, 34, 84, 44, 27, 58, 38, 70, 24, 48, 31, 63, 40, 78, 25, 54];
const meterBars = [26, 44, 35, 68, 48, 82, 57, 74, 40, 66, 92, 54, 74, 45, 82, 38, 60, 32];

function SceneFrame({
  eyebrow,
  index,
  children,
}: {
  eyebrow: string;
  index: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      className="absolute inset-0 overflow-hidden bg-[#090a09] text-[#f5f1e8]"
      initial={{ opacity: 0, scale: 1.012 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.988 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(245,184,61,.14),transparent_30%),radial-gradient(circle_at_10%_90%,rgba(53,68,63,.28),transparent_34%),linear-gradient(180deg,#101310_0%,#070807_100%)]" />
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:5cqw_5cqw]" />
      <div className="absolute inset-x-0 top-0 h-[0.14cqw] bg-gradient-to-r from-transparent via-[#f5b83d] to-transparent opacity-80 gka-scanline" />
      <header className="relative z-10 flex items-center justify-between px-[5.5cqw] pt-[3.2cqw]">
        <div className="flex items-center gap-[1cqw]">
          <div className="flex h-[2.2cqw] w-[2.2cqw] items-center justify-center rounded-[0.55cqw] bg-[#f5b83d] font-black text-[#11120e] shadow-[0_0_2.4cqw_rgba(245,184,61,.28)]">
            G
          </div>
          <div>
            <div className="gka-mono text-[1.05cqw] uppercase tracking-[0.22em] text-white/75">GRAVELKING PRO</div>
            <div className="mt-[0.28cqw] gka-mono text-[0.75cqw] uppercase tracking-[0.18em] text-[#f5b83d]/70">MAIN STAGE / LIVE ROOM</div>
          </div>
        </div>
        <div className="flex items-center gap-[1.2cqw] gka-mono text-[0.85cqw] uppercase tracking-[0.18em] text-white/42">
          <span className="gka-pulse h-[0.62cqw] w-[0.62cqw] rounded-full bg-[#ed6f50] shadow-[0_0_1.1cqw_#ed6f50]" />
          LIVE SESSION
          <span className="text-white/18">/</span>
          {index}
        </div>
      </header>
      <div className="relative z-10 h-[calc(100%-6cqw)]">{children}</div>
      <div className="absolute bottom-[2.2cqw] left-[5.5cqw] right-[5.5cqw] z-10 flex items-center justify-between gka-mono text-[0.72cqw] uppercase tracking-[0.2em] text-white/28">
        <span>MAIN STAGE / HOST + GUEST</span>
        <span>GRAVELKING PRO</span>
      </div>
    </motion.section>
  );
}

function Waveform({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-[0.22cqw] ${compact ? "h-[2.6cqw]" : "h-[3.8cqw]"}`} aria-hidden="true">
      {waveform.map((height, index) => (
        <motion.span
          key={`${height}-${index}`}
          className="w-[0.28cqw] rounded-full bg-[#f5b83d]/70"
          style={{ height: `${compact ? height * 0.55 : height}%` }}
          animate={{ opacity: [0.38, 0.92, 0.48], scaleY: [0.78, 1.08, 0.84] }}
          transition={{ duration: 1.05 + (index % 4) * 0.12, repeat: Infinity, delay: index * 0.035, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function Meter({
  label,
  tone = "amber",
  reverse = false,
}: {
  label: string;
  tone?: "amber" | "ice";
  reverse?: boolean;
}) {
  const color = tone === "ice" ? "#b6d2cb" : amber;
  return (
    <div className="flex items-center gap-[0.7cqw]">
      <span className="w-[6.1cqw] shrink-0 gka-mono text-[0.7cqw] uppercase tracking-[0.15em] text-white/42">{label}</span>
      <div className={`flex h-[2.2cqw] flex-1 items-end gap-[0.16cqw] ${reverse ? "justify-start" : "justify-end"}`}>
        {meterBars.map((height, index) => (
          <motion.span
            key={`${label}-${index}`}
            className="w-[0.4cqw] rounded-t-[0.15cqw]"
            style={{ backgroundColor: color, opacity: 0.45 + (index % 4) * 0.12 }}
            animate={{ height: [`${Math.max(12, height * 0.48)}%`, `${Math.min(100, height + 10)}%`, `${Math.max(10, height * 0.62)}%`] }}
            transition={{ duration: 0.8 + (index % 3) * 0.14, repeat: Infinity, delay: index * 0.035, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span className="w-[2.6cqw] text-right gka-mono text-[0.7cqw] text-white/55">LIVE</span>
    </div>
  );
}

function ArtistFeed({
  role,
  name,
  side,
  delay = 0,
  compact = false,
}: {
  role: "HOST" | "GUEST";
  name: string;
  side: "left" | "right";
  delay?: number;
  compact?: boolean;
}) {
  const isHost = role === "HOST";
  const accent = isHost ? "#f5b83d" : "#b7d2ca";
  return (
    <motion.div
      className={`relative overflow-hidden rounded-[0.9cqw] border bg-[#111613]/90 ${compact ? "p-[1cqw]" : "p-[1.3cqw]"}`}
      style={{ borderColor: `${accent}55`, boxShadow: `0 0 2.5cqw ${accent}12` }}
      initial={{ opacity: 0, x: side === "left" ? -18 : 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.55 }}
    >
      <div className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at ${side === "left" ? "25%" : "75%"} 35%, ${accent}22, transparent 42%)` }} />
      <div className="relative z-10 flex items-center justify-between">
        <div>
          <div className="gka-mono text-[0.68cqw] uppercase tracking-[0.2em]" style={{ color: accent }}>{role} / {side === "left" ? "LEFT" : "RIGHT"}</div>
          <div className={`mt-[0.35cqw] font-semibold tracking-[-0.05em] text-white ${compact ? "text-[1.35cqw]" : "text-[1.75cqw]"}`}>{name}</div>
        </div>
        <span className="rounded-full border px-[0.65cqw] py-[0.32cqw] gka-mono text-[0.62cqw] uppercase tracking-[0.12em]" style={{ borderColor: `${accent}55`, color: accent }}>
          MIC ON
        </span>
      </div>
      <div className={`relative z-10 mt-[1.1cqw] flex items-end justify-center overflow-hidden rounded-[0.65cqw] bg-gradient-to-b from-[#28322d] to-[#0c100e] ${compact ? "h-[7.2cqw]" : "h-[12.4cqw]"}`}>
        <div className="absolute inset-x-[17%] top-[12%] h-[0.12cqw] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="relative mb-[-1.6cqw] h-[7.8cqw] w-[7.8cqw] rounded-full border-[0.35cqw] border-white/10 bg-[#151b18] shadow-[0_0_2.2cqw_rgba(0,0,0,.65)]">
          <div className="absolute left-1/2 top-[45%] h-[3.1cqw] w-[4.4cqw] -translate-x-1/2 rounded-[45%_45%_38%_38%] bg-[#222b26]" />
          <div className="absolute left-[28%] top-[40%] h-[0.32cqw] w-[0.32cqw] rounded-full bg-white/50" />
          <div className="absolute right-[28%] top-[40%] h-[0.32cqw] w-[0.32cqw] rounded-full bg-white/50" />
        </div>
        <div className="absolute bottom-[0.7cqw] left-[8%] right-[8%] h-[0.2cqw] rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 1.3cqw ${accent}` }} />
      </div>
      <div className="relative z-10 mt-[0.8cqw]"><Meter label="VOCAL" tone={isHost ? "amber" : "ice"} reverse={side === "right"} /></div>
    </motion.div>
  );
}

function Transport({
  track = "Midnight Highway / Duet Take 01",
  progress = "34%",
}: {
  track?: string;
  progress?: string;
}) {
  return (
    <div className="rounded-[0.75cqw] border border-white/10 bg-[#111512]/95 px-[1.2cqw] py-[0.8cqw] shadow-[0_0.8cqw_2cqw_rgba(0,0,0,.24)]">
      <div className="flex items-center gap-[1.1cqw]">
        <div className="flex items-center gap-[0.35cqw]">
          <span className="flex h-[2.1cqw] w-[2.1cqw] items-center justify-center rounded-full bg-[#f5b83d] text-[0.85cqw] text-[#14140d]">▶</span>
          <span className="gka-mono text-[0.72cqw] text-white/60">00:12</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gka-mono text-[0.67cqw] uppercase tracking-[0.14em]">
            <span className="truncate text-white/68">{track}</span>
            <span className="text-white/32">02:48</span>
          </div>
          <div className="relative mt-[0.48cqw] h-[0.35cqw] overflow-hidden rounded-full bg-white/10">
            <motion.div className="absolute inset-y-0 left-0 rounded-full bg-[#f5b83d]" initial={{ width: 0 }} animate={{ width: progress }} transition={{ duration: 1.2, ease: "easeOut" }} />
          </div>
        </div>
        <span className="rounded-full border border-[#b7d2ca]/25 px-[0.65cqw] py-[0.3cqw] gka-mono text-[0.62cqw] uppercase tracking-[0.14em] text-[#b7d2ca]">48kHz</span>
      </div>
      <div className="mt-[0.65cqw]"><Waveform compact /></div>
    </div>
  );
}

function LyricPrompter({ active = 0 }: { active?: number }) {
  const lines = ["Take the night and make it ours", "we're already in the light", "two voices rise together"];
  return (
    <div className="relative overflow-hidden rounded-[1cqw] border border-[#f5b83d]/38 bg-[#15130e]/95 px-[2.4cqw] py-[1.7cqw] shadow-[0_0_4cqw_rgba(245,184,61,.13)]">
      <div className="mb-[1.15cqw] flex items-center justify-between gka-mono text-[0.68cqw] uppercase tracking-[0.18em]">
        <span className="text-[#f5b83d]">ROLLING PROMPTER / SYNCED</span>
        <span className="text-white/35">AUTO-SCROLL ON</span>
      </div>
      <div className="space-y-[0.9cqw] text-center">
        {lines.map((line, index) => (
          <motion.div
            key={line}
            className="font-semibold tracking-[-0.045em]"
            style={{ fontSize: index === active ? "3.2cqw" : "1.55cqw", lineHeight: 0.95 }}
            animate={{ opacity: index === active ? 1 : 0.25, y: index === active ? 0 : index < active ? -3 : 3 }}
            transition={{ duration: 0.45 }}
          >
            <span className={index === active ? "text-[#ffd978]" : "text-white/60"}>{line}</span>
          </motion.div>
        ))}
      </div>
      <div className="absolute bottom-0 left-[2.4cqw] right-[2.4cqw] h-[0.12cqw] bg-gradient-to-r from-transparent via-[#f5b83d] to-transparent opacity-80" />
    </div>
  );
}

function SceneHook() {
  return (
    <SceneFrame eyebrow="01 // DUET HOOK" index="01 / 04">
      <div className="flex h-full flex-col justify-center px-[5.5cqw] pb-[2.2cqw]">
        <div className="mb-[1.25cqw] flex items-center justify-between">
          <motion.div className="gka-mono text-[0.78cqw] uppercase tracking-[0.22em] text-[#f5b83d]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>THE ROOM IS OPEN</motion.div>
          <motion.div className="gka-mono text-[0.72cqw] uppercase tracking-[0.17em] text-white/38" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }}>00:00 / 00:30</motion.div>
        </div>
        <div className="grid grid-cols-[1fr_1fr] gap-[1.1cqw]">
          <ArtistFeed role="HOST" name="Maya Rivers" side="left" delay={0.18} />
          <ArtistFeed role="GUEST" name="Theo Vale" side="right" delay={0.3} />
        </div>
        <motion.div className="relative z-20 -mt-[1.1cqw] flex justify-center" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.48, duration: 0.55 }}>
          <div className="rounded-full border border-[#f5b83d]/55 bg-[#16130d] px-[1.8cqw] py-[0.72cqw] gka-mono text-[0.7cqw] uppercase tracking-[0.18em] text-[#ffd978] shadow-[0_0_2.5cqw_rgba(245,184,61,.2)]">LATENCY LOCKED / BOTH MICS LIVE</div>
        </motion.div>
        <motion.div className="mt-[1.2cqw] grid grid-cols-[1fr_1.3fr_1fr] items-center gap-[1.2cqw]" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62 }}>
          <Meter label="HOST INPUT" tone="amber" />
          <div className="text-center">
            <div className="gka-mono text-[0.7cqw] uppercase tracking-[0.16em] text-white/35">DUET BUS</div>
            <div className="mt-[0.35cqw]"><Waveform /></div>
          </div>
          <Meter label="GUEST INPUT" tone="ice" reverse />
        </motion.div>
        <motion.h1 className="pointer-events-none absolute bottom-[5.2cqw] left-1/2 z-30 w-[90cqw] -translate-x-1/2 text-center text-[4.35cqw] font-black uppercase leading-[0.84] tracking-[-0.085em] text-white drop-shadow-[0_0.45cqw_1.2cqw_rgba(0,0,0,.8)]" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.82, duration: 0.55 }}>
          TWO SINGERS. ONE STAGE. <span className="text-[#f5b83d]">ZERO LATENCY.</span>
        </motion.h1>
      </div>
    </SceneFrame>
  );
}

function ScenePrompter() {
  return (
    <SceneFrame eyebrow="02 // ROLLING LYRICS" index="02 / 04">
      <div className="flex h-full flex-col justify-center px-[6.5cqw] pb-[2.1cqw]">
        <div className="mb-[1.15cqw] flex items-end justify-between">
          <div>
            <motion.div className="gka-mono text-[0.76cqw] uppercase tracking-[0.2em] text-[#f5b83d]" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>SYNCED LYRIC ENGINE</motion.div>
            <motion.div className="mt-[0.4cqw] text-[1.9cqw] font-semibold tracking-[-0.06em] text-white" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }}>The next line is always ready.</motion.div>
          </div>
          <div className="rounded-full border border-[#b7d2ca]/25 bg-[#b7d2ca]/[0.06] px-[0.9cqw] py-[0.55cqw] gka-mono text-[0.7cqw] uppercase tracking-[0.15em] text-[#b7d2ca]">TRACK LOADED / ANY FORMAT</div>
        </div>
        <div className="grid grid-cols-[0.72fr_1.56fr_0.72fr] items-center gap-[1.2cqw]">
          <ArtistFeed role="HOST" name="Maya Rivers" side="left" delay={0.18} compact />
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.28, duration: 0.6 }}>
            <LyricPrompter active={1} />
          </motion.div>
          <ArtistFeed role="GUEST" name="Theo Vale" side="right" delay={0.34} compact />
        </div>
        <motion.div className="mt-[1.05cqw]" initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}>
          <Transport track="Midnight Highway / Backing Track" progress="52%" />
        </motion.div>
        <motion.div className="mt-[1.15cqw] text-center gka-mono text-[1.02cqw] uppercase tracking-[0.14em] text-[#ffd978]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.74 }}>
          SYNCHRONIZED ROLLING PROMPTER <span className="text-white/30">•</span> LOAD ANY TRACK
        </motion.div>
      </div>
    </SceneFrame>
  );
}

function QueueRow({ number, role, name, status, active = false }: { number: string; role: string; name: string; status: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-[0.8cqw] rounded-[0.6cqw] border px-[0.85cqw] py-[0.7cqw] ${active ? "border-[#f5b83d]/45 bg-[#f5b83d]/[0.08]" : "border-white/10 bg-white/[0.025]"}`}>
      <span className={`gka-mono text-[0.7cqw] ${active ? "text-[#f5b83d]" : "text-white/30"}`}>{number}</span>
      <div className="min-w-0 flex-1">
        <div className={`gka-mono text-[0.61cqw] uppercase tracking-[0.14em] ${active ? "text-[#f5b83d]" : "text-white/38"}`}>{role}</div>
        <div className="truncate text-[0.95cqw] font-medium text-white/80">{name}</div>
      </div>
      <span className={`gka-mono text-[0.62cqw] uppercase tracking-[0.1em] ${active ? "text-[#ffd978]" : "text-white/32"}`}>{status}</span>
    </div>
  );
}

function SceneQueue() {
  return (
    <SceneFrame eyebrow="03 // DUET QUEUE" index="03 / 04">
      <div className="flex h-full flex-col justify-center px-[5.8cqw] pb-[2.1cqw]">
        <div className="mb-[1.25cqw] flex items-end justify-between">
          <div>
            <motion.div className="gka-mono text-[0.76cqw] uppercase tracking-[0.2em] text-[#f5b83d]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>NO DEAD AIR BETWEEN TAKES</motion.div>
            <motion.div className="mt-[0.4cqw] text-[2.35cqw] font-semibold leading-none tracking-[-0.07em] text-white" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>Pass the mic. Keep the moment.</motion.div>
          </div>
          <div className="flex items-center gap-[0.7cqw] rounded-full border border-[#f5b83d]/30 px-[0.9cqw] py-[0.55cqw] gka-mono text-[0.68cqw] uppercase tracking-[0.14em] text-[#ffd978]"><span className="gka-pulse h-[0.5cqw] w-[0.5cqw] rounded-full bg-[#f5b83d]" />QUEUE ONLINE</div>
        </div>
        <div className="grid grid-cols-[1.26fr_0.74fr] gap-[1.25cqw]">
          <div className="grid grid-cols-2 gap-[1cqw]">
            <ArtistFeed role="HOST" name="Maya Rivers" side="left" delay={0.18} compact />
            <ArtistFeed role="GUEST" name="Theo Vale" side="right" delay={0.27} compact />
          </div>
          <motion.div className="rounded-[0.9cqw] border border-[#f5b83d]/25 bg-[#12140f]/95 p-[1.15cqw]" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.34 }}>
            <div className="mb-[0.85cqw] flex items-center justify-between">
              <span className="gka-mono text-[0.7cqw] uppercase tracking-[0.18em] text-white/48">DUET QUEUE</span>
              <span className="gka-mono text-[0.65cqw] text-[#f5b83d]">3 READY</span>
            </div>
            <div className="space-y-[0.55cqw]">
              <QueueRow number="01" role="NOW PLAYING" name="Midnight Highway" status="LIVE" active />
              <QueueRow number="02" role="HOST" name="Afterglow Chorus" status="UP NEXT" />
              <QueueRow number="03" role="GUEST" name="Open Road" status="QUEUED" />
            </div>
            <div className="mt-[0.8cqw]"><Transport track="Midnight Highway / Live Mix" progress="71%" /></div>
          </motion.div>
        </div>
        <motion.div className="mt-[1.2cqw] text-center gka-mono text-[1.02cqw] uppercase tracking-[0.14em] text-[#ffd978]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.68 }}>
          SEAMLESS DUET QUEUE <span className="text-white/30">•</span> LIVE MIXDOWN
        </motion.div>
      </div>
    </SceneFrame>
  );
}

function SceneCta() {
  return (
    <SceneFrame eyebrow="04 // TAKE THE STAGE" index="04 / 04">
      <div className="relative flex h-full flex-col items-center justify-center px-[7cqw] pb-[2cqw] text-center">
        <motion.div className="absolute left-1/2 top-[8%] h-[32cqw] w-[50cqw] -translate-x-1/2 rounded-[50%] bg-[#f5b83d]/[0.11] blur-[5cqw]" animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.4, 0.75, 0.4] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }} />
        <motion.div className="relative z-10 mb-[1.2cqw] flex items-center gap-[0.8cqw] gka-mono text-[0.78cqw] uppercase tracking-[0.24em] text-[#f5b83d]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>MAIN STAGE IS LIVE <span className="h-[0.55cqw] w-[0.55cqw] rounded-full bg-[#f5b83d]" /></motion.div>
        <motion.h2 className="relative z-10 max-w-[82cqw] text-[5.25cqw] font-black uppercase leading-[0.86] tracking-[-0.09em] text-white" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}>
          STEP ONTO THE <span className="text-[#f5b83d]">MAIN STAGE</span>
          <br />
          <span className="text-white/80">FREE ACCESS NOW</span>
        </motion.h2>
        <motion.div className="relative z-10 mt-[2cqw] rounded-full border border-[#f5b83d]/55 bg-[#f5b83d]/[0.1] px-[2.1cqw] py-[0.9cqw] gka-mono text-[1.2cqw] uppercase tracking-[0.14em] text-[#ffd978] shadow-[0_0_3cqw_rgba(245,184,61,.18)]" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
          gravelkingpro.it.com
        </motion.div>
        <motion.div className="relative z-10 mt-[2.4cqw] flex items-end gap-[0.8cqw]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.68 }}>
          <div className="w-[16cqw]"><ArtistFeed role="HOST" name="Maya" side="left" compact /></div>
          <div className="mb-[1.2cqw] gka-mono text-[0.7cqw] uppercase tracking-[0.16em] text-white/30">HOST + GUEST / TOGETHER</div>
          <div className="w-[16cqw]"><ArtistFeed role="GUEST" name="Theo" side="right" compact /></div>
        </motion.div>
        <motion.div className="relative z-10 mt-[1.15cqw] gka-mono text-[0.68cqw] uppercase tracking-[0.2em] text-white/38" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>Load a track. Invite a voice. Make the room yours.</motion.div>
      </div>
    </SceneFrame>
  );
}

export const GkaAuditScenes = [SceneHook, ScenePrompter, SceneQueue, SceneCta];