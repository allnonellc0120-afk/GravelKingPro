import { useState, useRef, useCallback } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, Power, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PluginDef, PluginType, PLUGIN_LABELS, PLUGIN_DEFAULTS, PLUGIN_PARAM_META } from "@/lib/daw/types";

// ── EQ frequency response curve ────────────────────────────────────────────

function computeEQCurve(params: Record<string, number>): string {
  const W = 200, H = 60, POINTS = 80;
  const freqs: number[] = [];
  for (let i = 0; i < POINTS; i++) freqs.push(20 * Math.pow(1000, i / (POINTS - 1)));

  const evalBiquad = (type: string, freq: number, gain: number, Q: number, f: number): number => {
    const Fs = 44100;
    const w0 = (2 * Math.PI * freq) / Fs;
    const A  = Math.pow(10, gain / 40);
    const w  = (2 * Math.PI * f) / Fs;

    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    if (type === "lowshelf") {
      const cosW = Math.cos(w0); const alpha = Math.sin(w0) / (2 * Q);
      b0 = A * ((A + 1) - (A - 1) * cosW + 2 * Math.sqrt(A) * alpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosW);
      b2 = A * ((A + 1) - (A - 1) * cosW - 2 * Math.sqrt(A) * alpha);
      a0 = (A + 1) + (A - 1) * cosW + 2 * Math.sqrt(A) * alpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosW);
      a2 = (A + 1) + (A - 1) * cosW - 2 * Math.sqrt(A) * alpha;
    } else if (type === "highshelf") {
      const cosW = Math.cos(w0); const alpha = Math.sin(w0) / (2 * Q);
      b0 = A * ((A + 1) + (A - 1) * cosW + 2 * Math.sqrt(A) * alpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosW);
      b2 = A * ((A + 1) + (A - 1) * cosW - 2 * Math.sqrt(A) * alpha);
      a0 = (A + 1) - (A - 1) * cosW + 2 * Math.sqrt(A) * alpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosW);
      a2 = (A + 1) - (A - 1) * cosW - 2 * Math.sqrt(A) * alpha;
    } else { // peaking
      const sinW = Math.sin(w0); const alpha = sinW / (2 * Q);
      b0 = 1 + alpha * A; b1 = -2 * Math.cos(w0); b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * Math.cos(w0); a2 = 1 - alpha / A;
    }
    const phi = 4 * Math.sin(w / 2) ** 2;
    const num = (b0 + b1 + b2) ** 2 - phi * ((b0 + b1 + b2) * (b0 - b1 + b2) + 4 * b0 * b2) + phi ** 2 * b0 * b2;
    const den = (a0 + a1 + a2) ** 2 - phi * ((a0 + a1 + a2) * (a0 - a1 + a2) + 4 * a0 * a2) + phi ** 2 * a0 * a2;
    return 10 * Math.log10(Math.max(1e-10, num / Math.max(1e-10, den)));
  };

  const dbs = freqs.map(f =>
    evalBiquad("lowshelf",  params.b1f || 80,    params.b1g || 0, 0.7,           f) +
    evalBiquad("peaking",   params.b2f || 400,   params.b2g || 0, params.b2q || 1.4, f) +
    evalBiquad("peaking",   params.b3f || 3000,  params.b3g || 0, params.b3q || 1.4, f) +
    evalBiquad("highshelf", params.b4f || 12000, params.b4g || 0, 0.7,           f)
  );

  const MIN_DB = -18, MAX_DB = 18;
  const points = dbs.map((db, i) => {
    const x = (i / (POINTS - 1)) * W;
    const y = H / 2 - ((db - MIN_DB) / (MAX_DB - MIN_DB) - 0.5) * H * 0.9;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return points.join(" ");
}

// ── Knob-style param control ───────────────────────────────────────────────

function ParamRow({ meta, value, onChange }: {
  meta: { key: string; label: string; min: number; max: number; step: number; unit: string };
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] text-muted-foreground w-16 shrink-0 truncate">{meta.label}</span>
      <Slider
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        min={meta.min} max={meta.max} step={meta.step}
        className="flex-1 min-w-0"
      />
      <span className="text-[10px] font-mono text-white/70 w-12 text-right shrink-0">
        {typeof value === "number" ? (Number.isInteger(value / meta.step) || meta.step < 0.1 ? value.toFixed(1) : value.toFixed(0)) : value}{meta.unit}
      </span>
    </div>
  );
}

// ── Plugin panel ──────────────────────────────────────────────────────────

function PluginPanel({ plugin, onUpdate }: {
  plugin: PluginDef;
  onUpdate: (key: string, value: number) => void;
}) {
  const meta = PLUGIN_PARAM_META[plugin.type];
  const params = plugin.params;
  const eqPoints = plugin.type === "eq" ? computeEQCurve(params) : null;

  return (
    <div className="space-y-2 pt-1">
      {eqPoints && (
        <svg viewBox="0 0 200 60" className="w-full rounded bg-black/40 border border-border/20" style={{ height: 60 }}>
          <line x1="0" y1="30" x2="200" y2="30" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          <polyline points={eqPoints} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
        </svg>
      )}
      {meta.map(m => (
        <ParamRow
          key={m.key}
          meta={m}
          value={params[m.key] ?? PLUGIN_DEFAULTS[plugin.type][m.key] ?? 0}
          onChange={v => onUpdate(m.key, v)}
        />
      ))}
    </div>
  );
}

// ── Plugin slot ──────────────────────────────────────────────────────────

const PLUGIN_COLORS: Record<PluginType, string> = {
  eq: "#f59e0b", compressor: "#3b82f6", reverb: "#8b5cf6", delay: "#06b6d4",
  distortion: "#ef4444", gate: "#22c55e", gain: "#94a3b8", pan: "#ec4899",
};

function PluginSlot({
  plugin, index, total,
  onRemove, onToggle, onUpdate, onMoveUp, onMoveDown,
}: {
  plugin: PluginDef; index: number; total: number;
  onRemove: () => void; onToggle: () => void;
  onUpdate: (key: string, value: number) => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const [open, setOpen] = useState(false);
  const color = PLUGIN_COLORS[plugin.type];

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: plugin.enabled ? `${color}40` : "rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 bg-black/30">
        {/* reorder */}
        <div className="flex flex-col gap-0.5 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0} className="p-0.5 text-muted-foreground hover:text-white disabled:opacity-20">
            <ChevronUp className="w-2.5 h-2.5" />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-0.5 text-muted-foreground hover:text-white disabled:opacity-20">
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
        </div>
        {/* bypass */}
        <button
          onClick={onToggle}
          className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0`}
          style={{ borderColor: plugin.enabled ? color : "rgba(255,255,255,0.15)", background: plugin.enabled ? `${color}22` : "transparent" }}
          title="Bypass toggle"
        >
          <Power className="w-2.5 h-2.5" style={{ color: plugin.enabled ? color : "rgba(255,255,255,0.3)" }} />
        </button>
        {/* name */}
        <button className="flex-1 text-left text-xs font-semibold truncate" style={{ color: plugin.enabled ? color : "rgba(255,255,255,0.4)" }} onClick={() => setOpen(v => !v)}>
          {PLUGIN_LABELS[plugin.type]}
        </button>
        {/* expand */}
        <button onClick={() => setOpen(v => !v)} className="text-muted-foreground hover:text-white p-0.5">
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {/* remove */}
        <button onClick={onRemove} className="text-muted-foreground hover:text-red-400 p-0.5">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-border/10 bg-black/20">
          <PluginPanel plugin={plugin} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}

// ── Plugin rack ───────────────────────────────────────────────────────────

const PLUGIN_TYPES: PluginType[] = ["eq", "compressor", "reverb", "delay", "distortion", "gate", "gain", "pan"];

export function PluginRack({
  plugins, trackId,
  onAdd, onRemove, onToggle, onUpdate, onReorder,
}: {
  plugins: PluginDef[];
  trackId: string;
  onAdd: (trackId: string, type: PluginType) => void;
  onRemove: (trackId: string, pluginId: string) => void;
  onToggle: (trackId: string, pluginId: string) => void;
  onUpdate: (trackId: string, pluginId: string, key: string, value: number) => void;
  onReorder: (trackId: string, from: number, to: number) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="space-y-1.5">
      {plugins.map((plugin, i) => (
        <PluginSlot
          key={plugin.id}
          plugin={plugin} index={i} total={plugins.length}
          onRemove={() => onRemove(trackId, plugin.id)}
          onToggle={() => onToggle(trackId, plugin.id)}
          onUpdate={(key, val) => onUpdate(trackId, plugin.id, key, val)}
          onMoveUp={() => onReorder(trackId, i, i - 1)}
          onMoveDown={() => onReorder(trackId, i, i + 1)}
        />
      ))}

      <div className="relative">
        <button
          onClick={() => setShowMenu(v => !v)}
          className="w-full flex items-center gap-1.5 text-left px-2 py-1.5 rounded-lg border border-dashed border-border/30 text-muted-foreground hover:text-white hover:border-amber-500/30 text-xs transition-colors"
        >
          <Plus className="w-3 h-3" /> Add Plugin
        </button>
        {showMenu && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-card border border-border/40 rounded-lg shadow-xl z-50 overflow-hidden">
            {PLUGIN_TYPES.map(type => (
              <button
                key={type}
                className="w-full text-left px-3 py-2 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
                onClick={() => { onAdd(trackId, type); setShowMenu(false); }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PLUGIN_COLORS[type] }} />
                {PLUGIN_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
