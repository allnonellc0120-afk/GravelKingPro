import { useCallback, useId, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

import { Upload, Download, Music, ZoomIn, ZoomOut } from "lucide-react";
import { useDAW } from "@/lib/daw/useDAW";
import { Transport } from "@/components/daw/Transport";
import { ChannelStrip } from "@/components/daw/ChannelStrip";
import { MasterBus } from "@/components/daw/MasterBus";
import { TimelineRuler } from "@/components/daw/TimelineRuler";
import { ProjectManager } from "@/components/daw/ProjectManager";
import { RecordControls } from "@/components/daw/RecordControls";

export default function MixStudio() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropId = useId();
  const daw = useDAW();

  const [waveZoom, setWaveZoom] = useState(1);
  const [waveScroll, setWaveScroll] = useState(0);

  const handleZoomIn = useCallback(() => {
    setWaveZoom(z => {
      const next = Math.min(16, z * 2);
      setWaveScroll(o => {
        const viewFrac = 1 / next;
        const maxStart = 1 - viewFrac;
        const center = o + (1 / z) / 2;
        return Math.max(0, Math.min(maxStart, center - viewFrac / 2));
      });
      return next;
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setWaveZoom(z => {
      const next = Math.max(1, z / 2);
      if (next === 1) setWaveScroll(0);
      return next;
    });
  }, []);

  const handleScroll = useCallback((offset: number) => {
    setWaveZoom(z => {
      const viewFrac = 1 / z;
      const maxStart = 1 - viewFrac;
      setWaveScroll(Math.max(0, Math.min(maxStart, offset)));
      return z;
    });
  }, []);

  const addFiles = useCallback(async (incoming: FileList | null) => {
    if (!incoming) return;
    const files = Array.from(incoming).filter(f => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "mid" || ext === "midi") {
        toast({ title: "MIDI not supported", description: "Convert to WAV or MP3 first.", variant: "destructive" });
        return false;
      }
      if (!f.type.startsWith("audio/") && !f.type.startsWith("video/")) {
        toast({ title: "Not an audio/video file", description: f.name, variant: "destructive" });
        return false;
      }
      return true;
    });
    const available = 8 - daw.tracks.length;
    for (const f of files.slice(0, available)) {
      await daw.addTrack(f);
    }
  }, [daw, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  if (!isPro) return <ProGate />;

  return (
    <Layout noPadding>
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">

        {/* Transport bar */}
        <Transport
          isPlaying={daw.isPlaying}
          position={daw.position}
          duration={daw.maxDuration}
          masterVolume={daw.masterVolume}
          loop={daw.loop}
          bpm={daw.bpm}
          onPlay={daw.play}
          onPause={daw.pause}
          onStop={daw.stop}
          onSeek={(pct) => daw.seek(pct * daw.maxDuration)}
          onVolumeChange={daw.setMasterVolume}
          onLoopToggle={() => daw.setLoop(!daw.loop)}
          onBpmChange={daw.setBpm}
          trackCount={daw.tracks.length}
        />

        {/* Page header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20 shrink-0 bg-black/30">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold tracking-tight">Mix Studio</h1>
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">Studio</Badge>
            <span className="text-[11px] text-muted-foreground hidden sm:block">
              {daw.tracks.length}/8 tracks
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ProjectManager
              hasUnsavedTracks={daw.tracks.length > 0}
              onSave={daw.getProjectSnapshot}
              onLoad={daw.restoreProject}
            />
            <RecordControls
              isRecording={daw.isRecording}
              disabled={!daw.isRecording && daw.tracks.length >= 8}
              listInputDevices={daw.listInputDevices}
              onStart={daw.startRecording}
              onStop={daw.stopRecording}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 border border-amber-500/25 rounded px-2.5 py-1 hover:border-amber-400/40 transition-colors"
            >
              <Upload className="w-3 h-3" /> Add Tracks
            </button>
            <Button
              onClick={daw.exportMix}
              disabled={daw.tracks.length === 0}
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1.5 h-7 text-xs"
            >
              <Download className="w-3 h-3" /> Export WAV
            </Button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*"
          multiple
          className="hidden"
          onChange={e => addFiles(e.target.files)}
        />

        {/* Timeline ruler + global zoom controls */}
        {daw.tracks.length > 0 && (
          <div className="flex items-stretch shrink-0">
            {/* Zoom controls pinned to the left — same width as the track left panel */}
            <div className="w-[88px] shrink-0 flex items-center justify-center gap-0.5 bg-black/40 border-b border-r border-border/20">
              <button
                onClick={handleZoomOut}
                disabled={waveZoom <= 1}
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-white disabled:opacity-30 transition-colors"
                title="Zoom out (all tracks)"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="text-[9px] font-mono text-muted-foreground w-6 text-center">{waveZoom}x</span>
              <button
                onClick={handleZoomIn}
                disabled={waveZoom >= 16}
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-white disabled:opacity-30 transition-colors"
                title="Zoom in (all tracks)"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
            </div>
            <TimelineRuler
              duration={daw.maxDuration}
              position={daw.position}
              bpm={daw.bpm}
              zoom={waveZoom}
              scrollOffset={waveScroll}
            />
          </div>
        )}

        {/* Track list — scrollable */}
        <div
          id={dropId}
          className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-2"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
        >
          {daw.tracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Music className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold mb-1">No tracks yet</h2>
                <p className="text-sm text-muted-foreground">Drop up to 8 audio files to start mixing</p>
              </div>
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2"
              >
                <Upload className="w-4 h-4" /> Add Tracks
              </Button>
            </div>
          ) : (
            <>
              {daw.tracks.map(track => (
                <ChannelStrip
                  key={track.id}
                  track={track}
                  position={daw.position}
                  bpm={daw.bpm}
                  totalDuration={daw.maxDuration}
                  isPlaying={daw.isPlaying}
                  zoom={waveZoom}
                  scrollOffset={waveScroll}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onScroll={handleScroll}
                  getTrackAnalyser={daw.getTrackAnalyser}
                  onSeek={daw.seek}
                  onRemove={daw.removeTrack}
                  onVolumeChange={daw.setTrackVolume}
                  onPanChange={daw.setTrackPan}
                  onToggleMute={daw.toggleMute}
                  onToggleSolo={daw.toggleSolo}
                  onAddPlugin={daw.addPlugin}
                  onRemovePlugin={daw.removePlugin}
                  onTogglePlugin={daw.togglePlugin}
                  onUpdatePlugin={daw.updatePlugin}
                  onReorderPlugin={daw.reorderPlugin}
                  onSetRegion={daw.setRegion}
                  onApplyTrim={daw.applyTrim}
                  onApplyDelete={daw.applyDelete}
                  onResetEdit={daw.resetEdit}
                  onSetStartOffset={daw.setTrackStartOffset}
                />
              ))}
              {daw.tracks.length < 8 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-border/20 text-muted-foreground hover:text-white hover:border-amber-500/30 transition-colors text-sm"
                >
                  <Upload className="w-4 h-4" /> Drop or click to add another track
                </button>
              )}
            </>
          )}
        </div>

        {/* Master bus */}
        <MasterBus
          plugins={daw.masterPlugins}
          analyserRef={daw.masterAnalRef}
          isPlaying={daw.isPlaying}
          onUpdatePlugin={daw.updateMasterPlugin}
          onTogglePlugin={id => {
            daw.setMasterPlugins(prev =>
              prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p)
            );
          }}
        />
      </div>
    </Layout>
  );
}
