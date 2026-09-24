import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, Loader2, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { downloadBlob } from "@/lib/download";
import {
  buildStemGraph,
  disconnectStemGraph,
  isStemAudible,
  MAX_STEMS,
  renderStemBounce,
  type StemGraph,
  type StemMixSettings,
} from "@/lib/stem-bounce";

interface StemRackProps {
  sourceUrl: string;
  fileName: string;
}

const INITIAL_STEM: StemMixSettings = {
  id: "stem-1",
  name: "Stem 1",
  level: 0.85,
  pan: 0,
  lowGain: 0,
  midGain: 0,
  highGain: 0,
  solo: false,
  muted: false,
};

function makeStem(id: string, index: number): StemMixSettings {
  return { ...INITIAL_STEM, id, name: `Stem ${index}` };
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function StemRack({ sourceUrl, fileName }: StemRackProps) {
  const [stems, setStems] = useState<StemMixSettings[]>([INITIAL_STEM]);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewContextRef = useRef<AudioContext | null>(null);
  const previewGraphsRef = useRef<Map<string, StemGraph>>(new Map());
  const playingRef = useRef(false);
  const graphStemIdsRef = useRef<string[]>([]);
  const nextStemNumberRef = useRef(2);
  const bufferRef = useRef<AudioBuffer | null>(null);

  const stopPreview = useCallback(() => {
    for (const graph of previewGraphsRef.current.values()) {
      disconnectStemGraph(graph);
    }
    previewGraphsRef.current.clear();
    graphStemIdsRef.current = [];
    const context = previewContextRef.current;
    previewContextRef.current = null;
    if (context) void context.close().catch(() => {});
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const createPreview = useCallback(async (nextStems: readonly StemMixSettings[]) => {
    const decoded = bufferRef.current;
    const Ctor = getAudioContextCtor();
    if (!decoded || !Ctor) throw new Error("This browser cannot preview the stem rack.");

    stopPreview();
    const context = new Ctor({ latencyHint: "interactive", sampleRate: decoded.sampleRate });
    previewContextRef.current = context;
    if (context.state === "suspended") await context.resume();
    const graphs = new Map<string, StemGraph>();
    let endedSources = 0;
    for (const stem of nextStems) {
      const graph = buildStemGraph(
        context,
        decoded,
        stem,
        context.destination,
        isStemAudible(nextStems, stem),
      );
      graphs.set(stem.id, graph);
      graph.source.onended = () => {
        endedSources += 1;
        if (endedSources >= nextStems.length) {
          // The backing buffer ended naturally; the button remains safe to press again.
          playingRef.current = false;
          setPlaying(false);
        }
      };
      graph.source.start(0);
    }
    previewGraphsRef.current = graphs;
    graphStemIdsRef.current = nextStems.map((stem) => stem.id);
    playingRef.current = true;
    setPlaying(true);
  }, [stopPreview]);

  const syncPreviewControls = useCallback((nextStems: readonly StemMixSettings[]) => {
    const hasSolo = nextStems.some((stem) => stem.solo);
    for (const stem of nextStems) {
      const graph = previewGraphsRef.current.get(stem.id);
      if (!graph) continue;
      graph.low.gain.value = stem.lowGain;
      graph.mid.gain.value = stem.midGain;
      graph.high.gain.value = stem.highGain;
      graph.panner.pan.value = stem.pan;
      graph.gain.gain.value = !stem.muted && (!hasSolo || stem.solo) ? stem.level : 0;
    }
  }, []);

  useEffect(() => {
    bufferRef.current = buffer;
  }, [buffer]);

  useEffect(() => {
    let cancelled = false;
    const Ctor = getAudioContextCtor();
    setLoading(true);
    setError(null);
    setBuffer(null);
    bufferRef.current = null;
    setStems([{ ...INITIAL_STEM }]);
    nextStemNumberRef.current = 2;
    stopPreview();

    if (!Ctor) {
      setLoading(false);
      setError("This browser cannot decode audio for stem editing.");
      return () => { cancelled = true; };
    }

    const decode = async () => {
      const context = new Ctor();
      try {
        const response = await fetch(sourceUrl, { credentials: "include" });
        if (!response.ok) throw new Error(`Could not load mastered audio (HTTP ${response.status}).`);
        const bytes = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(bytes.slice(0));
        if (cancelled) return;
        setBuffer(decoded);
        bufferRef.current = decoded;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not decode mastered audio.");
      } finally {
        await context.close().catch(() => {});
        if (!cancelled) setLoading(false);
      }
    };
    void decode();
    return () => {
      cancelled = true;
      stopPreview();
    };
  }, [sourceUrl, stopPreview]);

  useEffect(() => {
    if (!playingRef.current) return;
    const ids = stems.map((stem) => stem.id);
    const changedShape = ids.length !== graphStemIdsRef.current.length || ids.some((id, index) => id !== graphStemIdsRef.current[index]);
    if (changedShape) {
      void createPreview(stems).catch((err) => setError(err instanceof Error ? err.message : "Could not preview stems."));
    } else {
      syncPreviewControls(stems);
    }
  }, [stems, createPreview, syncPreviewControls]);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const updateStem = useCallback((id: string, update: Partial<StemMixSettings>) => {
    setStems((current) => current.map((stem) => stem.id === id ? { ...stem, ...update } : stem));
  }, []);

  const duplicateStem = useCallback(() => {
    setStems((current) => {
      if (current.length >= MAX_STEMS) return current;
      const index = nextStemNumberRef.current;
      nextStemNumberRef.current += 1;
      return [...current, makeStem(`stem-${index}`, index)];
    });
  }, []);

  const removeStem = useCallback((id: string) => {
    setStems((current) => current.length <= 1 || current[0]?.id === id ? current : current.filter((stem) => stem.id !== id));
  }, []);

  const exportBounce = useCallback(async () => {
    if (!buffer || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const wav = await renderStemBounce(buffer, stems);
      const safeName = fileName.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_") || "mastered";
      downloadBlob(wav, `${safeName}_stems_24bit.wav`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not export the stem bounce.";
      setError(message);
    } finally {
      setExporting(false);
    }
  }, [buffer, exporting, fileName, stems]);

  return (
    <section className="space-y-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4" data-testid="stem-rack">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-emerald-200">Parallel stem rack</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            One decoded buffer, up to three independent chains, and a local 24-bit bounce.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (playing) stopPreview();
              else void createPreview(stems).catch((err) => setError(err instanceof Error ? err.message : "Could not preview stems."));
            }}
            disabled={loading || !buffer}
            className="border-emerald-500/30"
            data-testid="button-preview-stems"
          >
            {playing ? <Square className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            {playing ? "Stop preview" : "Preview stems"}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void exportBounce()}
            disabled={loading || !buffer || exporting}
            className="bg-emerald-600 hover:bg-emerald-700"
            data-testid="button-export-stem-bounce"
          >
            {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
            {exporting ? "Bouncing…" : "Export 24-bit WAV"}
          </Button>
        </div>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Decoding the mastered buffer once…</p>}
      {error && <p className="rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200" role="alert">{error}</p>}

      <div className="space-y-3">
        {stems.map((stem, index) => (
          <div key={stem.id} className="space-y-3 rounded-lg border border-border/30 bg-background/20 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground/90">{stem.name}</span>
              {index === 0 && <span className="rounded border border-emerald-500/30 px-1.5 py-0.5 text-[9px] text-emerald-300">Primary</span>}
              <div className="ml-auto flex gap-1">
                <Button type="button" size="icon" variant="ghost" onClick={() => updateStem(stem.id, { solo: !stem.solo })} className={`h-7 w-7 text-[10px] ${stem.solo ? "bg-amber-500/20 text-amber-200" : "text-muted-foreground"}`} aria-label={`${stem.solo ? "Unsolo" : "Solo"} ${stem.name}`} data-testid={`button-solo-${stem.id}`}>S</Button>
                <Button type="button" size="icon" variant="ghost" onClick={() => updateStem(stem.id, { muted: !stem.muted })} className={`h-7 w-7 text-[10px] ${stem.muted ? "bg-rose-500/20 text-rose-200" : "text-muted-foreground"}`} aria-label={`${stem.muted ? "Unmute" : "Mute"} ${stem.name}`} data-testid={`button-mute-${stem.id}`}>M</Button>
                {index > 0 && <Button type="button" size="icon" variant="ghost" onClick={() => removeStem(stem.id)} className="h-7 w-7 text-muted-foreground hover:text-rose-300" aria-label={`Delete ${stem.name}`} data-testid={`button-delete-${stem.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StemSlider label="Level" value={stem.level} min={0} max={1} step={0.01} display={`${Math.round(stem.level * 100)}%`} onChange={(value) => updateStem(stem.id, { level: value })} />
              <StemSlider label="Pan" value={stem.pan} min={-1} max={1} step={0.01} display={stem.pan === 0 ? "Center" : stem.pan < 0 ? `${Math.round(Math.abs(stem.pan) * 100)}% L` : `${Math.round(stem.pan * 100)}% R`} onChange={(value) => updateStem(stem.id, { pan: value })} />
              <StemSlider label="Low shelf · 100 Hz" value={stem.lowGain} min={-12} max={12} step={0.5} display={`${stem.lowGain > 0 ? "+" : ""}${stem.lowGain.toFixed(1)} dB`} onChange={(value) => updateStem(stem.id, { lowGain: value })} />
              <StemSlider label="Mid bell · 2.5 kHz" value={stem.midGain} min={-12} max={12} step={0.5} display={`${stem.midGain > 0 ? "+" : ""}${stem.midGain.toFixed(1)} dB`} onChange={(value) => updateStem(stem.id, { midGain: value })} />
              <StemSlider label="High shelf · 8 kHz" value={stem.highGain} min={-12} max={12} step={0.5} display={`${stem.highGain > 0 ? "+" : ""}${stem.highGain.toFixed(1)} dB`} onChange={(value) => updateStem(stem.id, { highGain: value })} />
            </div>
          </div>
        ))}
      </div>

      <Button type="button" size="sm" variant="outline" onClick={duplicateStem} disabled={stems.length >= MAX_STEMS || loading} className="border-emerald-500/30" data-testid="button-duplicate-stem">
        <Copy className="mr-1.5 h-3.5 w-3.5" />
        {stems.length >= MAX_STEMS ? "Maximum 3 stems" : "Duplicate stem"}
      </Button>
    </section>
  );
}

function StemSlider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-emerald-200">{display}</span>
      </span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(next[0] ?? value)}
        className="w-full"
        style={{ touchAction: "pan-y" }}
        aria-label={label}
      />
    </label>
  );
}