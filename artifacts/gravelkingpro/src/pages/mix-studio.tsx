import { useCallback, useId, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { EmailGate, useEmailGate } from "@/components/email-gate";
import { ToolHelp } from "@/components/tool-help";
import { useAppState } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

import { Upload, Download, Music, ZoomIn, ZoomOut, Mic, Disc3 } from "lucide-react";
import { useDAW } from "@/lib/daw/useDAW";
import { Transport } from "@/components/daw/Transport";
import { ChannelStrip } from "@/components/daw/ChannelStrip";
import { MasterBus } from "@/components/daw/MasterBus";
import { TimelineRuler } from "@/components/daw/TimelineRuler";
import { ProjectManager } from "@/components/daw/ProjectManager";
import { RecordControls } from "@/components/daw/RecordControls";
import { StudioTabs, type StudioTab } from "@/components/daw/StudioTabs";
import { DrumPad } from "@/components/daw/DrumPad";

const AUDIO_EXTS = new Set(["wav", "mp3", "m4a", "aac", "flac", "ogg", "oga", "weba", "aiff", "au", "snd", "wma"]);

function isAudioLike(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return file.type.startsWith("audio/") || file.type.startsWith("video/") || AUDIO_EXTS.has(ext);
}

const DEV_BYPASS_KEY = "gk:dev:studio";

export default function MixStudio() {
  const { isPro } = useAppState();
  const [devBypass, setDevBypass] = useState(() => {
    try { return localStorage.getItem(DEV_BYPASS_KEY) === "1"; } catch { return false; }
  });
  const canUseStudio = isPro || devBypass;
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropId = useId();
  const daw = useDAW();

  const [activeTab, setActiveTab] = useState<StudioTab>("mixer");
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

  const addFiles = useCallback(async (incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const files = Array.from(incoming).filter(f => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "mid" || ext === "midi") {
        toast({ title: "MIDI not supported", description: "Convert to WAV or MP3 first.", variant: "destructive" });
        return false;
      }
      if (!isAudioLike(f)) {
        toast({ title: "Not an audio file", description: f.name, variant: "destructive" });
        return false;
      }
      return true;
    });
    const available = 8 - daw.tracks.length;
    for (const f of files.slice(0, available)) {
      await daw.addTrack(f);
    }
  }, [daw, toast]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    // iOS Safari sends files via DataTransferItemList, not dataTransfer.files
    const items = Array.from(e.dataTransfer.items);
    if (items.length > 0 && items[0].kind === "file") {
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      await addFiles(files);
    } else {
      await addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const emailGate = useEmailGate();
  if (emailGate.gated) return (
    <Layout>
      <EmailGate tool="studio" onUnlocked={emailGate.unlock} />
    </Layout>
  );

  if (!canUseStudio) return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-6 py-16">
        <div className="text-center space-y-4">
          <div className="text-5xl">🎛️</div>
          <h1 className="text-2xl font-bold">GravelKing Studio</h1>
          <p className="text-muted-foreground text-sm">The full DAW — multi-track recording, stems, plugins, and mixing — is available on GravelKing Pro.</p>
          <a href="/pricing" className="inline-block mt-2">
            <button className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl text-sm transition-colors">Upgrade to Pro</button>
          </a>
        </div>
        <button
          onClick={() => { localStorage.setItem(DEV_BYPASS_KEY, "1"); setDevBypass(true); }}
          className="block mx-auto text-[10px] text-muted-foreground underline opacity-50 hover:opacity-100"
        >
          Dev bypass
        </button>
      </div>
    </Layout>
  );

  return (
    <Layout noPadding>
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 pb-[72px] sm:pb-[84px]">

        {/* Top header bar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/20 shrink-0 bg-black/30 gap-2 z-30">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <h1 className="text-base font-bold tracking-tight">Mix Studio</h1>
            <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] shrink-0">Studio</Badge>
            <ToolHelp
              title="Mix Studio"
              summary="A full in-browser DAW — record and import multiple tracks, add plugins, and mix them into a final stereo track."
              steps={[
                "Add tracks by importing files or recording live.",
                "Set volume and pan, and add plugins per track.",
                "Mix down and export the finished stereo file.",
              ]}
              note="Everything runs in your browser — save your project to pick it back up later."
            />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ProjectManager
              hasUnsavedTracks={daw.tracks.length > 0}
              onSave={daw.getProjectSnapshot}
              onLoad={daw.restoreProject}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 border border-amber-500/25 rounded px-2 py-1 hover:border-amber-400/40 transition-colors"
            >
              <Upload className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Add</span>
            </button>
            <Button
              onClick={daw.exportMix}
              disabled={daw.tracks.length === 0}
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1 h-7 text-xs px-2 sm:px-3"
            >
              <Download className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>

        {/*
          iOS Safari requires:
          1. Explicit extensions (not audio/* wildcard)
          2. The input must NOT be display:none (hidden class) —
             it must be visually hidden but still in the DOM so
             .click() works from a user gesture.
        */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3,.m4a,.aac,.flac,.ogg,.oga,.weba,.aiff,.au,.snd,.wma"
          multiple
          style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
          onChange={e => {
            addFiles(e.target.files);
            if (e.target) e.target.value = "";
          }}
        />

        {/* ── Tab: Mixer ── */}
        {activeTab === "mixer" && (
          <>
            {/* Timeline ruler */}
            {daw.tracks.length > 0 && (
              <div className="flex items-stretch shrink-0">
                <div className="w-[88px] shrink-0 flex items-center justify-center gap-0.5 bg-black/40 border-b border-r border-border/20">
                  <button onClick={handleZoomOut} disabled={waveZoom <= 1} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-white disabled:opacity-30">
                    <ZoomOut className="w-3 h-3" />
                  </button>
                  <span className="text-[9px] font-mono text-muted-foreground w-6 text-center">{waveZoom}x</span>
                  <button onClick={handleZoomIn} disabled={waveZoom >= 16} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-white disabled:opacity-30">
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

            {/* Track list */}
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
                    <p className="text-sm text-muted-foreground">Tap or drop up to 8 audio files to start mixing</p>
                  </div>
                  <Button onClick={() => fileInputRef.current?.click()} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2">
                    <Upload className="w-4 h-4" /> Add Tracks
                  </Button>
                </div>
              ) : (
                <>
                  {daw.tracks.map(track => {
                    const snapEdges = daw.tracks
                      .filter(t => t.id !== track.id && t.duration > 0)
                      .map(t => ({ start: t.startOffset, end: t.startOffset + t.duration }));
                    return (
                      <ChannelStrip
                        key={track.id}
                        track={track}
                        position={daw.position}
                        bpm={daw.bpm}
                        totalDuration={daw.maxDuration}
                        isPlaying={daw.isPlaying}
                        zoom={waveZoom}
                        scrollOffset={waveScroll}
                        snapEdges={snapEdges}
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
                    );
                  })}
                  {daw.tracks.length < 8 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-border/20 text-muted-foreground hover:text-white hover:border-amber-500/30 transition-colors text-sm"
                    >
                      <Upload className="w-4 h-4" /> Tap or drop to add another track
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
          </>
        )}

        {/* ── Tab: Drum Pads ── */}
        {activeTab === "drums" && (
          <DrumPad
            onAddTrack={daw.addTrack}
            trackCount={daw.tracks.length}
          />
        )}

        {/* ── Tab: Recorder ── */}
        {activeTab === "recorder" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
            <div className="w-24 h-24 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <Mic className="w-10 h-10 text-red-400" />
            </div>
            <div className="text-center max-w-sm">
              <h2 className="text-xl font-bold mb-1">Voice Recorder</h2>
              <p className="text-sm text-muted-foreground">Record live vocals or instruments as a new track</p>
            </div>
            <RecordControls
              isRecording={daw.isRecording}
              disabled={!daw.isRecording && daw.tracks.length >= 8}
              listInputDevices={daw.listInputDevices}
              onStart={daw.startRecording}
              onStop={daw.stopRecording}
            />
            <div className="text-[10px] text-muted-foreground">
              Tracks: {daw.tracks.length}/8
            </div>
          </div>
        )}

        {/* ── Tab: Plugins ── */}
        {activeTab === "plugins" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/10">
              <h2 className="text-lg font-bold">Master Plugins</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
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
          </div>
        )}

      </div>

      {/* Bottom tab bar */}
      <StudioTabs
        active={activeTab}
        onChange={setActiveTab}
        trackCount={daw.tracks.length}
        canAddTrack={daw.tracks.length < 8}
      />

      {/* Bottom Transport — fixed */}
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
        onSkipBack={() => daw.skipBack(5)}
        onSkipForward={() => daw.skipForward(5)}
        barPosition="bottom"
      />
    </Layout>
  );
}
