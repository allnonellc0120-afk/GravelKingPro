import { useState, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, Wand2, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import { downloadUrl } from "@/lib/download";
import { Link } from "wouter";

type State = "idle" | "processing" | "done" | "error";

const PRESETS = [
  { id: "baseline",   label: "Baseline",    desc: "Balanced +10% low end, YouTube loudness",   free: true,  accent: "#38bdf8" },
  { id: "normal",     label: "Normal",      desc: "Balanced loudness for any content",          free: true,  accent: "#94a3b8" },
  { id: "broadcast",  label: "Broadcast",   desc: "EBU R128 · –23 LUFS",                       free: false, accent: "#3b82f6" },
  { id: "vinyl",      label: "Vinyl",       desc: "Warm analog character, boosted lows",        free: false, accent: "#f59e0b" },
  { id: "podcast",    label: "Podcast",     desc: "Voice clarity, dynamic compression",         free: false, accent: "#22c55e" },
  { id: "club",       label: "Club",        desc: "Heavy bass, punchy transients",              free: false, accent: "#a855f7" },
  { id: "film",       label: "Film",        desc: "Wide cinematic dynamics",                    free: false, accent: "#ef4444" },
  { id: "youtube",    label: "YouTube",     desc: "–14 LUFS loudness standard",                free: false, accent: "#ff0000" },
  { id: "soundcloud", label: "SoundCloud",  desc: "–11 LUFS · loud & punchy",                  free: false, accent: "#ff5500" },
  { id: "apple",      label: "Apple Music", desc: "–16 LUFS · Sound Check standard",           free: false, accent: "#fc3c44" },
  { id: "spacious",   label: "Spacious",    desc: "Reverb + stereo widener",                   free: false, accent: "#a78bfa" },
] as const;

type PresetId = (typeof PRESETS)[number]["id"];

export default function Mastering() {
  const { isPro } = useAppState();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [preset, setPreset] = useState<PresetId>("baseline");
  const [denoiseOn, setDenoiseOn] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const processFile = useCallback(async (file: File, selectedPreset: PresetId, denoise: boolean) => {
    setFileName(file.name);
    setState("processing");
    setProgress(20);
    setResultUrl(null);
    setErrorMsg("");

    const fd = new FormData();
    fd.append("audio", file);
    fd.append("mode", "master");
    fd.append("preset", selectedPreset);
    fd.append("denoise", String(denoise));

    try {
      setProgress(50);
      const resp = await fetch("/api/kernel/master", {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      setProgress(90);

      if (resp.status === 402) {
        const data = await resp.json() as { error: string };
        setState("error");
        setErrorMsg(data.error ?? "Free limit reached.");
        return;
      }
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Processing failed");
      }

      const rem = resp.headers.get("X-GK-Free-Remaining");
      if (rem !== null) setRemaining(parseInt(rem));

      const blob = await resp.blob();
      setResultUrl(URL.createObjectURL(blob));
      setState("done");
      setProgress(100);
    } catch (err: any) {
      setState("error");
      setErrorMsg(err.message ?? "Something went wrong.");
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const handleFile = (files: FileList | null) => {
    if (!files?.length) return;
    setPendingFile(files[0]);
    setFileName(files[0].name);
    setState("idle");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files);
  };

  const startMastering = () => {
    if (pendingFile) processFile(pendingFile, preset, denoiseOn);
  };

  const download = () => {
    if (!resultUrl) return;
    downloadUrl(resultUrl, `gravelking_mastered_${preset}.wav`);
  };

  const reset = () => {
    setState("idle");
    setProgress(0);
    setFileName("");
    setResultUrl(null);
    setErrorMsg("");
    setPendingFile(null);
  };

  const busy = state === "processing";
  const selectedPreset = PRESETS.find(p => p.id === preset)!;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-sky-400" />
            <h1 className="text-2xl font-bold tracking-tight">Mastering</h1>
            {!isPro && (
              <Badge variant="outline" className="text-[10px] border-sky-500/30 text-sky-400">
                1 free download
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Apply a professional mastering chain with optional denoise. Runs locally with MLK v3 — no upload to third parties.
          </p>
        </div>

        {/* File drop / file picked */}
        {!pendingFile && !busy && state !== "done" ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              className="border-2 border-dashed border-sky-500/30 bg-sky-500/5 hover:border-sky-500/60 hover:bg-sky-500/10 transition-all cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <CardContent className="py-14 flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-sky-500/10 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-sky-400" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Drop your track here</p>
                  <p className="text-xs text-muted-foreground mt-1">MP3, WAV, FLAC · up to 100 MB</p>
                </div>
                <Button variant="outline" className="border-sky-500/40 text-sky-400 hover:bg-sky-500/10" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Choose File
                </Button>
              </CardContent>
            </Card>
            <input ref={fileInputRef} type="file" accept=".mp3,.wav,.flac,.m4a,.ogg,.aiff,.aac" className="hidden" onChange={(e) => handleFile(e.target.files)} />
          </motion.div>
        ) : null}

        {/* Preset selector + settings (shown after file picked, before processing) */}
        {pendingFile && state === "idle" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate">{fileName}</span>
              <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground ml-3 shrink-0">Change</button>
            </div>

            {/* Preset grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESETS.map((p) => {
                const locked = !p.free && !isPro;
                return (
                  <button
                    key={p.id}
                    disabled={locked}
                    onClick={() => !locked && setPreset(p.id)}
                    className={`relative text-left p-3 rounded-xl border transition-all text-xs ${
                      preset === p.id && !locked
                        ? "border-sky-500/60 bg-sky-500/10"
                        : "border-border/30 bg-card/30 hover:border-border/60"
                    } ${locked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <span className="font-semibold block mb-0.5" style={{ color: locked ? undefined : p.accent }}>{p.label}</span>
                    <span className="text-muted-foreground leading-tight">{p.desc}</span>
                    {locked && <span className="absolute top-2 right-2 text-[9px] text-muted-foreground/60">Pro</span>}
                  </button>
                );
              })}
            </div>

            {/* Denoise toggle */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-card/30">
              <input
                type="checkbox"
                id="denoise"
                checked={denoiseOn}
                onChange={(e) => setDenoiseOn(e.target.checked)}
                className="w-4 h-4 accent-sky-500"
              />
              <label htmlFor="denoise" className="text-sm cursor-pointer">
                Denoise — remove background hiss and hum before mastering
              </label>
            </div>

            <Button
              onClick={startMastering}
              className="w-full bg-sky-600 hover:bg-sky-700 font-semibold"
            >
              <Wand2 className="w-4 h-4 mr-2" /> Master with {selectedPreset.label}
            </Button>

            {!isPro && (
              <p className="text-xs text-center text-muted-foreground">
                Free tier: 1 full download. <Link href="/pricing" className="text-sky-400 hover:underline">Upgrade</Link> for unlimited + all presets.
              </p>
            )}
          </motion.div>
        )}

        {/* Processing */}
        <AnimatePresence>
          {busy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="border-sky-500/20 bg-sky-500/5">
                <CardContent className="py-10 space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">Mastering with <span className="text-sky-400 font-medium">{selectedPreset.label}</span>…</p>
                  <p className="text-xs text-muted-foreground/70">{fileName}</p>
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">Local processing — your audio stays on the server.</p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Done */}
        {state === "done" && resultUrl && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="py-8 space-y-5">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Mastered — {selectedPreset.label}</p>
                    <p className="text-xs text-muted-foreground">{fileName}</p>
                  </div>
                  {remaining !== null && !isPro && (
                    <Badge variant="outline" className="ml-auto text-[10px] border-sky-500/30 text-sky-400">
                      {remaining} free left
                    </Badge>
                  )}
                </div>

                <audio src={resultUrl} controls className="w-full h-10" />

                <div className="flex gap-3">
                  <Button onClick={download} className="flex-1 bg-sky-600 hover:bg-sky-700">
                    <Download className="w-4 h-4 mr-2" /> Download WAV
                  </Button>
                  <Button variant="outline" onClick={reset} className="border-border/40">New File</Button>
                </div>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Just mastered my track with GravelKing Pro 🎚️ Server-side mastering, no plugins needed — free to try → gravelkingpro.it.com #MusicProduction #Mastering #AudioEngineering #BeatMaker")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-md border border-border/40 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  Post your result to X
                </a>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Error */}
        {state === "error" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="py-8 space-y-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <p className="text-sm text-red-400">{errorMsg}</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={reset} className="border-border/40">Try Again</Button>
                  {errorMsg.toLowerCase().includes("limit") && (
                    <Link href="/pricing">
                      <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">Upgrade</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Info strip */}
        <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
          {[
            { label: "11 presets", desc: "Platform-tuned targets" },
            { label: "100% local", desc: "Runs on your server" },
            { label: "MLK v3", desc: "Multi-band processing" },
          ].map((i) => (
            <div key={i.label} className="p-3 rounded-lg border border-border/20 bg-card/30 space-y-1">
              <p className="font-medium text-foreground/80">{i.label}</p>
              <p>{i.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
