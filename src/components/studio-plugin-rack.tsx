import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Link } from "wouter";
import { Lock, ChevronDown, ChevronUp } from "lucide-react";

export type PluginState = {
  eq: { enabled: boolean; low: number[]; mid: number[]; high: number[]; midFreq: number[] };
  comp: { enabled: boolean; threshold: number[]; ratio: number[]; attack: number[]; release: number[] };
  reverb: { enabled: boolean; wet: number[]; size: number[] };
  limiter: { enabled: boolean; ceiling: number[] };
};

export const DEFAULT_PLUGIN_STATE: PluginState = {
  eq:      { enabled: false, low: [0],   mid: [0],   high: [0],   midFreq: [1000] },
  comp:    { enabled: false, threshold: [-24], ratio: [4], attack: [3], release: [250] },
  reverb:  { enabled: false, wet: [30],  size: [50] },
  limiter: { enabled: false, ceiling: [-1] },
};

interface PluginRowProps {
  label: string;
  accent: string;
  emoji: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  locked?: boolean;
  lockLabel?: string;
  children: React.ReactNode;
}

function PluginRow({ label, accent, emoji, enabled, onToggle, locked, lockLabel, children }: PluginRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{
        borderColor: enabled && !locked ? `${accent}55` : "rgba(255,255,255,0.07)",
        background: enabled && !locked ? `linear-gradient(135deg,${accent}0a,transparent)` : "rgba(255,255,255,0.02)",
        boxShadow: enabled && !locked ? `0 0 20px ${accent}18` : "none",
      }}
    >
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
        onClick={() => !locked && setOpen(o => !o)}
      >
        <button
          className="w-5 h-5 rounded-full shrink-0 border-2 flex items-center justify-center transition-all"
          style={{
            borderColor: locked ? "rgba(255,255,255,0.15)" : accent,
            background: !locked && enabled ? accent : "transparent",
            boxShadow: !locked && enabled ? `0 0 8px ${accent}88` : "none",
          }}
          onClick={(e) => { e.stopPropagation(); if (!locked) onToggle(!enabled); }}
        >
          {!locked && enabled && (
            <div className="w-2 h-2 rounded-full bg-black" />
          )}
        </button>

        <span className="text-base leading-none">{emoji}</span>
        <span className="text-sm font-bold flex-1" style={{ color: enabled && !locked ? accent : "#94a3b8" }}>
          {label}
        </span>

        {locked ? (
          <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
            {lockLabel ?? "STUDIO"}
          </span>
        ) : (
          <div className="text-muted-foreground">
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        )}
      </div>

      {!locked && open && (
        <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-2.5">
          {children}
        </div>
      )}

      {locked && (
        <div className="px-3 pb-3 pointer-events-none opacity-30 space-y-3 border-t border-white/5 pt-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

function ParamRow({ label, value, unit, children }: { label: string; value: string; unit?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr_52px] items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
      {children}
      <span className="text-[10px] font-mono text-right" style={{ color: "rgba(255,255,255,0.5)" }}>
        {value}{unit}
      </span>
    </div>
  );
}

interface Props {
  plugins: PluginState;
  onChange: <K extends keyof PluginState>(plugin: K, updates: Partial<PluginState[K]>) => void;
  isPro: boolean;
  hasSplits: boolean;
}

export function StudioPluginRack({ plugins, onChange, isPro, hasSplits }: Props) {
  const canEq = isPro || hasSplits;
  const canComp = isPro;
  const canReverb = isPro;
  const canLimiter = isPro;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Plugin Chain</span>
        {!isPro && (
          <Link href="/pricing">
            <span className="text-[10px] text-amber-400 hover:text-amber-300 cursor-pointer underline underline-offset-2">
              Unlock All → Studio
            </span>
          </Link>
        )}
      </div>

      {/* EQ */}
      <PluginRow
        label="3-Band EQ"
        emoji="🎛️"
        accent="#38bdf8"
        enabled={plugins.eq.enabled}
        onToggle={(v) => onChange("eq", { enabled: v })}
        locked={!canEq}
        lockLabel={hasSplits ? undefined : "WEEKLY"}
      >
        <ParamRow label="Low Shelf" value={plugins.eq.low[0] > 0 ? `+${plugins.eq.low[0]}` : String(plugins.eq.low[0])} unit=" dB">
          <Slider value={plugins.eq.low} onValueChange={(v) => onChange("eq", { low: v })} min={-12} max={12} step={0.5} />
        </ParamRow>
        <ParamRow label="Mid Peak" value={plugins.eq.mid[0] > 0 ? `+${plugins.eq.mid[0]}` : String(plugins.eq.mid[0])} unit=" dB">
          <Slider value={plugins.eq.mid} onValueChange={(v) => onChange("eq", { mid: v })} min={-12} max={12} step={0.5} />
        </ParamRow>
        <ParamRow label="Mid Freq" value={plugins.eq.midFreq[0] >= 1000 ? `${(plugins.eq.midFreq[0] / 1000).toFixed(1)}k` : String(plugins.eq.midFreq[0])} unit="Hz">
          <Slider value={plugins.eq.midFreq} onValueChange={(v) => onChange("eq", { midFreq: v })} min={200} max={8000} step={100} />
        </ParamRow>
        <ParamRow label="High Shelf" value={plugins.eq.high[0] > 0 ? `+${plugins.eq.high[0]}` : String(plugins.eq.high[0])} unit=" dB">
          <Slider value={plugins.eq.high} onValueChange={(v) => onChange("eq", { high: v })} min={-12} max={12} step={0.5} />
        </ParamRow>
      </PluginRow>

      {/* Compressor */}
      <PluginRow
        label="Compressor"
        emoji="📉"
        accent="#34d399"
        enabled={plugins.comp.enabled}
        onToggle={(v) => onChange("comp", { enabled: v })}
        locked={!canComp}
      >
        <ParamRow label="Threshold" value={String(plugins.comp.threshold[0])} unit=" dB">
          <Slider value={plugins.comp.threshold} onValueChange={(v) => onChange("comp", { threshold: v })} min={-60} max={0} step={1} />
        </ParamRow>
        <ParamRow label="Ratio" value={`${plugins.comp.ratio[0]}:1`}>
          <Slider value={plugins.comp.ratio} onValueChange={(v) => onChange("comp", { ratio: v })} min={1} max={20} step={0.5} />
        </ParamRow>
        <ParamRow label="Attack" value={String(plugins.comp.attack[0])} unit=" ms">
          <Slider value={plugins.comp.attack} onValueChange={(v) => onChange("comp", { attack: v })} min={0} max={200} step={1} />
        </ParamRow>
        <ParamRow label="Release" value={String(plugins.comp.release[0])} unit=" ms">
          <Slider value={plugins.comp.release} onValueChange={(v) => onChange("comp", { release: v })} min={10} max={2000} step={10} />
        </ParamRow>
      </PluginRow>

      {/* Reverb */}
      <PluginRow
        label="Reverb"
        emoji="🌌"
        accent="#a78bfa"
        enabled={plugins.reverb.enabled}
        onToggle={(v) => onChange("reverb", { enabled: v })}
        locked={!canReverb}
      >
        <ParamRow label="Room Size" value={String(plugins.reverb.size[0])} unit="%">
          <Slider value={plugins.reverb.size} onValueChange={(v) => onChange("reverb", { size: v })} min={0} max={100} step={1} />
        </ParamRow>
        <ParamRow label="Wet Mix" value={String(plugins.reverb.wet[0])} unit="%">
          <Slider value={plugins.reverb.wet} onValueChange={(v) => onChange("reverb", { wet: v })} min={0} max={100} step={1} />
        </ParamRow>
      </PluginRow>

      {/* Limiter */}
      <PluginRow
        label="Limiter"
        emoji="🔒"
        accent="#fb7185"
        enabled={plugins.limiter.enabled}
        onToggle={(v) => onChange("limiter", { enabled: v })}
        locked={!canLimiter}
      >
        <ParamRow label="Ceiling" value={String(plugins.limiter.ceiling[0])} unit=" dBFS">
          <Slider value={plugins.limiter.ceiling} onValueChange={(v) => onChange("limiter", { ceiling: v })} min={-12} max={0} step={0.5} />
        </ParamRow>
      </PluginRow>

      {!isPro && !hasSplits && (
        <div className="flex items-center gap-2 mt-2 p-2.5 rounded-lg bg-amber-500/8 border border-amber-500/20">
          <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-400/80">
            Plugin chain is a <strong>Studio</strong> feature. EQ unlocks with <strong>Weekly</strong>.{" "}
            <Link href="/pricing" className="underline text-amber-400 hover:text-amber-300">Upgrade →</Link>
          </p>
        </div>
      )}
    </div>
  );
}
