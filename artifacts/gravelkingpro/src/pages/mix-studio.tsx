import { useState, useRef, useCallback, useId } from "react";
import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Music,
  Upload,
  X,
  ChevronUp,
  ChevronDown,
  Layers,
  ListMusic,
  Loader2,
  Download,
  Lock,
} from "lucide-react";

type TrackEntry = { id: string; file: File };

type Arrangement = "sequential" | "layer";
type NoiseReduce = "off" | "light" | "heavy";
type VoicePreset = "normal" | "robot" | "chipmunk" | "deep" | "alien";

const VOICE_PRESETS: {
  id: VoicePreset;
  label: string;
  description: string;
}[] = [
  { id: "normal",   label: "Normal",   description: "No change" },
  { id: "robot",    label: "Robot",    description: "Metallic wobble" },
  { id: "chipmunk", label: "Chipmunk", description: "High pitch" },
  { id: "deep",     label: "Deep",     description: "Low resonance" },
  { id: "alien",    label: "Alien",    description: "Echo + vibrato" },
];

function semitoneLabel(s: number): string {
  if (s === 0)   return "Original key";
  if (s === 12)  return "+1 octave";
  if (s === -12) return "-1 octave";
  return s > 0 ? `+${s} semitone${s !== 1 ? "s" : ""}` : `${s} semitone${s !== -1 ? "s" : ""}`;
}

function speedLabel(s: number): string {
  if (s === 1.0) return "Original speed";
  if (s < 1.0)  return `${s.toFixed(2)}× slower`;
  return `${s.toFixed(2)}× faster`;
}

export default function MixStudio() {
  const { isPro } = useAppState();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropId = useId();

  const [tracks, setTracks]             = useState<TrackEntry[]>([]);
  const [arrangement, setArrangement]   = useState<Arrangement>("sequential");
  const [speed, setSpeed]               = useState(1.0);
  const [semitones, setSemitones]       = useState(0);
  const [noiseReduce, setNoiseReduce]   = useState<NoiseReduce>("off");
  const [voicePreset, setVoicePreset]   = useState<VoicePreset>("normal");
  const [processing, setProcessing]     = useState(false);
  const [outputUrl, setOutputUrl]       = useState<string | null>(null);
  const [dragging, setDragging]         = useState(false);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const allowed = Array.from(incoming).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "mid" || ext === "midi") {
        toast({ title: "MIDI not supported", description: "Convert to WAV or MP3 first.", variant: "destructive" });
        return false;
      }
      return true;
    });
    setTracks((prev) => {
      const combined = [...prev, ...allowed.map((f) => ({ id: crypto.randomUUID(), file: f }))];
      return combined.slice(0, 8);
    });
  }, [toast]);

  const removeTrack = (id: string) =>
    setTracks((prev) => prev.filter((t) => t.id !== id));

  const moveTrack = (idx: number, dir: -1 | 1) =>
    setTracks((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const process = async () => {
    if (!tracks.length) {
      toast({ title: "No tracks", description: "Add at least one audio file.", variant: "destructive" });
      return;
    }
    setProcessing(true);
    setOutputUrl(null);

    const form = new FormData();
    for (const t of tracks) form.append("tracks", t.file);
    form.append("arrangement", arrangement);
    form.append("speed", String(speed));
    form.append("semitones", String(semitones));
    form.append("noiseReduce", noiseReduce);
    form.append("voicePreset", voicePreset);

    try {
      const res = await fetch("/api/kernel/studio-mix", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Processing failed." }));
        throw new Error(err.error ?? "Processing failed.");
      }
      const blob = await res.blob();
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      setOutputUrl(URL.createObjectURL(blob));
      toast({ title: "Mix complete", description: "Your mix is ready to download." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  if (!isPro) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto text-center space-y-6 py-20">
          <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-amber-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2">Mix Studio</h1>
            <p className="text-muted-foreground text-lg">
              Multi-track editing, pitch &amp; speed control, noise reduction, and voice changing require a Pro or higher plan.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">
              <Link href="/pricing">Upgrade to Pro</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/studio">Try Basic Studio</Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              Mix Studio
              <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs">Pro</Badge>
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Combine, edit, and transform up to 8 audio tracks
            </p>
          </div>
        </div>

        {/* Track list */}
        <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Tracks</h2>
            <span className="text-xs text-muted-foreground">{tracks.length}/8</span>
          </div>

          {/* Drop zone */}
          <div
            id={dropId}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg px-6 py-8 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
              dragging
                ? "border-amber-500 bg-amber-500/5"
                : "border-border/40 hover:border-amber-500/50 hover:bg-amber-500/5"
            }`}
          >
            <Upload className="w-6 h-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drop audio files here, or <span className="text-amber-500 underline">browse</span>
            </p>
            <p className="text-xs text-muted-foreground/60">WAV, MP3, AAC, FLAC, OGG — up to 8 files, 200 MB each</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />

          {/* Track entries */}
          {tracks.length > 0 && (
            <div className="space-y-2 pt-1">
              {tracks.map((track, idx) => (
                <div
                  key={track.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-secondary/30 border border-border/30"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveTrack(idx, -1)}
                      disabled={idx === 0}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => moveTrack(idx, 1)}
                      disabled={idx === tracks.length - 1}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground/50 w-5 text-center">{idx + 1}</span>
                  <Music className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="flex-1 text-sm font-medium truncate">{track.file.name}</p>
                  <span className="text-xs text-muted-foreground/60 shrink-0">
                    {(track.file.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button
                    onClick={() => removeTrack(track.id)}
                    className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Arrangement */}
        <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Arrangement</h2>
          <div className="flex gap-3">
            <button
              onClick={() => setArrangement("sequential")}
              className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                arrangement === "sequential"
                  ? "border-amber-500 bg-amber-500/10 text-foreground"
                  : "border-border/40 bg-secondary/20 text-muted-foreground hover:border-amber-500/50"
              }`}
            >
              <ListMusic className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <p className="text-sm font-medium">Sequential</p>
                <p className="text-xs opacity-60">Play tracks one after another</p>
              </div>
            </button>
            <button
              onClick={() => setArrangement("layer")}
              className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
                arrangement === "layer"
                  ? "border-amber-500 bg-amber-500/10 text-foreground"
                  : "border-border/40 bg-secondary/20 text-muted-foreground hover:border-amber-500/50"
              }`}
            >
              <Layers className="w-5 h-5 shrink-0" />
              <div className="text-left">
                <p className="text-sm font-medium">Layer</p>
                <p className="text-xs opacity-60">Mix all tracks simultaneously</p>
              </div>
            </button>
          </div>
        </div>

        {/* Controls grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Speed */}
          <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Speed</h2>
              <Badge variant="outline" className="text-xs font-mono">{speedLabel(speed)}</Badge>
            </div>
            <Slider
              min={25}
              max={400}
              step={5}
              value={[Math.round(speed * 100)]}
              onValueChange={([v]) => setSpeed(v / 100)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground/50">
              <span>0.25×</span>
              <span>1.0×</span>
              <span>4.0×</span>
            </div>
          </div>

          {/* Key / Pitch */}
          <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Key</h2>
              <Badge variant="outline" className="text-xs font-mono">{semitoneLabel(semitones)}</Badge>
            </div>
            <Slider
              min={-12}
              max={12}
              step={1}
              value={[semitones]}
              onValueChange={([v]) => setSemitones(v)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground/50">
              <span>-1 oct</span>
              <span>Original</span>
              <span>+1 oct</span>
            </div>
          </div>

          {/* Noise Reduction */}
          <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Noise Reduction</h2>
            <div className="flex gap-2">
              {(["off", "light", "heavy"] as NoiseReduce[]).map((level) => (
                <button
                  key={level}
                  onClick={() => setNoiseReduce(level)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors border ${
                    noiseReduce === level
                      ? "border-amber-500 bg-amber-500/10 text-foreground"
                      : "border-border/40 bg-secondary/20 text-muted-foreground hover:border-amber-500/50"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/60">
              {noiseReduce === "off"   && "Background noise is preserved."}
              {noiseReduce === "light" && "FFT denoising — removes hiss and hum."}
              {noiseReduce === "heavy" && "FFT + non-local means — aggressive cleanup."}
            </p>
          </div>

          {/* Voice Preset */}
          <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Voice Preset</h2>
            <div className="grid grid-cols-5 gap-1.5">
              {VOICE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setVoicePreset(p.id)}
                  title={p.description}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors border ${
                    voicePreset === p.id
                      ? "border-amber-500 bg-amber-500/10 text-foreground"
                      : "border-border/40 bg-secondary/20 text-muted-foreground hover:border-amber-500/50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground/60">
              {VOICE_PRESETS.find((p) => p.id === voicePreset)?.description}.
              {voicePreset !== "normal" && " Applies a pitch offset on top of your Key setting."}
            </p>
          </div>
        </div>

        {/* Process */}
        <Button
          onClick={process}
          disabled={processing || tracks.length === 0}
          size="lg"
          className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold text-base h-12"
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Processing mix…
            </>
          ) : (
            "Process Mix"
          )}
        </Button>

        {/* Output */}
        {outputUrl && (
          <div className="rounded-xl border border-border/40 bg-card/40 p-5 space-y-4">
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Output</h2>
            <audio controls src={outputUrl} className="w-full" />
            <Button asChild variant="outline" className="w-full gap-2">
              <a href={outputUrl} download="gravelking_mix.wav">
                <Download className="w-4 h-4" />
                Download WAV
              </a>
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
