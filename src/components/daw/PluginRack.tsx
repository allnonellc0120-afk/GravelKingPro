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

// ── Interactive EQ graph (draggable band nodes) ────────────────────────────

const EQ_W = 200, EQ_H = 60;
const EQ_MIN_DB = -18, EQ_MAX_DB = 18;

// Log-frequency axis spanning 20 Hz – 20 kHz (matches computeEQCurve).
const freqToX = (f: number) => (Math.log(f / 20) / Math.log(1000)) * EQ_W;
const xToFreq = (x: number) => 20 * Math.pow(1000, Math.max(0, Math.min(1, x / EQ_W)));
const gainToY = (g: number) =>
  EQ_H / 2 - (((g - EQ_MIN_DB) / (EQ_MAX_DB - EQ_MIN_DB)) - 0.5) * EQ_H * 0.9;
const yToGain = (y: number) => {
  const frac = 0.5 + (EQ_H / 2 - y) / (EQ_H * 0.9);
  return frac * (EQ_MAX_DB - EQ_MIN_DB) + EQ_MIN_DB;
};

interface EQBand { freqKey: string; gainKey: string; fMin: number; fMax: number; label: string; }
const EQ_BANDS: EQBand[] = [
  { freqKey: "b1f", gainKey: "b1g", fMin: 20,   fMax: 500,   label: "Low" },
  { freqKey: "b2f", gainKey: "b2g", fMin: 200,  fMax: 5000,  label: "Mid" },
  { freqKey: "b3f", gainKey: "b3g", fMin: 1000, fMax: 16000, label: "Hi-Mid" },
  { freqKey: "b4f", gainKey: "b4g", fMin: 4000, fMax: 20000, label: "High" },
];

function InteractiveEQ({ params, onUpdate }: {
  params: Record<string, number>;
  onUpdate: (key: string, value: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<number | null>(null);
  const curve = computeEQCurve(params);

  // Highlight the 0–3000 Hz region (where most musical body & presence lives).
  const lowBandX = freqToX(3000);

  const toViewBox = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * EQ_W,
      y: ((clientY - rect.top) / rect.height) * EQ_H,
    };
  }, []);

  const applyDrag = useCallback((bandIdx: number, clientX: number, clientY: number) => {
    const band = EQ_BANDS[bandIdx];
    const { x, y } = toViewBox(clientX, clientY);
    const f = Math.round(Math.max(band.fMin, Math.min(band.fMax, xToFreq(x))));
    const g = Math.round(Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, yToGain(y))) * 2) / 2;
    onUpdate(band.freqKey, f);
    onUpdate(band.gainKey, g);
  }, [toViewBox, onUpdate]);

  const onPointerDown = useCallback((bandIdx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = bandIdx;
    applyDrag(bandIdx, e.clientX, e.clientY);
  }, [applyDrag]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragRef.current === null) return;
    applyDrag(dragRef.current, e.clientX, e.clientY);
  }, [applyDrag]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 200 60"
      className="w-full rounded bg-black/40 border border-border/20 touch-none"
      style={{ height: 60 }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* 0–3000 Hz focus region */}
      <rect x="0" y="0" width={lowBandX} height={EQ_H} fill="#f59e0b" opacity="0.06" />
      <line x1={lowBandX} y1="0" x2={lowBandX} y2={EQ_H} stroke="#f59e0b" strokeWidth="0.75" strokeDasharray="2 2" opacity="0.4" />
      <text x={lowBandX - 3} y={EQ_H - 3} textAnchor="end" fontSize="6" fill="#f59e0b" opacity="0.7">3 kHz</text>
      {/* 0 dB line */}
      <line x1="0" y1="30" x2="200" y2="30" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      {/* Response curve */}
      <polyline points={curve} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
      {/* Draggable band nodes */}
      {EQ_BANDS.map((band, i) => {
        const f = params[band.freqKey] ?? band.fMin;
        const g = params[band.gainKey] ?? 0;
        const inFocus = f <= 3000;
        return (
          <g key={band.freqKey}>
            <circle
              cx={freqToX(f)}
              cy={gainToY(g)}
              r={dragRef.current === i ? 4.5 : 3.5}
              fill={inFocus ? "#f59e0b" : "#64748b"}
              stroke="#000"
              strokeWidth="0.75"
              className="cursor-grab"
              style={{ touchAction: "none" }}
              onPointerDown={onPointerDown(i)}
            >
              <title>{`${band.label}: ${Math.round(f)} Hz, ${g.toFixed(1)} dB — drag to adjust`}</title>
            </circle>
          </g>
        );
      })}
    </svg>
  );
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

  return (
    <div className="space-y-2 pt-1">
      {plugin.type === "eq" && (
        <>
          <InteractiveEQ params={params} onUpdate={onUpdate} />
          <p className="text-[9px] text-muted-foreground/70 text-center -mt-1">
            Drag the dots to shape the curve · highlighted band = 0–3 kHz
          </p>
        </>
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
