import { useState, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Download, Upload, Music, BarChart2, Settings2, CheckCircle2,
  Lock, Play, Square, Shield, Scissors, Mic2, Layers, AlertCircle, ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import { Link } from "wouter";
import { getWaveformPoints } from "@/lib/audioKernel";

type ProcessState = "idle" | "loading" | "ready" | "processing" | "done";
type ProcessMode = "standard" | "voice_remove" | "stem_split";

const MODES: Array<{
  value: ProcessMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  requiresStudio: boolean;
}> = [
  {
    value: "stem_split",
    label: "Stem Splitting",
    description: "Splits into bass, midrange, highs (+ instrumental for stereo files)",
    icon: <Scissors className="w-4 h-4 text-emerald-400" />,
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
  const { isPro, hasSplits } = useAppState();
  const { toast } = useToast();
  const [state, setState] = useState<ProcessState>("idle");
  const [progress, setProgress] = useState(0);
  const [multiplier, setMultiplier] = useState([0.75]);
  const [sliceSize, setSliceSize] = useState("2");
  const [mode, setMode] = useState<ProcessMode>("stem_split");
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState(0);
  const [waveformBefore, setWaveformBefore] = useState<number[]>([]);
  const [waveformAfter, setWaveformAfter] = useState<number[]>([]);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [stemBlobs, setStemBlobs] = useState<Array<{ name: string; blob: Blob }>>([]);
  const [stats, setStats] = useState<{
    efficiency: string;
    decayRate: string;
    samples: string;
    parity: string;
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
    loadedFileRef.current = file;
    setFileName(file.name);
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
  }, [toast]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleProcess = async () => {
    if (state !== "ready" || !loadedFileRef.current) return;

    // Block if mode requires studio but user lacks Pro
    if (mode === "standard" && !isPro) {
      toast({ title: "Pro required", description: "GravelKing Kernel processing requires a Pro subscription.", variant: "destructive" });
      return;
    }
    // Block if mode requires splits and user has no paid tier
    if (!hasSplits && (mode === "voice_remove" || mode === "stem_split")) {
      toast({ title: "Paid plan required", description: "Voice removal and stem splitting require a GravelKing Splits or Pro subscription.", variant: "destructive" });
      return;
    }

    setState("processing");
    setProgress(0);
    setProcessedBlob(null);
    setStemBlobs([]);
    setWaveformAfter([]);
    setStats(null);

    let fakeProgress = 0;
    const progressInterval = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + 3, 88);
      setProgress(fakeProgress);
    }, 200);

    try {
      const formData = new FormData();
      formData.append("audio", loadedFileRef.current);
      formData.append("multiplier", String(multiplier[0]));
      formData.append("slice_size", sliceSize);
      formData.append("mode", mode);

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
        return;
      }

      // WAV response (standard or voice_remove)
      const wavBlob = await response.blob();
      const parity = response.headers.get("X-GK-Parity") ?? "VALIDATED";
      const efficiency = response.headers.get("X-GK-Efficiency") ?? "0";
      const decayRate = response.headers.get("X-GK-Decay-Rate") ?? "0";
      const sampleCount = response.headers.get("X-GK-Sample-Count") ?? "0";

      setProcessedBlob(wavBlob);

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
      });

      setProgress(100);
      setState("done");
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
    const suffix = mode === "voice_remove" ? "instrumental" : "processed";
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
    setStemBlobs([]);
    setStats(null);
    setFileName("");
    loadedFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (isPlaying) { sourceRef.current?.stop(); setIsPlaying(false); }
  };

  const selectedMode = MODES.find(m => m.value === mode)!;
  const canProcess = mode === "standard" ? isPro : hasSplits;

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Audio Studio</h1>
            <p className="text-muted-foreground text-sm mt-1">Upload your audio — GravelKing processes it on the server.</p>
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

        {/* Splits-only upsell banner */}
        {hasSplits && !isPro && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-amber-500/20 bg-amber-500/5"
          >
            <div className="flex items-center gap-2.5 text-sm">
              <Lock className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="text-amber-400/90">You're on <strong>GravelKing Splits</strong> — voice removal and stem splitting are unlocked. Upgrade to Pro to unlock the full Audio Studio.</span>
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

        {/* Waveforms — only for standard/voice modes */}
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
                        <SelectItem
                          key={m.value}
                          value={m.value}
                          disabled={m.requiresStudio && !isPro}
                        >
                          <div className="flex items-center gap-2">
                            {m.icon}
                            <span>{m.label}</span>
                            {m.requiresStudio && !isPro && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 border-amber-500/30 text-amber-500">Pro</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{selectedMode.description}</p>

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
                  {mode === "standard" && !isPro && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5">
                      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      GravelKing Kernel requires a Pro subscription.{" "}
                      <Link href="/pricing" className="underline font-medium">Upgrade</Link>
                    </div>
                  )}
                </div>

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
                    : mode === "voice_remove" ? "Remove Vocals"
                    : mode === "stem_split" ? "Split into Stems"
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
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Waiting state */}
                {state !== "done" && (
                  <div className="flex flex-col items-center justify-center h-40 text-center text-muted-foreground text-sm">
                    <BarChart2 className="w-8 h-8 mb-3 opacity-30" />
                    {state === "processing" ? "Server is running the kernel..." : "Hit Process to run the kernel"}
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
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs shrink-0"
                                onClick={() => handleDownloadStem(name, blob)}
                              >
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
                      <Button
                        className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                        onClick={handleDownloadAllStems}
                        data-testid="button-download-all-stems"
                      >
                        <Download className="w-4 h-4 mr-2" /> Download All Stems
                      </Button>
                    )}
                  </motion.div>
                )}

                {/* WAV output done (standard or voice_remove) */}
                {state === "done" && mode !== "stem_split" && stats && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                    {[
                      { label: "Parity Status", value: stats.parity },
                      ...(mode === "standard" ? [
                        { label: "Efficiency",        value: stats.efficiency },
                        { label: "Decay Rate",        value: stats.decayRate },
                        { label: "Samples Processed", value: stats.samples },
                      ] : [
                        { label: "Mode",   value: "Voice Removal" },
                        { label: "Output", value: "Instrumental (stereo)" },
                      ]),
                    ].map(m => (
                      <div key={m.label} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 border border-border/40">
                        <span className="text-sm text-muted-foreground">{m.label}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-sm text-emerald-400 font-semibold">{m.value}</span>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" className="flex-1" onClick={handlePlayProcessed} data-testid="button-play">
                        {isPlaying ? <><Square className="w-4 h-4 mr-2" />Stop</> : <><Play className="w-4 h-4 mr-2" />Preview</>}
                      </Button>
                      {(mode === "voice_remove" ? hasSplits : isPro) ? (
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
