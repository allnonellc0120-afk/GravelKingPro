import { useRef, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Activity } from "lucide-react";
import { PluginDef, PluginType } from "@/lib/daw/types";
import { PluginRack } from "./PluginRack";

interface MasterBusProps {
  plugins: PluginDef[];
  analyserRef: React.MutableRefObject<AnalyserNode | null>;
  isPlaying: boolean;
  onUpdatePlugin: (pluginId: string, key: string, value: number) => void;
  onTogglePlugin: (pluginId: string) => void;
}

function LevelMeter({ analyserRef, isPlaying }: { analyserRef: React.MutableRefObject<AnalyserNode | null>; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const peakL = useRef(0), peakR = useRef(0);
  const peakHoldL = useRef(0), peakHoldR = useRef(0);
  const peakTimeL = useRef(0), peakTimeR = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      const analyser = analyserRef.current;
      const ctx = canvas.getContext("2d")!;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let rmsL = 0, rmsR = 0;
      if (analyser && isPlaying) {
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        const half = Math.floor(data.length / 2);
        for (let i = 0; i < half; i++) rmsL += data[i] * data[i];
        for (let i = half; i < data.length; i++) rmsR += data[i] * data[i];
        rmsL = Math.sqrt(rmsL / half);
        rmsR = Math.sqrt(rmsR / (data.length - half));
      }

      const now = performance.now();
      const decay = isPlaying ? 0.92 : 0.8;
      peakL.current = Math.max(rmsL, peakL.current * decay);
      peakR.current = Math.max(rmsR, peakR.current * decay);
      if (rmsL > peakHoldL.current) { peakHoldL.current = rmsL; peakTimeL.current = now; }
      if (rmsR > peakHoldR.current) { peakHoldR.current = rmsR; peakTimeR.current = now; }
      if (now - peakTimeL.current > 1500) peakHoldL.current *= 0.95;
      if (now - peakTimeR.current > 1500) peakHoldR.current *= 0.95;

      const dbToY = (db: number) => {
        const pct = Math.max(0, Math.min(1, (db + 60) / 60));
        return H * (1 - pct);
      };
      const rmsToDb = (v: number) => v < 0.00001 ? -60 : 20 * Math.log10(v);

      const drawBar = (x: number, w: number, rms: number, peak: number) => {
        const db = rmsToDb(rms);
        const peakDb = rmsToDb(peak);
        const y = dbToY(db);
        const barH = H - y;

        const grad = ctx.createLinearGradient(0, H, 0, 0);
        grad.addColorStop(0, "#22c55e");
        grad.addColorStop(0.6, "#f59e0b");
        grad.addColorStop(1, "#ef4444");
        ctx.fillStyle = grad;
        ctx.fillRect(x * dpr, y * dpr, w * dpr, barH * dpr);

        // peak hold
        const py = dbToY(peakDb);
        ctx.fillStyle = peakDb > -3 ? "#ef4444" : "#fbbf24";
        ctx.fillRect(x * dpr, py * dpr, w * dpr, 1.5 * dpr);
      };

      const barW = (W - 4) / 2;
      drawBar(0, barW, peakL.current, peakHoldL.current);
      drawBar(barW + 4, barW, peakR.current, peakHoldR.current);

      // dB scale ticks
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = `${7 * dpr}px monospace`;
      for (const db of [-60, -40, -20, -12, -6, -3, 0]) {
        const y = dbToY(db);
        ctx.fillRect(0, y * dpr, W * dpr, 0.5 * dpr);
        if (db > -60) ctx.fillText(`${db}`, 1 * dpr, (y - 1) * dpr);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyserRef, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded"
      style={{ height: 100, display: "block" }}
    />
  );
}

export function MasterBus({
  plugins, analyserRef, isPlaying, onUpdatePlugin, onTogglePlugin,
}: MasterBusProps) {
  const [open, setOpen] = useState(false);

  const wrapAdd = (_trackId: string, _type: PluginType) => {};
  const wrapRemove = (_trackId: string, _pluginId: string) => {};
  const wrapToggle = (_trackId: string, pluginId: string) => onTogglePlugin(pluginId);
  const wrapUpdate = (_trackId: string, pluginId: string, key: string, value: number) => onUpdatePlugin(pluginId, key, value);
  const wrapReorder = (_trackId: string, _from: number, _to: number) => {};

  return (
    <div className="border-t border-border/30 bg-black/60 backdrop-blur-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-white transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-amber-500" />
          <span>Master Bus</span>
          <span className="text-[10px] text-amber-500/60 font-normal">
            {plugins.filter(p => p.enabled).length} active
          </span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-4">
          {/* Level meter */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Output Level</p>
            <LevelMeter analyserRef={analyserRef} isPlaying={isPlaying} />
          </div>

          {/* Master plugins */}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Master Chain</p>
            <PluginRack
              plugins={plugins}
              trackId="master"
              onAdd={wrapAdd}
              onRemove={wrapRemove}
              onToggle={wrapToggle}
              onUpdate={wrapUpdate}
              onReorder={wrapReorder}
            />
          </div>
        </div>
      )}
    </div>
  );
}
