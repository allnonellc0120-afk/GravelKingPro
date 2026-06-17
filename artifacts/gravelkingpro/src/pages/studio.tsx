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
  ChevronRight, Wand2, Waves, Volume2, Plug,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import { Link } from "wouter";
import { getWaveformPoints } from "@/lib/audioKernel";
import { WaveformScrubber, type WaveformScrubberHandle } from "@/components/waveform-scrubber";
import { StudioPluginRack, DEFAULT_PLUGIN_STATE, type PluginState } from "@/components/studio-plugin-rack";
import { LiveVocalMonitor } from "@/components/live-vocal-monitor";

type ProcessState = "idle" | "loading" | "ready" | "processing" | "done";
type ProcessMode = "standard" | "voice_remove" | "stem_split" | "master";

const MASTER_PRESETS_UI = [
  { id: "baseline",   label: "Baseline",    description: "Balanced, +10% low end at YouTube loudness. Recommended.", free: true,  emoji: "🎚️", accent: "#38bdf8", glow: "rgba(56,189,248,0.20)",  bg: "linear-gradient(135deg,#0c2a3f 0%,#06121c 100%)", img: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&q=80" },
  { id: "spacious",   label: "Spacious",    description: "Baseline + reverb & stereo space maker for width.", free: false, emoji: "🌌",  accent: "#a78bfa", glow: "rgba(167,139,250,0.20)", bg: "linear-gradient(135deg,#1e1b4b 0%,#0b0a1f 100%)", img: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400&q=80" },
  { id: "normal",     label: "Normal",      description: "Balanced loudness. Good for any content.",        free: true,  emoji: "⚖️",  accent: "#94a3b8", glow: "rgba(148,163,184,0.18)", bg: "linear-gradient(135deg,#1e293b 0%,#0f172a 100%)", img: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&q=80" },
  { id: "broadcast",  label: "Broadcast",   description: "EBU R128 broadcast standard. -23 LUFS.",          free: false, emoji: "📡",  accent: "#3b82f6", glow: "rgba(59,130,246,0.18)",   bg: "linear-gradient(135deg,#1e3a5f 0%,#0c1a2e 100%)", img: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&q=80" },
  { id: "vinyl",      label: "Vinyl",       description: "Warm analog character with boosted lows.",        free: false, emoji: "💿",  accent: "#f59e0b", glow: "rgba(245,158,11,0.18)",   bg: "linear-gradient(135deg,#451a03 0%,#1c0a00 100%)", img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=400&q=80" },
  { id: "podcast",    label: "Podcast",     description: "Voice clarity with dynamic compression.",         free: false, emoji: "🎙️", accent: "#22c55e", glow: "rgba(34,197,94,0.18)",    bg: "linear-gradient(135deg,#052e16 0%,#021a0d 100%)", img: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=400&q=80" },
  { id: "club",       label: "Club",        description: "Heavy bass and punchy transients.",               free: false, emoji: "🔊",  accent: "#a855f7", glow: "rgba(168,85,247,0.18)",   bg: "linear-gradient(135deg,#2e1065 0%,#13043a 100%)", img: "https://images.unsplash.com/photo-1571266028253-6c7f4e8e8a0e?w=400&q=80" },
  { id: "film",       label: "Film",        description: "Wide cinematic dynamics with presence.",          free: false, emoji: "🎬",  accent: "#ef4444", glow: "rgba(239,68,68,0.18)",    bg: "linear-gradient(135deg,#450a0a 0%,#1f0505 100%)", img: "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=400&q=80" },
  { id: "youtube",    label: "YouTube",     description: "-14 LUFS — YouTube loudness standard.",           free: false, emoji: "▶️",  accent: "#ff0000", glow: "rgba(255,0,0,0.22)",      bg: "linear-gradient(135deg,#450000 0%,#1f0000 100%)", img: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=80" },
  { id: "soundcloud", label: "SoundCloud",  description: "-11 LUFS — Loud & punchy for SoundCloud.",        free: false, emoji: "☁️",  accent: "#ff5500", glow: "rgba(255,85,0,0.22)",     bg: "linear-gradient(135deg,#431407 0%,#1f0a03 100%)", img: "https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=400&q=80" },
  { id: "apple",      label: "Apple Music", description: "-16 LUFS — Apple Sound Check standard.",          free: false, emoji: "🍎",  accent: "#fc3c44", glow: "rgba(252,60,68,0.22)",    bg: "linear-gradient(135deg,#3b0a0a 0%,#1a0404 100%)", img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80" },
] as const;
type MasterPresetId = (typeof MASTER_PRESETS_UI)[number]["id"];

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
    description: "Apply a professional mastering preset with optional denoise — first full download free",
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
    description: "Splits into 5 stems: vocals, drums, bass, other, and a full instrumental",
    icon: <Scissors className="w-4 h-4 text-emerald-400" />,
    requiresStudio: false,
  },
  {
    value: "standard",
    label: "GravelKing Kernel",
    description: "Full kernel signal carving — amplitude, parity, efficiency (Studio only)",
    icon: <Layers className="w-4 h-4 text-amber-500" />,
    requiresStudio: true,
  },
];

const STEM_LABELS: Record<string, { label: string; color: string; description: string }> = {
  "GKP_vocals.wav":       { label: "Vocals",       color: "text-pink-400",    description: "Isolated lead & backing vocals" },
  "GKP_drums.wav":        { label: "Drums",        color: "text-amber-400",   description: "Kick, snare, hats & percussion" },
  "GKP_bass.wav":         { label: "Bass",         color: "text-orange-400",  description: "Bass guitar & sub-bass" },
  "GKP_other.wav":        { label: "Other",        color: "text-sky-400",     description: "Synths, guitars & everything else" },
  "GKP_instrumental.wav": { label: "Instrumental", color: "text-purple-400",  description: "Full mix with vocals removed" },
};
const STEM_ORDER = ["GKP_vocals.wav", "GKP_drums.wav", "GKP_bass.wav", "GKP_other.wav", "GKP_instrumental.wav"];

type UsageRemaining = { voice_remove: number; stem_split: number; master: number };
type PaywallInfo = { feature: ProcessMode; limit: number; used: number; message: string; code?: string };

export default function Studio() {
  const { isPro, hasSplits } = useAppState();
  const { toast } = useToast();

  // Server-driven free-use accounting. -1 = unlimited (paid). null = unknown.
  const [remaining, setRemaining] = useState<UsageRemaining | null>(null);
  const [paywall, setPaywall] = useState<PaywallInfo | null>(null);

  const refreshUsage = useCallback(async () => {
    try {
      const resp = await fetch("/api/usage/status", { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json() as { remaining: UsageRemaining };
        setRemaining(data.remaining);
      }
    } catch { /* offline — leave as-is */ }
  }, []);

  useEffect(() => { void refreshUsage(); }, [refreshUsage]);

  const [state, setState] = useState<ProcessState>("idle");
  const [progress, setProgress] = useState(0);
  const [multiplier, setMultiplier] = useState([0.75]);
  const [sliceSize, setSliceSize] = useState("2");
  const [mode, setMode] = useState<ProcessMode>("master");
  const [masterPreset, setMasterPreset] = useState<MasterPresetId>("baseline");
  const [denoiseOn, setDenoiseOn] = useState(false);
  const [tempo, setTempo] = useState([1.0]);
  const [semitones, setSemitones] = useState([0]);
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState(0);
  const [waveformBefore, setWaveformBefore] = useState<number[]>([]);
  const [waveformAfter, setWaveformAfter] = useState<number[]>([]);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [processedFormat, setProcessedFormat] = useState<"wav" | "mp3">("wav");
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
  const [isSampleResult, setIsSampleResult] = useState(false);
  const [playingStem, setPlayingStem] = useState<string | null>(null);
  const [isPlayingMix, setIsPlayingMix] = useState(false);
  const [abMode, setAbMode] = useState<"original" | "processed">("original");
  const [showPlugins, setShowPlugins] = useState(false);
  const [plugins, setPlugins] = useState<PluginState>(DEFAULT_PLUGIN_STATE);
  // Per-stem session controls: mute suppresses a stem from playback; solo isolates it
  const [mutedStems, setMutedStems] = useState<Set<string>>(new Set());
  const [soloedStem, setSoloedStem] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const stemSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedFileRef = useRef<File | null>(null);
  const decodedBufferRef = useRef<AudioBuffer | null>(null);
  const scrubberRef = useRef<WaveformScrubberHandle | null>(null);
  const rafRef = useRef<number>(0);
  const playStartTimeRef = useRef<number>(0);
  const playOffsetRef = useRef<number>(0);

  const getAudioContext = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const createReverbIR = (ctx: AudioContext, sizePct: number): AudioBuffer => {
    const sr = ctx.sampleRate;
    const dur = 0.3 + (sizePct / 100) * 3.2;
    const len = Math.ceil(sr * dur);
    const ir = ctx.createBuffer(2, len, sr);
    const decay = 3.5 - (sizePct / 100) * 2.8;
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-(i / sr) * decay);
    }
    return ir;
  };

  const buildPluginChain = useCallback((ctx: AudioContext, source: AudioBufferSourceNode): AudioNode => {
    let last: AudioNode = source;

    if (plugins.eq.enabled) {
      const low = ctx.createBiquadFilter();
      low.type = "lowshelf"; low.frequency.value = 200; low.gain.value = plugins.eq.low[0];
      const mid = ctx.createBiquadFilter();
      mid.type = "peaking"; mid.frequency.value = plugins.eq.midFreq[0]; mid.Q.value = 1.2; mid.gain.value = plugins.eq.mid[0];
      const high = ctx.createBiquadFilter();
      high.type = "highshelf"; high.frequency.value = 8000; high.gain.value = plugins.eq.high[0];
      last.connect(low); low.connect(mid); mid.connect(high);
      last = high;
    }

    if (plugins.comp.enabled) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = plugins.comp.threshold[0];
      comp.ratio.value = plugins.comp.ratio[0];
      comp.attack.value = plugins.comp.attack[0] / 1000;
      comp.release.value = plugins.comp.release[0] / 1000;
      comp.knee.value = 30;
      last.connect(comp); last = comp;
    }

    if (plugins.reverb.enabled) {
      const wetG = ctx.createGain();
      const dryG = ctx.createGain();
      const outG = ctx.createGain();
      const conv = ctx.createConvolver();
      conv.buffer = createReverbIR(ctx, plugins.reverb.size[0]);
      wetG.gain.value = plugins.reverb.wet[0] / 100;
      dryG.gain.value = 1 - plugins.reverb.wet[0] / 100;
      last.connect(dryG); last.connect(conv); conv.connect(wetG);
      dryG.connect(outG); wetG.connect(outG);
      last = outG;
    }

    if (plugins.limiter.enabled) {
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = plugins.limiter.ceiling[0];
      lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1;
      last.connect(lim); last = lim;
    }

    return last;
  }, [plugins]);

  const handleFile = useCallback(async (file: File) => {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const isAudio = file.type.startsWith("audio/") || file.type.startsWith("video/") || ["mp3", "wav", "flac", "m4a", "aac", "ogg", "mov", "mp4"].includes(ext);
    if (!isAudio) {
      toast({ title: "Invalid file", description: "Please upload an audio or video file (MP3, WAV, MP4, MOV, etc.)", variant: "destructive" });
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
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleProcess = async () => {
    if (state !== "ready" || !loadedFileRef.current) return;

    if (mode === "standard" && !isPro) {
      toast({ title: "Studio required", description: "GravelKing Standard processing requires a Studio subscription.", variant: "destructive" });
      return;
    }

    setState("processing");
    setProgress(0);
    setIsSampleResult(false);
    setProcessedBlob(null);
    decodedBufferRef.current = null;
    scrubberRef.current?.setPosition(0);
    if (processedUrl) { URL.revokeObjectURL(processedUrl); setProcessedUrl(null); }
    setStemBlobs([]);
    setMutedStems(new Set());
    setSoloedStem(null);
    setIsPlayingMix(false);
    for (const src of stemSourcesRef.current) { try { src.stop(); } catch { /* ok */ } }
    stemSourcesRef.current = [];
    setWaveformAfter([]);
    setStats(null);

    let fakeProgress = 0;
    const progressInterval = setInterval(() => {
      fakeProgress = fakeProgress + Math.max(0.3, (91 - fakeProgress) * 0.055);
      setProgress(Math.min(fakeProgress, 91));
    }, 200);

    const abortController = new AbortController();
    const fetchTimeout = setTimeout(() => abortController.abort(), 120_000);
    const slowToast = setTimeout(() => {
      toast({ title: "Still working…", description: "Large files can take up to a minute — hang tight." });
    }, 18_000);

    const cleanupTimers = () => {
      clearInterval(progressInterval);
      clearTimeout(fetchTimeout);
      clearTimeout(slowToast);
    };

    try {
      if (mode === "master") {
        const formData = new FormData();
        formData.append("audio", loadedFileRef.current);
        formData.append("preset", masterPreset);
        formData.append("denoise", denoiseOn ? "true" : "false");
        const response = await fetch("/api/kernel/master", {
          method: "POST",
          credentials: "include",
          body: formData,
          signal: abortController.signal,
        });
        cleanupTimers();
        if (response.status === 402) {
          const err = await response.json().catch(() => null);
          if (err?.code === "LIMIT_REACHED") {
            setPaywall({ feature: "master", limit: err.limit ?? 1, used: err.used ?? 1, message: err.error ?? "" });
            setState("ready");
            return;
          }
        }
        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Mastering failed." }));
          throw new Error(err.error ?? "Mastering failed.");
        }
        setProgress(95);
        const isSample = response.headers.get("X-GK-Sample") === "true";
        setIsSampleResult(isSample);
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
      // Studio path: tell the server this request comes from the Studio session.
      // The server skips the free-trial counter and enforces a Pro subscription gate.
      formData.append("source", "studio");

      const response = await fetch("/api/kernel/process-audio", {
        method: "POST",
        credentials: "include",
        body: formData,
        signal: abortController.signal,
      });

      cleanupTimers();

      if (response.status === 402) {
        const err = await response.json().catch(() => null);
        if (err?.code === "LIMIT_REACHED" || err?.code === "UPGRADE_REQUIRED") {
          setPaywall({
            feature: (err.feature as ProcessMode) ?? mode,
            limit: err.limit ?? 0,
            used: err.used ?? 0,
            message: err.error ?? "",
            code: err.code,
          });
          setState("ready");
          return;
        }
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Server error" }));
        throw new Error(err.error || "Processing failed");
      }

      const freeRemainingHeader = response.headers.get("X-GK-Free-Remaining");

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
        if (freeRemainingHeader !== null) {
          setRemaining((r) => r ? { ...r, stem_split: Math.max(0, parseInt(freeRemainingHeader, 10)) } : r);
        }
        return;
      }

      // WAV response
      const wavBlob = await response.blob();
      const url = URL.createObjectURL(wavBlob);
      const parity = response.headers.get("X-GK-Parity") ?? "VALIDATED";
      const efficiency = response.headers.get("X-GK-Efficiency") ?? "0";
      const decayRate = response.headers.get("X-GK-Decay-Rate") ?? "0";
      const sampleCount = response.headers.get("X-GK-Sample-Count") ?? "0";
      const fmt = response.headers.get("X-GK-Format") ?? "wav";

      setProcessedBlob(wavBlob);
      setProcessedUrl(url);
      setProcessedFormat(fmt === "mp3" ? "mp3" : "wav");

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
        mode: mode === "voice_remove" ? "Voice Removal" : undefined,
      });

      setProgress(100);
      setState("done");
      if (mode === "voice_remove" && freeRemainingHeader !== null) {
        setRemaining((r) => r ? { ...r, voice_remove: Math.max(0, parseInt(freeRemainingHeader, 10)) } : r);
      }
    } catch (err: any) {
      cleanupTimers();
      setProgress(0);
      const isAbort = err?.name === "AbortError";
      toast({
        title: isAbort ? "Request timed out" : "Processing failed",
        description: isAbort
          ? "The server took too long to respond. Try a shorter file or try again."
          : err.message,
        variant: "destructive",
      });
      setState("ready");
    }
  };

  const stopAllAudio = () => {
    cancelAnimationFrame(rafRef.current);
    try { sourceRef.current?.stop(); } catch { /* already stopped */ }
    for (const src of stemSourcesRef.current) { try { src.stop(); } catch { /* ok */ } }
    stemSourcesRef.current = [];
    setIsPlaying(false);
    setPlayingStem(null);
    setIsPlayingMix(false);
  };

  /** Play all active (non-muted / correctly-soloed) stems simultaneously. */
  const handlePlayMix = async () => {
    if (stemBlobs.length === 0) return;
    if (isPlayingMix) { stopAllAudio(); return; }
    stopAllAudio();
    const ctx = getAudioContext();
    const activeStemNames = soloedStem !== null
      ? [soloedStem]
      : stemBlobs.filter(s => !mutedStems.has(s.name)).map(s => s.name);
    const activeBlobs = stemBlobs.filter(s => activeStemNames.includes(s.name));
    if (activeBlobs.length === 0) return;
    const sources: AudioBufferSourceNode[] = [];
    for (const { blob } of activeBlobs) {
      const ab = await blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(ab);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.start();
      sources.push(src);
    }
    stemSourcesRef.current = sources;
    setIsPlayingMix(true);
    // Stop mix state when the longest stem ends
    const maxDuration = Math.max(...activeBlobs.map(s => {
      const len = s.blob.size;
      return len / (44100 * 2 * 2);
    }));
    setTimeout(() => {
      stemSourcesRef.current = [];
      setIsPlayingMix(false);
    }, (maxDuration + 1) * 1000);
  };

  const startScrubberLoop = (ctx: AudioContext, decoded: AudioBuffer) => {
    cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const elapsed = ctx.currentTime - playStartTimeRef.current;
      const pos = Math.min(1, (playOffsetRef.current + elapsed) / decoded.duration);
      scrubberRef.current?.setPosition(pos);
      if (pos < 0.9995) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const updatePlugin = <K extends keyof PluginState>(plugin: K, updates: Partial<PluginState[K]>) => {
    setPlugins(prev => ({ ...prev, [plugin]: { ...prev[plugin], ...updates } }));
  };

  const handlePlayProcessed = async (startOffset = 0) => {
    if (!processedBlob) return;
    if (isPlaying && abMode === "processed" && startOffset === 0) { stopAllAudio(); return; }
    stopAllAudio();
    const ctx = getAudioContext();
    if (!decodedBufferRef.current) {
      const ab = await processedBlob.arrayBuffer();
      decodedBufferRef.current = await ctx.decodeAudioData(ab);
    }
    const decoded = decodedBufferRef.current;
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    const chain = buildPluginChain(ctx, source);
    chain.connect(ctx.destination);
    source.start(0, startOffset);
    source.onended = () => { setIsPlaying(false); cancelAnimationFrame(rafRef.current); };
    sourceRef.current = source;
    playStartTimeRef.current = ctx.currentTime;
    playOffsetRef.current = startOffset;
    setAbMode("processed");
    setIsPlaying(true);
    startScrubberLoop(ctx, decoded);
  };

  const handleSeek = async (pct: number) => {
    if (!decodedBufferRef.current) return;
    const offset = pct * decodedBufferRef.current.duration;
    playOffsetRef.current = offset;
    if (isPlaying && abMode === "processed") {
      await handlePlayProcessed(offset);
    }
  };

  const handlePlayAb = async (which: "original" | "processed") => {
    const blob = which === "original"
      ? (loadedFileRef.current ? new Blob([await loadedFileRef.current.arrayBuffer()]) : null)
      : processedBlob;
    if (!blob) return;
    const ctx = getAudioContext();
    const alreadyPlaying = isPlaying && abMode === which;
    stopAllAudio();
    if (alreadyPlaying) return;
    let decoded: AudioBuffer;
    if (which === "processed" && decodedBufferRef.current) {
      decoded = decodedBufferRef.current;
    } else {
      const ab = await blob.arrayBuffer();
      decoded = await ctx.decodeAudioData(ab);
      if (which === "processed") decodedBufferRef.current = decoded;
    }
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    const chain = which === "processed" ? buildPluginChain(ctx, source) : source;
    chain.connect(ctx.destination);
    source.start();
    source.onended = () => { setIsPlaying(false); cancelAnimationFrame(rafRef.current); };
    sourceRef.current = source;
    playStartTimeRef.current = ctx.currentTime;
    playOffsetRef.current = 0;
    setAbMode(which);
    setIsPlaying(true);
    if (which === "processed") startScrubberLoop(ctx, decoded);
    else scrubberRef.current?.setPosition(0);
  };

  const handlePlayStem = async (name: string, blob: Blob) => {
    const ctx = getAudioContext();
    if (playingStem === name) { stopAllAudio(); return; }
    stopAllAudio();
    const ab = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab);
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    source.connect(ctx.destination);
    source.start();
    source.onended = () => setPlayingStem(null);
    sourceRef.current = source;
    setPlayingStem(name);
  };

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const handleDownload = () => {
    if (!processedBlob) return;
    const suffix = mode === "voice_remove" ? "instrumental"
                 : mode === "master" ? `${masterPreset}_master`
                 : "processed";
    const ext = processedFormat;
    downloadBlob(processedBlob, `GravelKing_${fileName.replace(/\.[^.]+$/, "")}_${suffix}.${ext}`);
    toast({ title: "Downloaded", description: `Your processed audio is ready (${ext.toUpperCase()}).` });
  };

  const handleDownloadStem = (name: string, blob: Blob) => {
    downloadBlob(blob, `GravelKing_${fileName.replace(/\.[^.]+$/, "")}_${name}`);
  };

  const handleDownloadAllStems = () => {
    stemBlobs.forEach(({ name, blob }, i) => {
      setTimeout(() => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `GravelKing_${fileName.replace(/\.[^.]+$/, "")}_${name}`;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }, i * 200);
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
    setMutedStems(new Set());
    setSoloedStem(null);
    loadedFileRef.current = null;
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (isPlaying) { sourceRef.current?.stop(); setIsPlaying(false); }
    for (const src of stemSourcesRef.current) { try { src.stop(); } catch { /* ok */ } }
    stemSourcesRef.current = [];
    setIsPlayingMix(false);
  };

  const selectedMode = MODES.find(m => m.value === mode)!;
  const selectedPresetInfo = MASTER_PRESETS_UI.find(p => p.id === masterPreset)!;
  // Server is the source of truth; the UI only previews remaining counts.
  // We never hard-block here — the server returns 402 when limits are hit,
  // which drives the paywall funnel. canProcess only blocks the Studio kernel.
  const voiceRemovalsLeft = remaining ? remaining.voice_remove : null;
  const stemSplitsLeft = remaining ? remaining.stem_split : null;
  const mastersLeft = remaining ? remaining.master : null;
  const canProcess = mode === "standard" ? isPro : true;

  const isFreeMode = mode === "master";

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
                  Weekly Plan — Upgrade to Studio
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
              { icon: <Wand2 className="w-4 h-4 text-sky-400" />, label: "Mastering", tag: "1 Free" },
              { icon: <Mic2 className="w-4 h-4 text-purple-400" />, label: "Voice Removal", tag: "3 Free" },
              { icon: <Scissors className="w-4 h-4 text-emerald-400" />, label: "Stem Split", tag: "1 Free" },
              { icon: <Waves className="w-4 h-4 text-teal-400" />, label: "Denoise", tag: "In Master" },
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
              <span className="text-amber-400/90">You're on <strong>GravelKing Weekly</strong> — unlimited voice removal, stem splitting and preset masters. Upgrade to Studio (monthly) for the adjustable mastering kernel and live DAW.</span>
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
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onClick={() => state === "idle" && fileInputRef.current?.click()}
          data-testid="dropzone-audio"
        >
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
            {state === "idle" && (
              <>
                <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
                  <Upload className="w-7 h-7 text-amber-500" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">Drop your audio or video file here</p>
                  <p className="text-sm text-muted-foreground mt-1">WAV, MP3, MP4, M4A, FLAC, MOV supported</p>
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
                            {m.value === "master" && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 border-sky-500/30 text-sky-400">1 Free</Badge>
                            )}
                            {m.requiresStudio && !isPro && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1 border-amber-500/30 text-amber-500">Studio</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{selectedMode.description}</p>

                  {/* Mode notices */}
                  {mode === "master" && !hasSplits && (
                    <div className="flex items-start gap-1.5 text-xs text-sky-400/80 bg-sky-500/10 border border-sky-500/20 rounded-md p-2.5">
                      <Wand2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      {mastersLeft === null
                        ? <>Your first full master is free — after that you'll hear a 30-second preview.</>
                        : mastersLeft > 0
                          ? <>You have <strong className="mx-0.5">{mastersLeft} free full master{mastersLeft === 1 ? "" : "s"}</strong> left — after that you'll hear a 30-second preview.</>
                          : <>Free master used — you'll hear a 30-second preview. <Link href="/pricing" className="text-amber-500 underline font-medium ml-0.5">Subscribe</Link> for unlimited full masters.</>}
                    </div>
                  )}
                  {mode === "master" && hasSplits && (
                    <div className="flex items-start gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2.5">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      Subscribed — all presets unlocked with full-length download.
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
                      Returns stems: bass, midrange, highs, and instrumental. Studio path — requires a Studio (monthly) subscription.
                    </div>
                  )}
                  {mode === "voice_remove" && !hasSplits && (
                    voiceRemovalsLeft === null || voiceRemovalsLeft > 0 ? (
                      <div className="flex items-start gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2.5">
                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {voiceRemovalsLeft === null
                          ? <>Free voice removals available.</>
                          : <>You have <strong className="mx-0.5">{voiceRemovalsLeft} free voice removal{voiceRemovalsLeft === 1 ? "" : "s"}</strong> remaining.</>}
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5">
                        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        Free voice removals used.{" "}
                        <Link href="/pricing" className="underline font-medium ml-0.5">Subscribe to Weekly</Link> for unlimited use.
                      </div>
                    )
                  )}
                  {mode === "stem_split" && !hasSplits && (
                    stemSplitsLeft === null || stemSplitsLeft > 0 ? (
                      <div className="flex items-start gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md p-2.5">
                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {stemSplitsLeft === null
                          ? <>Free stem split available.</>
                          : <>You have <strong className="mx-0.5">{stemSplitsLeft} free stem split{stemSplitsLeft === 1 ? "" : "s"}</strong> remaining.</>}
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5">
                        <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        Free stem split used.{" "}
                        <Link href="/pricing" className="underline font-medium ml-0.5">Subscribe to Weekly</Link> for unlimited use.
                      </div>
                    )
                  )}
                  {mode === "standard" && !isPro && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md p-2.5">
                      <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      GravelKing Kernel requires the Studio (monthly) subscription.{" "}
                      <Link href="/pricing" className="underline font-medium">Upgrade</Link>
                    </div>
                  )}
                </div>

                {/* Mastering presets grid */}
                {mode === "master" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Preset</label>
                      <span className="text-[10px] text-muted-foreground">3 platform targets included</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {MASTER_PRESETS_UI.map((p) => {
                        const selected = masterPreset === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setMasterPreset(p.id as MasterPresetId)}
                            style={{ borderColor: selected ? p.accent : `${p.accent}40`, boxShadow: selected ? `0 0 18px ${p.glow}` : undefined }}
                            className="relative overflow-hidden rounded-xl border-2 h-24 transition-all duration-200 cursor-pointer hover:scale-[1.03] active:scale-[0.97]"
                          >
                            {"img" in p && (
                              <img src={(p as any).img} alt={p.label} className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            )}
                            <div className="absolute inset-0" style={{ background: selected ? `${p.bg.replace("100%)", "100%) / 0.55")}` : "rgba(0,0,0,0.62)" }} />
                            {selected && <div className="absolute inset-0 ring-2 ring-inset rounded-xl" style={{ borderColor: p.accent }} />}
                            <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1 px-1">
                              <span className="text-xl leading-none drop-shadow-lg">{p.emoji}</span>
                              <div className="text-[10px] font-bold text-white drop-shadow-md text-center leading-tight">{p.label}</div>
                              {selected && <CheckCircle2 className="w-3 h-3" style={{ color: p.accent }} />}
                              {!isPro && !p.free && <div className="text-[8px] text-sky-400 font-semibold">Sample</div>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {masterPreset && (
                      <p className="text-[10px] text-muted-foreground px-1">
                        {MASTER_PRESETS_UI.find(p => p.id === masterPreset)?.description}
                      </p>
                    )}
                  </div>
                )}

                {/* Denoise toggle (mastering) */}
                {mode === "master" && (
                  <button
                    type="button"
                    onClick={() => setDenoiseOn((v) => !v)}
                    className="w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                    style={{
                      borderColor: denoiseOn ? "#2dd4bf" : "rgba(45,212,191,0.25)",
                      background: denoiseOn ? "rgba(45,212,191,0.10)" : "transparent",
                      boxShadow: denoiseOn ? "0 0 16px rgba(45,212,191,0.18)" : undefined,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(45,212,191,0.14)", border: "1px solid rgba(45,212,191,0.3)" }}
                    >
                      <Waves className="w-5 h-5 text-teal-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold leading-tight text-teal-200">Denoise</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">Remove background hiss, hum & broadband noise before mastering.</div>
                    </div>
                    <div
                      className="w-9 h-5 rounded-full relative shrink-0 transition-colors"
                      style={{ background: denoiseOn ? "#2dd4bf" : "rgba(148,163,184,0.3)" }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                        style={{ left: denoiseOn ? "calc(100% - 1.125rem)" : "0.125rem" }}
                      />
                    </div>
                  </button>
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
                    ? <><Lock className="w-4 h-4 mr-2" />{mode === "standard" ? "Studio Required" : "Upgrade Required"}</>
                    : mode === "master"       ? <><Wand2 className="w-4 h-4 mr-2" />Apply {selectedPresetInfo?.label} Master{denoiseOn ? " + Denoise" : ""}</>
                    : mode === "voice_remove" ? <><Mic2 className="w-4 h-4 mr-2" />Remove Vocals</>
                    : mode === "stem_split"   ? <><Scissors className="w-4 h-4 mr-2" />Split into Stems</>
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
                  {mode === "master" && `Mastered with the ${selectedPresetInfo?.label} preset${denoiseOn ? " + denoise" : ""}`}
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

                {/* Stem split done — session track rows */}
                {state === "done" && mode === "stem_split" && stemBlobs.length > 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2.5">
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Session Tracks</p>
                      <button
                        onClick={() => void handlePlayMix()}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors border ${
                          isPlayingMix
                            ? "bg-amber-500 border-amber-500 text-black"
                            : "border-border/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {isPlayingMix
                          ? <><Square className="w-3 h-3 fill-current" /> Stop Mix</>
                          : <><Play className="w-3 h-3" /> Play Mix</>}
                      </button>
                    </div>
                    {stemBlobs
                      .slice()
                      .sort((a, b) => STEM_ORDER.indexOf(a.name) - STEM_ORDER.indexOf(b.name))
                      .map(({ name, blob }) => {
                        const meta = STEM_LABELS[name] ?? { label: name, color: "text-foreground", description: "" };
                        const stemPlaying = playingStem === name;
                        const isMuted = mutedStems.has(name);
                        const isSoloed = soloedStem === name;
                        const dimmed = soloedStem !== null && !isSoloed;
                        return (
                          <div key={name} className={`flex items-center gap-2 p-2.5 rounded-lg border transition-opacity ${
                            dimmed ? "opacity-40 bg-secondary/30 border-border/20" : "bg-secondary/50 border-border/40"
                          }`}>
                            {/* Play/stop individual stem */}
                            <button
                              onClick={() => handlePlayStem(name, blob)}
                              className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors border ${
                                stemPlaying
                                  ? "bg-amber-500 border-amber-500 text-black"
                                  : "border-border/50 hover:bg-secondary text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {stemPlaying
                                ? <Square className="w-3 h-3 fill-current" />
                                : <Play className="w-3 h-3" />}
                            </button>
                            {/* Track label */}
                            <div className="flex-1 min-w-0">
                              <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{meta.description}</p>
                            </div>
                            {/* Solo button */}
                            <button
                              title={isSoloed ? "Un-solo" : "Solo this track"}
                              onClick={() => {
                                stopAllAudio();
                                setSoloedStem(prev => prev === name ? null : name);
                              }}
                              className={`w-7 h-7 rounded text-[10px] font-bold shrink-0 transition-colors border ${
                                isSoloed
                                  ? "bg-yellow-400 border-yellow-400 text-black"
                                  : "border-border/50 text-muted-foreground hover:text-foreground hover:border-yellow-400"
                              }`}
                            >S</button>
                            {/* Mute button */}
                            <button
                              title={isMuted ? "Unmute" : "Mute this track"}
                              onClick={() => {
                                stopAllAudio();
                                setMutedStems(prev => {
                                  const next = new Set(prev);
                                  if (next.has(name)) next.delete(name); else next.add(name);
                                  return next;
                                });
                              }}
                              className={`w-7 h-7 rounded text-[10px] font-bold shrink-0 transition-colors border ${
                                isMuted
                                  ? "bg-zinc-600 border-zinc-500 text-white"
                                  : "border-border/50 text-muted-foreground hover:text-foreground hover:border-zinc-500"
                              }`}
                            >M</button>
                            {/* Download WAV */}
                            <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 px-2" onClick={() => handleDownloadStem(name, blob)}>
                              <Download className="w-3 h-3 mr-1" />WAV
                            </Button>
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

                    {/* Waveform Scrubber */}
                    <div className="rounded-xl overflow-hidden border border-border/30 bg-black/30 p-3 space-y-1.5">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Processed Waveform</p>
                        {isPlaying && abMode === "processed" && (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live
                          </span>
                        )}
                      </div>
                      <WaveformScrubber
                        ref={scrubberRef}
                        points={waveformAfter}
                        duration={duration}
                        onSeek={handleSeek}
                        accentColor="#f59e0b"
                        height={88}
                      />
                    </div>

                    {/* A/B Comparison */}
                    {originalUrl && processedUrl && (
                      <div className="rounded-lg bg-secondary/30 border border-border/30 overflow-hidden">
                        <div className="flex items-center justify-between px-3 pt-3 pb-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">A/B Compare</p>
                          {isSampleResult && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-sky-500/30 text-sky-400">
                              30s Sample
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2 px-3 pb-3">
                          <button
                            onClick={() => handlePlayAb("original")}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-semibold transition-all ${
                              isPlaying && abMode === "original"
                                ? "bg-amber-500 border-amber-500 text-black"
                                : "border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                            }`}
                          >
                            {isPlaying && abMode === "original"
                              ? <><Square className="w-3.5 h-3.5 fill-current" /> Stop</>
                              : <><Play className="w-3.5 h-3.5" /> Original</>}
                          </button>
                          <button
                            onClick={() => handlePlayAb("processed")}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border text-sm font-semibold transition-all ${
                              isPlaying && abMode === "processed"
                                ? "bg-emerald-500 border-emerald-500 text-black"
                                : "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                            }`}
                          >
                            {isPlaying && abMode === "processed"
                              ? <><Square className="w-3.5 h-3.5 fill-current" /> Stop</>
                              : <><Play className="w-3.5 h-3.5" /> Processed</>}
                          </button>
                        </div>
                        <div className="flex text-[10px] text-center border-t border-border/20">
                          <div className="flex-1 py-1.5 text-amber-400/60">← tap to compare</div>
                          <div className="flex-1 py-1.5 text-emerald-400/60">tap to compare →</div>
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

                    {/* Plugin Chain Rack */}
                    <div className="rounded-xl border border-border/30 overflow-hidden">
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2.5 bg-secondary/20 hover:bg-secondary/30 transition-colors"
                        onClick={() => setShowPlugins(v => !v)}
                      >
                        <Plug className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-xs font-bold text-left flex-1">Plugin Chain</span>
                        {(plugins.eq.enabled || plugins.comp.enabled || plugins.reverb.enabled || plugins.limiter.enabled) && (
                          <span className="text-[9px] font-bold text-violet-400 bg-violet-500/15 border border-violet-500/25 px-1.5 py-0.5 rounded-full">ACTIVE</span>
                        )}
                        <span className="text-[10px] text-muted-foreground">{showPlugins ? "▲" : "▼"}</span>
                      </button>
                      {showPlugins && (
                        <div className="p-3 border-t border-border/20">
                          <StudioPluginRack
                            plugins={plugins}
                            onChange={updatePlugin}
                            isPro={isPro}
                            hasSplits={hasSplits}
                          />
                        </div>
                      )}
                    </div>

                    {/* Download */}
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" className="flex-1" onClick={() => handlePlayProcessed()} data-testid="button-play">
                        {isPlaying ? <><Square className="w-4 h-4 mr-2" />Stop</> : <><Play className="w-4 h-4 mr-2" />Preview</>}
                      </Button>
                      {((mode === "master" && !isSampleResult) || mode === "voice_remove" || (mode === "standard" && isPro)) ? (
                        <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={handleDownload} data-testid="button-download">
                          <Download className="w-4 h-4 mr-2" /> Download {processedFormat.toUpperCase()}
                        </Button>
                      ) : (
                        <Link href="/pricing" className="flex-1">
                          <Button variant="outline" className="w-full border-amber-500/30 text-amber-500" data-testid="button-upgrade-download">
                            <Lock className="w-4 h-4 mr-2" /> {mode === "master" ? "Subscribe to Download Full Master" : "Upgrade to Download"}
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
        {/* ── Live Vocal Monitor ── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border/30 bg-card/40 overflow-hidden">
            <div
              className="relative h-24 overflow-hidden"
              style={{ backgroundImage: "url(https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&q=80)", backgroundSize: "cover", backgroundPosition: "center" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-transparent" />
              <div className="relative z-10 flex items-center gap-4 h-full px-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <Mic2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Live Vocal Monitor</h3>
                  <p className="text-xs text-muted-foreground">Sing or speak through 6 voice presets — compressor, 3-band EQ, reverb, echo — in real time</p>
                </div>
                <div className="ml-auto hidden sm:flex items-center gap-1.5">
                  {["EQ", "COMP", "REVERB", "ECHO"].map(tag => (
                    <span key={tag} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
            <CardContent className="p-4">
              <LiveVocalMonitor />
            </CardContent>
          </Card>
        </motion.div>

      </motion.div>

      {/* ── Paywall funnel ── */}
      <AnimatePresence>
        {paywall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setPaywall(null)}
            data-testid="paywall-overlay"
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-card shadow-2xl overflow-hidden"
            >
              <div className="relative h-28 overflow-hidden">
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#3b2a05 0%,#1a1304 100%)" }} />
                <div className="relative z-10 flex flex-col items-center justify-center h-full gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                    <Lock className="w-6 h-6 text-amber-400" />
                  </div>
                  <h3 className="text-base font-bold text-white">
                    {paywall.code === "UPGRADE_REQUIRED"
                      ? "Studio subscription required"
                      : paywall.feature === "voice_remove" ? "Free voice removals used"
                      : paywall.feature === "stem_split" ? "Free stem split used"
                      : "Free master used"}
                  </h3>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  {paywall.message || "You've reached your free limit. Subscribe for unlimited access."}
                </p>

                <div className="space-y-2">
                  <Link href="/pricing">
                    <button className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer text-left">
                      <div>
                        <div className="text-sm font-bold text-amber-300">GravelKing Weekly</div>
                        <div className="text-[11px] text-muted-foreground">Unlimited voice removal, stem splitting & preset masters</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-white">$9.99</div>
                        <div className="text-[10px] text-muted-foreground">/week</div>
                      </div>
                    </button>
                  </Link>
                  <Link href="/pricing">
                    <button className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-sky-500/40 bg-sky-500/5 hover:bg-sky-500/15 transition-colors cursor-pointer text-left">
                      <div>
                        <div className="text-sm font-bold text-sky-300">GravelKing Studio</div>
                        <div className="text-[11px] text-muted-foreground">Everything in Weekly + adjustable mastering & live DAW</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-white">$29.99</div>
                        <div className="text-[10px] text-muted-foreground">/month</div>
                      </div>
                    </button>
                  </Link>
                </div>

                <button
                  onClick={() => setPaywall(null)}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                  data-testid="button-paywall-dismiss"
                >
                  {processedBlob || stemBlobs.length > 0
                    ? "Maybe later — keep my earlier free download"
                    : "Maybe later"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
