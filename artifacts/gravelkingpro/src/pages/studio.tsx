import { useState, useRef, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Download, Upload, Music, BarChart2, Settings2, CheckCircle2,
  Lock, Play, Square, Shield, Scissors, Mic2, Layers, AlertCircle,
  ChevronRight, Wand2, Waves, Volume2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import { useAuth } from "@workspace/replit-auth-web";
import { Link } from "wouter";
import { getWaveformPoints } from "@/lib/audioKernel";

type ProcessState = "idle" | "loading" | "ready" | "processing" | "done";
type ProcessMode = "standard" | "voice_remove" | "stem_split" | "master" | "voice_change" | "denoise";

const MASTER_PRESETS_UI = [
  { id: "normal",    label: "Normal",    description: "Balanced loudness. Good for any content.", free: true },
  { id: "broadcast", label: "Broadcast", description: "EBU R128 broadcast standard for streaming.", free: false },
  { id: "vinyl",     label: "Vinyl",     description: "Warm analog character with boosted lows.", free: false },
  { id: "podcast",   label: "Podcast",   description: "Voice clarity with dynamic compression.", free: false },
  { id: "club",      label: "Club",      description: "Heavy bass and punchy transients.", free: false },
  { id: "film",      label: "Film",      description: "Wide cinematic dynamics with presence.", free: false },
] as const;
type MasterPresetId = (typeof MASTER_PRESETS_UI)[number]["id"];

const VOICE_PRESETS_UI = [
  { id: "normal",   label: "Normal",   description: "Light room ambience — subtle warmth.", emoji: "🎤" },
  { id: "robot",    label: "Robot",    description: "Rapid vibrato + metallic echo.", emoji: "🤖" },
  { id: "chipmunk", label: "Chipmunk", description: "Higher pitch and faster tempo.", emoji: "🐿️" },
  { id: "deep",     label: "Deep",     description: "Lower pitch, slower, heavier.", emoji: "🦁" },
  { id: "alien",    label: "Alien",    description: "Vibrato + reverb + pitch shift.", emoji: "👽" },
];
type VoicePresetId = "normal" | "robot" | "chipmunk" | "deep" | "alien";

const MODES: Array<{
  value: ProcessMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  requiresStudio: boolean;
}> = [
  {
    value: "master",
    label: "Mastering",
    description: "Apply a professional mastering preset — Normal is free, 5 more for paid plans",
    icon: <Wand2 className="w-4 h-4 text-sky-400" />,
    requiresStudio: false,
  },
  {
    value: "voice_remove",
    label: "Voice Removal",
    description: "Center-channel cancellation — extracts the instrumental track (stereo only)",
    icon: <Mic2 className="w-4 h-4 text-purple-400" />,
    requiresStudio: false,
  },
  {
    value: "stem_split",
    label: "Stem Splitting",
    description: "Splits into bass, midrange, highs (+ instrumental for stereo files)",
    icon: <Scissors className="w-4 h-4 text-emerald-400" />,
    requiresStudio: false,
  },
  {
    value: "voice_change",
    label: "Voice Changer",
    description: "Transform vocals with 5 effects: Robot, Chipmunk, Deep, Alien, Normal",
    icon: <Volume2 className="w-4 h-4 text-pink-400" />,
    requiresStudio: false,
  },
  {
    value: "denoise",
    label: "Denoise",
    description: "Remove background hiss, hum, and broadband noise using FFT analysis",
    icon: <Waves className="w-4 h-4 text-teal-400" />,
    requiresStudio: false,
  },
  {
    value: "standard",
    label: "GravelKing Kernel",
    description: "Full kernel signal carving — amplitude, parity, efficiency (Pro only)",
    icon: <Layers className="w-4 h-4 text-amber-500" />,
    requiresStudio: true,
  },
];

const STEM_LABELS: Record<string, { label: string; color: string; description: string }> = {
  "bass.wav":         { label: "Bass",        color: "text-orange-400",  description: "Sub-bass & bass (< 250 Hz)" },
  "midrange.wav":     { label: "Midrange",    color: "text-amber-400",   description: "Instruments & melody (250 Hz – 4 kHz)" },
  "highs.wav":        { label: "Highs",       color: "text-sky-400",     description: "Presence & air (> 4 kHz)" },
  "instrumental.wav": { label: "Instrumental",color: "text-purple-400",  description: "Vocals removed (stereo only)" },
};

export default function Studio() {
  const { isPro, hasSplits, usedFreeSplit, setUsedFreeSplit } = useAppState();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  const [state, setState] = useState<ProcessState>("idle");
  const [progress, setProgress] = useState(0);
  const [multiplier, setMultiplier] = useState([0.75]);
  const [sliceSize, setSliceSize] = useState("2");
  const [mode, setMode] = useState<ProcessMode>("master");
  const [masterPreset, setMasterPreset] = useState<MasterPresetId>("normal");
  const [voicePreset, setVoicePreset] = useState<VoicePresetId>("normal");
  const [tempo, setTempo] = useState([1.0]);
  const [semitones, setSemitones] = useState([0]);
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState(0);
  const [waveformBefore, setWaveformBefore] = useState<number[]>([]);
  const [waveformAfter, setWaveformAfter] = useState<number[]>([]);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [stemBlobs, setStemBlobs] = useState<Array<{ name: string; blob: Blob }>>([]);
  const [stats, setStats] = useState<{
    efficiency: string;
    decayRate: string;
    samples: string;
    parity: string;
    mode?: string;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedFileRef = useRef<File | null>(null);

  const getAudioContext = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("audio/")) {
      toast({ title: "Invalid file", description: "Please upload an audio file (MP3, WAV, etc.)", variant: "destructive" });
      return;
    }
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (processedUrl) URL.revokeObjectURL(processedUrl);
    loadedFileRef.current = file;
    setFileName(file.name);
    setOriginalUrl(URL.createObjectURL(file));
    setProcessedUrl(null);
    setState("loading");
    setProgress(20);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = getAudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setDuration(decoded.duration);
      const samples = decoded.getChannelData(0);
      setWaveformBefore(getWaveformPoints(samples, 120));
      setProgress(100);
      setState("ready");
    } catch {
      toast({ title: "Could not read file", description: "Try a WAV or MP3 file.", variant: "destructive" });
      setState("idle");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (processedUrl) URL.revokeObjectURL(processedUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleProcess = async () => {
    if (state !== "ready" || !loadedFileRef.current) return;

    if (mode === "standard" && !isPro) {
      toast({ title: "Pro required", description: "GravelKing Kernel processing requires a Pro subscription.", variant: "destructive" });
      return;
    }

    if (mode === "voice_remove" || mode === "stem_split") {
      if (!isAuthenticated) {
        toast({ title: "Sign in required", description: "Please sign in to use voice removal and stem splitting.", variant: "destructive" });
        return;
      }
      if (!hasSplits && usedFreeSplit) {
        toast({ title: "Free trial used", description: "Upgrade to GravelKing Splits for unlimited voice removal and stem splitting.", variant: "destructive" });
        return;
      }
    }

    setState("processing");
    setProgress(0);
    setProcessedBlob(null);
    if (processedUrl) { URL.revokeObjectURL(processedUrl); setProcessedUrl(null); }
    setStemBlobs([]);
    setWaveformAfter([]);
    setStats(null);

    let fakeProgress = 0;
    const progressInterval = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + 3, 88);
      setProgress(fakeProgress);
    }, 200);

    try {
      if (mode === "master") {
        const formData = new FormData();
        formData.append("audio", loadedFileRef.current);
        formData.append("preset", masterPreset);
        const response = await fetch("/api/kernel/master", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        clearInterval(progressInterval);
        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Mastering failed." }));
          throw new Error(err.error ?? "Mastering failed.");
        }
        setProgress(95);
        const wavBlob = await response.blob();
        const url = URL.createObjectURL(wavBlob);
        setProcessedBlob(wavBlob);
        setProcessedUrl(url);
        const ctx = getAudioContext();
        try {
          const ab = await wavBlob.arrayBuffer();
          const decodedOut = await ctx.decodeAudioData(ab);
          setWaveformAfter(getWaveformPoints(decodedOut.getChannelData(0), 120));
        } catch { /* waveform optional */ }
        setStats({ efficiency: "—", decayRate: "—", samples: "—", parity: "VALIDATED", mode: `${masterPreset} master` });
        setProgress(100);
        setState("done");
        return;
      }

      const formData = new FormData();
      formData.append("audio", loadedFileRef.current);
      formData.append("multiplier", String(multiplier[0]));
      formData.append("slice_size", sliceSize);
      formData.append("mode", mode);
      formData.append("tempo", String(tempo[0]));
      formData.append("semitones", String(semitones[0]));
      if (mode === "voice_change") formData.append("voice_preset", voicePreset);

      const response = await fetch("/api/kernel/process-audio", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Server error" }));
        throw new Error(err.error || "Processing failed");
      }

      setProgress(95);
      const contentType = response.headers.get("content-type") ?? "";

      // Stem split → ZIP
      if (mode === "stem_split" && contentType.includes("zip")) {
        const zipBlob = await response.blob();
        const { unzip } = await import("fflate");
        const arrayBuf = await zipBlob.arrayBuffer();

        await new Promise<void>((resolve, reject) => {
          unzip(new Uint8Array(arrayBuf), (err: Error | null, files: Record<string, Uint8Array>) => {
            if (err) { reject(err); return; }
            const blobs = Object.entries(files).map(([name, data]) => ({
              name,
              blob: new Blob([data as BlobPart], { type: "audio/wav" }),
            }));
            setStemBlobs(blobs);
            resolve();
          });
        });

        setProgress(100);
        setState("done");
        if (!hasSplits && !usedFreeSplit) setUsedFreeSplit(true);
        return;
      }

      // WAV response
      const wavBlob = await response.blob();
      const url = URL.createObjectURL(wavBlob);
      const parity = response.headers.get("X-GK-Parity") ?? "VALIDATED";
      const efficiency = response.headers.get("X-GK-Efficiency") ?? "0";
      const decayRate = response.headers.get("X-GK-Decay-Rate") ?? "0";
      const sampleCount = response.headers.get("X-GK-Sample-Count") ?? "0";

      setProcessedBlob(wavBlob);
      setProcessedUrl(url);

      const ctx = getAudioContext();
      const arrayBuf = await wavBlob.arrayBuffer();
      try {
        const decodedOut = await ctx.decodeAudioData(arrayBuf);
        setWaveformAfter(getWaveformPoints(decodedOut.getChannelData(0), 120));
      } catch { /* waveform optional */ }

      setStats({
        efficiency: mode === "standard" ? `${(parseFloat(efficiency) * 100).toFixed(1)}%` : "—",
        decayRate: mode === "standard" ? `${(parseFloat(decayRate) * 100).toFixed(1)}%` : "—",
        samples: mode === "standard" ? parseInt(sampleCount).toLocaleString() : "—",
        parity,
        mode: mode === "voice_remove" ? "Voice Removal"
             : mode === "voice_change" ? `Voice: ${voicePreset}`
             : mode === "denoise" ? "Denoise"
             : undefined,
      });

      setProgress(100);
      setState("done");
      if (mode === "voice_remove" && !hasSplits && !usedFreeSplit) setUsedFreeSplit(true);
    } catch (err: any) {
      clearInterval(progressInterval);
      setProgress(0);
      toast({ title: "Processing failed", description: err.message, variant: "destructive" });
      setState("ready");
    }
  };

  const handlePlayProcessed = async () => {
    if (!processedBlob) return;
    const ctx = getAudioContext();
    if (isPlaying) {
      sourceRef.current?.stop();
      setIsPlaying(false);
      return;
    }
    const ab = await processedBlob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab);
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    source.start();
    source.onended = () => setIsPlaying(false);
    sourceRef.current = source;
    setIsPlaying(true);
  };

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    if (!processedBlob) return;
    const suffix = mode === "voice_remove" ? "instrumental"
                 : mode === "master" ? `${masterPreset}_master`
                 : mode === "voice_change" ? `voice_${voicePreset}`
                 : mode === "denoise" ? "denoised"
                 : "processed";
    downloadBlob(processedBlob, `GravelKing_${fileName.replace(/\.[^.]+$/, "")}_${suffix}.wav`);
    toast({ title: "Downloaded", description: "Your processed audio is ready." });
  };

  const handleDownloadStem = (name: string, blob: Blob) => {
    downloadBlob(blob, `GravelKing_${fileName.replace(/\.[^.]+$/, "")}_${name}`);
  };

  const handleDownloadAllStems = () => {
    stemBlobs.forEach(({ name, blob }) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `GravelKing_${fileName.replace(/\.[^.]+$/, "")}_${name}`;
      a.click();
      URL.revokeObjectURL(url);
    });
    toast({ title: "All stems downloading", description: `${stemBlobs.length} files` });
  };

  const resetState = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setState("idle");
    setWaveformBefore([]);
    setWaveformAfter([]);
    setProcessedBlob(null);
    if (processedUrl) { URL.revokeObjectURL(processedUrl); setProcessedUrl(null); }
    if (originalUrl) { URL.revokeObjectURL(originalUrl); setOriginalUrl(null); }
    setStemBlobs([]);
    setStats(null);
    setFileName("");
    loadedFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (isPlaying) { sourceRef.current?.stop(); setIsPlaying(false); }
  };

  const selectedMode = MODES.find(m => m.value === mode)!;
  const selectedPresetInfo = MASTER_PRESETS_UI.find(p => p.id === masterPreset)!;
  const canUseSplit = hasSplits || (!usedFreeSplit && isAuthenticated);
  const canProcess =
    mode === "standard" ? isPro :
    (mode === "voice_remove" || mode === "stem_split") ? canUseSplit :
    true; // master, voice_change, denoise are always available

  const isFreeMode = mode === "voice_change" || mode === "denoise" ||
    (mode === "master" && masterPreset === "normal");

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Audio Studio</h1>
            <p className="text-muted-foreground text-sm mt-1">Upload your audio — GravelKing Productions processes it on the server.</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2.5 py-1.5">
              <Shield className="w-3.5 h-3.5" />
              Server-side processing
            </div>
            {!hasSplits && (
              <Link href="/pricing">
                <Badge variant="outline" className="border-amber-500/30 text-amber-500 cursor-pointer hover:bg-amber-500/10 px-3 py-1">
                  Free Plan — Upgrade
                </Badge>
              </Link>
            )}
            {hasSplits && !isPro && (
              <Link href="/pricing">
                <Badge variant="outline" className="border-amber-500/30 text-amber-500 cursor-pointer hover:bg-amber-500/10 px-3 py-1">
                  Splits Plan — Upgrade to Pro
                </Badge>
              </Link>
            )}
          </div>
        </div>

        {/* Free modes banner */}
        {state === "idle" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { icon: <Waves className="w-4 h-4 text-teal-400" />, label: "Denoise", tag: "Free" },
              { icon: <Volume2 className="w-4 h-4 text-pink-400" />, label: "Voice Changer", tag: "Free" },
              { icon: <Wand2 className="w-4 h-4 text-sky-400" />, label: "Mastering", tag: "Normal Free" },
              { icon: <Scissors className="w-4 h-4 text-emerald-400" />, label: "Stem Split", tag: "1 Free" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/30 border border-border/30">
                {f.icon}
                <span className="text-xs font-medium">{f.label}</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0 ml-auto border-emerald-500/30 text-emerald-400">{f.tag}</Badge>
              </div>
            ))}
          </motion.div>
        )}

        {hasSplits && !isPro && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
            <div className="flex items-center gap-2.5 text-sm">
              <Lock className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-amber-400/90">You're on <strong>GravelKing Splits</strong> — voice removal and stem splitting are unlocked. Upgrade to Pro for the full studio.</span>
            </div>
            <Link href="/pricing">
              <Button size="sm" variant="outline" className="shrink-0 border-amber-500/30 text-amber-500 h-8 text-xs">
                Upgrade <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </motion.div>
        )}

        {/* Drop Zone */}
        <Card
          className={`border-2 border-dashed transition-colors cursor-pointer ${
            state === "idle" ? "border-border/50 hover:border-amber-500/40 bg-card/20" : "border-amber-500/30 bg-card/40"
          }`}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => state === "idle" && fileInputRef.current?.click()}
          data-testid="dropzone-audio"
        >
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            {state === "idle" && (
              <>
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                  <Upload className="w-7 h-7 text-amber-500" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">Drop your audio file here</p>
                  <p className="text-sm text-muted-foreground mt-1">WAV, MP3, M4A, FLAC supported</p>
                </div>
              </>
            )}
            {state === "loading" && (
              <div className="w-full max-w-xs space-y-3 text-center">
                <Music className="w-10 h-10 text-amber-500 mx-auto animate-pulse" />
                <p className="text-sm font-medium">Reading audio file...</p>
                <Progress value={progress} className="h-1.5" />
              </div>
            )}
            {(state === "ready" || state === "processing" || state === "done") && (
              <div className="w-full space-y-2 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Music className="w-5 h-5 text-amber-500" />
                  <span className="font-medium text-sm">{fileName}</span>
                  <Badge variant="secondary" className="text-xs">{duration.toFixed(1)}s</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {state === "done"
                    ? mode === "stem_split" ? `${stemBlobs.length} stems ready to download` : "Processed — ready to download"
                    : state === "processing" ? "Sending to GravelKing server..."
                    : "Loaded and ready"}
                </p>
                {state !== "processing" && (
                  <button className="text-xs text-amber-500 hover:underline" onClick={resetState}>
                    Load different file
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Waveforms */}
        <AnimatePresence>
          {waveformBefore.length > 0 && mode !== "stem_split" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WaveformCard label="Original Signal" points={waveformBefore} color="#f59e0b" />
              {waveformAfter.length > 0
                ? <WaveformCard label="GravelKing Output" points={waveformAfter} color="#34d399" />
                : <WaveformCard label="GravelKing Output" points={[]} color="#34d399" placeholder />
              }
            </motion.div>
          )}
        </AnimatePresence>

        {/* Controls */}
        {state !== "idle" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border/40 bg-card/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-amber-500" /> Kernel Parameters
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">

                {/* Processing Mode */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Processing Mode</label>
                  <Select value={mode} onValueChange={(v) => setMode(v as ProcessMode)} disabled={state === "processing"}>
                    <SelectTrigger data-testid="select-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value} disabled={m.requiresStudio && !isPro}>
                          <div className="flex items-center gap-2">
                            {m.icon}
                            <span>{m.label}</span>
                            {(m.value === "voice_change" || m.value === "denoise") && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 border-emerald-500/30 text-emerald-400">Free</Badge>
                            )}
                            {m.value === "master" && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 border-sky-500/30 text-sky-400">Normal Free</Badge>
                            )}
                            {m.requiresStudio && !isPro && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 border-amber-500/30 text-amber-500">Pro</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{selectedMode.description}</p>

                  {/* Mode notices */}
                  {mode === "master" && (
                    <div className="flex items-start gap-1.5 text-xs text-sky-400/80 bg-sky-500/10 border border-sky-500/20 rounded-md p-2.5">
                      <Wand2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      Normal is free for everyone. Upgrade to Splits to unlock 5 additional presets.
                    </div>
                  )}
                  {mode === "voice_remove" && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-secondary/40 rounded-md p-2.5">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                      Requires a stereo (2-channel) file. Mono files are not supported.
                    </div>
                  )}
                  {mode === "stem_split" && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-secondary/40 rounded-md p-2.5">
                      <Scissors className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
                      Returns bass, midrange, and highs. Instrumental stem added for stereo files.
                    </div>
                  )}
                  {(mode === "voice_remove" || mode === "stem_split") && !hasSplits && !usedFreeSplit && isAuthenticated && (
                    <div className="flex items-start gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2.5">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      You have <strong className="mx-0.5">1 free use</strong> of the voice splitter remaining.
                    </div>
                  )}
                  {(mode === "voice_remove" || mode === "stem_split") && !hasSplits && usedFreeSplit && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5">
                      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      Free trial used.{" "}
                      <Link href="/pricing" className="underline font-medium ml-0.5">Upgrade to Splits</Link> for unlimited use.
                    </div>
                  )}
                  {mode === "standard" && !isPro && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5">
                      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      GravelKing Kernel requires a Pro subscription.{" "}
                      <Link href="/pricing" className="underline font-medium">Upgrade</Link>
                    </div>
                  )}
                  {(mode === "voice_change" || mode === "denoise") && (
                    <div className="flex items-start gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2.5">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      This mode is completely free — no account needed.
                    </div>
                  )}
                </div>

                {/* Mastering presets grid */}
                {mode === "master" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Preset</label>
                    <div className="grid grid-cols-2 gap-2">
                      {MASTER_PRESETS_UI.map((p) => {
                        const locked = !p.free && !hasSplits;
                        const selected = masterPreset === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => !locked && setMasterPreset(p.id as MasterPresetId)}
                            disabled={locked}
                            className={`relative text-left px-3 py-2.5 rounded-lg border transition-colors ${
                              selected ? "border-amber-500 bg-amber-500/10"
                              : locked ? "border-border/20 bg-secondary/10 opacity-40 cursor-not-allowed"
                              : "border-border/40 bg-secondary/20 hover:border-amber-500/50 cursor-pointer"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-xs font-semibold">{p.label}</span>
                              {p.free ? (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-sky-500/30 text-sky-400">Free</Badge>
                              ) : locked ? (
                                <Lock className="w-3 h-3 text-muted-foreground/40" />
                              ) : null}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-snug">{p.description}</p>
                          </button>
                        );
                      })}
                    </div>
                    {!hasSplits && (
                      <p className="text-xs text-muted-foreground/60 pt-0.5">
                        <Link href="/pricing" className="text-amber-500 underline">Upgrade to Splits</Link> to unlock all 6 mastering presets.
                      </p>
                    )}
                  </div>
                )}

                {/* Voice changer presets */}
                {mode === "voice_change" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Voice Effect</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {VOICE_PRESETS_UI.map((p) => {
                        const selected = voicePreset === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setVoicePreset(p.id as VoicePresetId)}
                            className={`flex items-center gap-3 text-left px-3 py-2 rounded-lg border transition-colors ${
                              selected ? "border-pink-500 bg-pink-500/10" : "border-border/40 bg-secondary/20 hover:border-pink-500/40 cursor-pointer"
                            }`}
                          >
                            <span className="text-lg">{p.emoji}</span>
                            <div>
                              <div className="text-xs font-semibold">{p.label}</div>
                              <div className="text-[10px] text-muted-foreground">{p.description}</div>
                            </div>
                            {selected && <CheckCircle2 className="w-3.5 h-3.5 text-pink-400 ml-auto" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Standard-only params */}
                {mode === "standard" && (
                  <>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <label className="text-sm font-medium">Signal Strength</label>
                        <span className="text-sm font-mono text-muted-foreground">{multiplier[0].toFixed(2)}</span>
                      </div>
                      <Slider value={multiplier} onValueChange={setMultiplier} min={0.1} max={2.0} step={0.01} disabled={state === "processing" || !isPro} data-testid="slider-studio-multiplier" />
                      <p className="text-xs text-muted-foreground">Below 1.0 reduces amplitude. Above 1.0 boosts it.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Buffer Size</label>
                      <Select value={sliceSize} onValueChange={setSliceSize} disabled={state === "processing" || !isPro}>
                        <SelectTrigger data-testid="select-studio-buffersize"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 — sample-by-sample</SelectItem>
                          <SelectItem value="2">2 — paired (default)</SelectItem>
                          <SelectItem value="4">4 — quad chunks</SelectItem>
                          <SelectItem value="8">8 — deep buffer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {/* Universal: Tempo + Key (all modes except stem_split) */}
                {mode !== "stem_split" && (
                  <div className="space-y-4 border-t border-border/30 pt-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tempo & Key</p>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-sm">Tempo</label>
                        <span className="text-sm font-mono text-muted-foreground">{tempo[0].toFixed(2)}×</span>
                      </div>
                      <Slider
                        value={tempo}
                        onValueChange={setTempo}
                        min={0.5} max={2.0} step={0.05}
                        disabled={state === "processing"}
                        data-testid="slider-tempo"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>0.5× slow</span><span>1.0× normal</span><span>2.0× fast</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-sm">Key / Pitch</label>
                        <span className="text-sm font-mono text-muted-foreground">
                          {semitones[0] > 0 ? `+${semitones[0]}` : semitones[0]} st
                        </span>
                      </div>
                      <Slider
                        value={semitones}
                        onValueChange={setSemitones}
                        min={-12} max={12} step={1}
                        disabled={state === "processing"}
                        data-testid="slider-semitones"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>−12 (octave down)</span><span>0</span><span>+12 (octave up)</span>
                      </div>
                    </div>
                    {(Math.abs(tempo[0] - 1.0) > 0.01 || semitones[0] !== 0) && (
                      <button
                        onClick={() => { setTempo([1.0]); setSemitones([0]); }}
                        className="text-xs text-amber-500 hover:underline"
                      >
                        Reset to default
                      </button>
                    )}
                  </div>
                )}

                <Button
                  className={`w-full font-semibold h-11 ${canProcess ? "bg-amber-500 hover:bg-amber-600 text-black" : "opacity-60 cursor-not-allowed"}`}
                  onClick={handleProcess}
                  disabled={state === "processing" || state === "loading" || !canProcess}
                  data-testid="button-process"
                >
                  {state === "processing"
                    ? `Processing... ${progress}%`
                    : !canProcess
                    ? <><Lock className="w-4 h-4 mr-2" />{mode === "standard" ? "Pro Required" : "Upgrade Required"}</>
                    : mode === "master"       ? <><Wand2 className="w-4 h-4 mr-2" />Apply {selectedPresetInfo?.label} Master</>
                    : mode === "voice_remove" ? <><Mic2 className="w-4 h-4 mr-2" />Remove Vocals</>
                    : mode === "stem_split"   ? <><Scissors className="w-4 h-4 mr-2" />Split into Stems</>
                    : mode === "voice_change" ? <><Volume2 className="w-4 h-4 mr-2" />Apply {VOICE_PRESETS_UI.find(p => p.id === voicePreset)?.emoji} {VOICE_PRESETS_UI.find(p => p.id === voicePreset)?.label} Voice</>
                    : mode === "denoise"      ? <><Waves className="w-4 h-4 mr-2" />Remove Noise</>
                    : "Process with GravelKing"}
                </Button>
                {state === "processing" && <Progress value={progress} className="h-1.5" />}
              </CardContent>
            </Card>

            {/* Output */}
            <Card className="border-border/40 bg-card/40">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {selectedMode.icon}Output
                </CardTitle>
                <CardDescription>
                  {mode === "standard" && "Processed on the GravelKing server"}
                  {mode === "voice_remove" && "Center-channel cancelled instrumental"}
                  {mode === "stem_split" && "Frequency-separated stems"}
                  {mode === "master" && `Mastered with the ${selectedPresetInfo?.label} preset`}
                  {mode === "voice_change" && `Voice transformed: ${VOICE_PRESETS_UI.find(p => p.id === voicePreset)?.label}`}
                  {mode === "denoise" && "Background noise removed"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Waiting state */}
                {state !== "done" && (
                  <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground text-sm">
                    <BarChart2 className="w-8 h-8 mb-3 opacity-30" />
                    {state === "processing" ? "Server is processing your audio..." : "Hit Process to run"}
                  </div>
                )}

                {/* Stem split done */}
                {state === "done" && mode === "stem_split" && stemBlobs.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    {stemBlobs
                      .slice()
                      .sort((a, b) => {
                        const order = ["bass.wav", "midrange.wav", "highs.wav", "instrumental.wav"];
                        return order.indexOf(a.name) - order.indexOf(b.name);
                      })
                      .map(({ name, blob }) => {
                        const meta = STEM_LABELS[name] ?? { label: name, color: "text-foreground", description: "" };
                        return (
                          <div key={name} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border/40">
                            <div>
                              <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
                              <p className="text-[11px] text-muted-foreground mt-0.5">{meta.description}</p>
                            </div>
                            {hasSplits ? (
                              <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => handleDownloadStem(name, blob)}>
                                <Download className="w-3.5 h-3.5 mr-1.5" />WAV
                              </Button>
                            ) : (
                              <Link href="/pricing" className="shrink-0">
                                <Button size="sm" variant="outline" className="h-8 text-xs border-amber-500/30 text-amber-500">
                                  <Lock className="w-3.5 h-3.5 mr-1.5" />Splits
                                </Button>
                              </Link>
                            )}
                          </div>
                        );
                      })}
                    {hasSplits && (
                      <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={handleDownloadAllStems} data-testid="button-download-all-stems">
                        <Download className="w-4 h-4 mr-2" /> Download All Stems
                      </Button>
                    )}
                  </motion.div>
                )}

                {/* WAV output done */}
                {state === "done" && mode !== "stem_split" && stats && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">

                    {/* Before / After comparison */}
                    {originalUrl && processedUrl && (
                      <div className="space-y-2 p-3 rounded-lg bg-secondary/30 border border-border/30">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Before / After</p>
                        <div className="space-y-2">
                          <div>
                            <p className="text-[10px] text-amber-400 font-medium mb-1">▶ Original</p>
                            <audio src={originalUrl} controls className="w-full h-8" style={{ colorScheme: "dark" }} />
                          </div>
                          <div>
                            <p className="text-[10px] text-emerald-400 font-medium mb-1">▶ Processed</p>
                            <audio src={processedUrl} controls className="w-full h-8" style={{ colorScheme: "dark" }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Stats */}
                    {[
                      { label: "Parity Status", value: stats.parity },
                      ...(mode === "standard" ? [
                        { label: "Efficiency",        value: stats.efficiency },
                        { label: "Decay Rate",        value: stats.decayRate },
                        { label: "Samples Processed", value: stats.samples },
                      ] : stats.mode ? [
                        { label: "Mode", value: stats.mode },
                      ] : []),
                    ].map(m => (
                      <div key={m.label} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border/40">
                        <span className="text-sm text-muted-foreground">{m.label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm text-emerald-400 font-semibold">{m.value}</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                      </div>
                    ))}

                    {/* Download */}
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" className="flex-1" onClick={handlePlayProcessed} data-testid="button-play">
                        {isPlaying ? <><Square className="w-4 h-4 mr-2" />Stop</> : <><Play className="w-4 h-4 mr-2" />Preview</>}
                      </Button>
                      {(mode === "master" || mode === "voice_change" || mode === "denoise" || (mode === "voice_remove" && hasSplits) || (mode === "standard" && isPro)) ? (
                        <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={handleDownload} data-testid="button-download">
                          <Download className="w-4 h-4 mr-2" /> Download WAV
                        </Button>
                      ) : (
                        <Link href="/pricing" className="flex-1">
                          <Button variant="outline" className="w-full border-amber-500/30 text-amber-500" data-testid="button-upgrade-download">
                            <Lock className="w-4 h-4 mr-2" /> Upgrade to Download
                          </Button>
                        </Link>
                      )}
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    </Layout>
  );
}

function WaveformCard({ label, points, color, placeholder }: { label: string; points: number[]; color: string; placeholder?: boolean }) {
  return (
    <Card className="border-border/40 bg-card/40">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground mb-3">{label}</p>
        <svg viewBox="0 0 300 80" className="w-full" style={{ height: 80 }}>
          {placeholder ? (
            <text x={150} y={40} textAnchor="middle" fill="#555" fontSize="11" dominantBaseline="middle">Run kernel to see output</text>
          ) : (
            points.map((p, i) => {
              const x = (i / points.length) * 300;
              const barH = Math.max(2, p * 72);
              const y = (80 - barH) / 2;
              return <rect key={i} x={x} y={y} width={Math.max(1, 300 / points.length - 0.5)} height={barH} fill={color} opacity={0.75} rx={0.5} />;
            })
          )}
        </svg>
      </CardContent>
    </Card>
  );
}
