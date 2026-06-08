import { useState, useRef } from "react";
import { ChevronDown, ChevronUp, RotateCcw, Scissors, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { TrackState, PluginType, PluginDef, Region } from "@/lib/daw/types";
import { Waveform } from "./Waveform";
import { PluginRack } from "./PluginRack";

interface ChannelStripProps {
  track: TrackState;
  position: number;
  bpm?: number;
  onSeek: (secs: number) => void;
  onRemove: (id: string) => void;
  onVolumeChange: (id: string, v: number) => void;
  onPanChange: (id: string, pan: number) => void;
  onToggleMute: (id: string) => void;
  onToggleSolo: (id: string) => void;
  onAddPlugin: (trackId: string, type: PluginType) => void;
  onRemovePlugin: (trackId: string, pluginId: string) => void;
  onTogglePlugin: (trackId: string, pluginId: string) => void;
  onUpdatePlugin: (trackId: string, pluginId: string, key: string, value: number) => void;
  onReorderPlugin: (trackId: string, from: number, to: number) => void;
  onSetRegion: (trackId: string, region: Region | null) => void;
  onApplyTrim: (trackId: string) => void;
  onApplyDelete: (trackId: string) => void;
  onResetEdit: (trackId: string) => void;
  onSetStartOffset: (trackId: string, secs: number) => void;
}

export function ChannelStrip({
  track, position, bpm, onSeek, onRemove,
  onVolumeChange, onPanChange, onToggleMute, onToggleSolo,
  onAddPlugin, onRemovePlugin, onTogglePlugin, onUpdatePlugin, onReorderPlugin,
  onSetRegion, onApplyTrim, onApplyDelete, onResetEdit, onSetStartOffset,
}: ChannelStripProps) {
  const [showPlugins, setShowPlugins] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const offsetDragRef = useRef<{ startX: number; startOffset: number } | null>(null);

  const fmtOffset = (secs: number) => {
    if (bpm && bpm > 0) {
      const totalBeats = (secs * bpm) / 60;
      const bar  = Math.floor(totalBeats / 4) + 1;
      const beat = Math.floor(totalBeats % 4) + 1;
      return `${bar}:${beat}`;
    }
    return `${secs.toFixed(2)}s`;
  };

  const snapToBeat = (secs: number) => {
    if (!bpm || bpm <= 0) return secs;
    const beatDur = 60 / bpm;
    return Math.round(secs / beatDur) * beatDur;
  };

  const handleOffsetMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    offsetDragRef.current = { startX: e.clientX, startOffset: track.startOffset };
    const SCALE = 0.03;
    const onMove = (me: MouseEvent) => {
      if (!offsetDragRef.current) return;
      const dx = me.clientX - offsetDragRef.current.startX;
      let next = Math.max(0, offsetDragRef.current.startOffset + dx * SCALE);
      if (me.shiftKey) next = snapToBeat(next);
      onSetStartOffset(track.id, next);
    };
    const onUp = () => {
      offsetDragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const handleZoomIn = () => {
    setZoom(z => {
      const next = Math.min(16, z * 2);
      setScrollOffset(o => {
        const viewFrac = 1 / next;
        const maxStart = 1 - viewFrac;
        const center = o + (1 / z) / 2;
        return Math.max(0, Math.min(maxStart, center - viewFrac / 2));
      });
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoom(z => {
      const next = Math.max(1, z / 2);
      if (next === 1) setScrollOffset(0);
      return next;
    });
  };

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: `${track.color}25` }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: `${track.color}0d` }}>
        {/* Color indicator */}
        <div className="w-1 h-6 rounded-full shrink-0" style={{ background: track.color }} />

        {/* Name */}
        <span className="text-sm font-semibold text-white/90 flex-1 truncate min-w-0">{track.name}</span>

        {/* Mute */}
        <button
          onClick={() => onToggleMute(track.id)}
          title={track.muted ? "Unmute" : "Mute"}
          className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors border ${
            track.muted
              ? "bg-red-500/20 border-red-500/40 text-red-400"
              : "border-border/30 text-muted-foreground hover:text-white"
          }`}
        >
          M
        </button>

        {/* Solo */}
        <button
          onClick={() => onToggleSolo(track.id)}
          title={track.solo ? "Unsolo" : "Solo"}
          className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors border ${
            track.solo
              ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
              : "border-border/30 text-muted-foreground hover:text-white"
          }`}
        >
          S
        </button>

        {/* Remove */}
        <button
          onClick={() => onRemove(track.id)}
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Body: volume + waveform */}
      <div className="flex gap-0 bg-black/20">
        {/* Left: fader + pan */}
        <div className="flex flex-col items-center gap-2 px-2 py-3 border-r border-border/10 w-14 shrink-0">
          {/* Volume fader (vertical) */}
          <div className="flex-1 flex items-center justify-center w-full">
            <div className="h-24 flex items-center">
              <Slider
                orientation="vertical"
                value={[Math.round(track.volume * 100)]}
                onValueChange={([v]) => onVolumeChange(track.id, v / 100)}
                min={0} max={100} step={1}
                className="h-full"
              />
            </div>
          </div>
          <span className="text-[9px] font-mono text-muted-foreground">
            {Math.round(track.volume * 100)}
          </span>

          {/* Pan */}
          <div className="w-full space-y-0.5">
            <Slider
              value={[Math.round(track.pan * 100)]}
              onValueChange={([v]) => onPanChange(track.id, v / 100)}
              min={-100} max={100} step={1}
              className="w-full"
            />
            <div className="text-[9px] font-mono text-center text-muted-foreground">
              {track.pan === 0 ? "C" : track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(-track.pan * 100)}`}
            </div>
          </div>
        </div>

        {/* Right: waveform + region context menu */}
        <div className="flex-1 min-w-0 px-2 py-3 space-y-1">

          {/* Clip start offset — drag handle or nudge buttons */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px] text-muted-foreground shrink-0">Start</span>
            <span
              className="text-[10px] font-mono text-white/70 px-1.5 py-0.5 rounded bg-white/5 border border-border/15 cursor-ew-resize hover:border-amber-500/30 transition-colors select-none"
              title="Drag to reposition clip · Shift+drag: snap to beat"
              onMouseDown={handleOffsetMouseDown}
            >
              {fmtOffset(track.startOffset)}
            </span>
            <div className="flex items-center gap-0.5 ml-auto">
              <button
                onClick={e => {
                  const beatDur = bpm ? 60 / bpm : 0.25;
                  let next = Math.max(0, track.startOffset - beatDur);
                  if (e.shiftKey) next = snapToBeat(next);
                  onSetStartOffset(track.id, next);
                }}
                title="Move clip earlier · Shift: snap to beat"
                className="w-5 h-5 flex items-center justify-center text-[10px] text-muted-foreground hover:text-white transition-colors"
              >◀</button>
              <button
                onClick={e => {
                  const beatDur = bpm ? 60 / bpm : 0.25;
                  let next = track.startOffset + beatDur;
                  if (e.shiftKey) next = snapToBeat(next);
                  onSetStartOffset(track.id, next);
                }}
                title="Move clip later · Shift: snap to beat"
                className="w-5 h-5 flex items-center justify-center text-[10px] text-muted-foreground hover:text-white transition-colors"
              >▶</button>
              {track.startOffset > 0.001 && (
                <button
                  onClick={() => onSetStartOffset(track.id, 0)}
                  title="Reset clip to start"
                  className="w-5 h-5 flex items-center justify-center text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
                >×</button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground font-mono">
              {track.duration > 0 ? `${track.duration.toFixed(1)}s` : "—"}
            </span>
            <div className="flex items-center gap-1">
              {track.edited && (
                <button
                  onClick={() => onResetEdit(track.id)}
                  className="text-[10px] text-amber-400/70 hover:text-amber-400 flex items-center gap-1 mr-1"
                  title="Reset to original"
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Reset
                </button>
              )}
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-white disabled:opacity-30 transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="text-[9px] font-mono text-muted-foreground w-6 text-center">{zoom}x</span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 16}
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-white disabled:opacity-30 transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
          </div>

          <Waveform
            peaks={track.peaks}
            duration={track.duration}
            position={Math.max(0, Math.min(track.duration, position - track.startOffset))}
            region={track.region}
            color={track.color}
            height={68}
            zoom={zoom}
            scrollOffset={scrollOffset}
            bpm={bpm}
            onSeek={onSeek}
            onRegionChange={r => onSetRegion(track.id, r)}
          />

          {/* Region action bar */}
          {track.region && (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] text-amber-400/80 flex-1">
                {track.region.start.toFixed(2)}s → {track.region.end.toFixed(2)}s
              </span>
              <button
                onClick={() => onApplyTrim(track.id)}
                className="text-[10px] px-2 py-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 flex items-center gap-1"
              >
                <Scissors className="w-2.5 h-2.5" /> Trim
              </button>
              <button
                onClick={() => onApplyDelete(track.id)}
                className="text-[10px] px-2 py-1 rounded bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 flex items-center gap-1"
              >
                <Trash2 className="w-2.5 h-2.5" /> Delete
              </button>
              <button
                onClick={() => onSetRegion(track.id, null)}
                className="text-[10px] px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-white"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Plugin rack toggle */}
      <button
        onClick={() => setShowPlugins(v => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] text-muted-foreground hover:text-white bg-black/30 border-t border-border/10 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span className="font-semibold uppercase tracking-wide">Plugins</span>
          {track.plugins.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: `${track.color}30`, color: track.color }}>
              {track.plugins.length}
            </span>
          )}
        </span>
        {showPlugins ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Plugin rack body */}
      {showPlugins && (
        <div className="px-3 py-2 border-t border-border/10 bg-black/30">
          <PluginRack
            plugins={track.plugins}
            trackId={track.id}
            onAdd={onAddPlugin}
            onRemove={onRemovePlugin}
            onToggle={onTogglePlugin}
            onUpdate={onUpdatePlugin}
            onReorder={onReorderPlugin}
          />
        </div>
      )}
    </div>
  );
}
