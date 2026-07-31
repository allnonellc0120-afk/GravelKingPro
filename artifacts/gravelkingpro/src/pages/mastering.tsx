import { useState, useRef, useCallback, useMemo } from "react";
import { styleAuthorshipScore } from "@workspace/authorship";
import { BeforeAfterDemo } from "@/components/before-after-demo";
import { Layout } from "@/components/layout";
import { ToolHelp } from "@/components/tool-help";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, Wand2, CheckCircle2, AlertCircle, FileDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import { downloadUrl } from "@/lib/download";
import { compressAudioFile, shouldCompress } from "@/lib/audioCompressor";
import { EmailGate, useEmailGate } from "@/components/email-gate";
import { Link } from "wouter";

type State = "idle" | "compressing" | "processing" | "done" | "error";

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
  const emailGate = useEmailGate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [preset, setPreset] = useState<PresetId>("baseline");
  const [denoiseOn, setDenoiseOn] = useState(false);
  const [certifyOn, setCertifyOn] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [stylePrompt, setStylePrompt] = useState("");

  const styleScore = useMemo(() => styleAuthorshipScore(stylePrompt), [stylePrompt]);

  const processFile = useCallback(async (file: File, selectedPreset: PresetId, denoise: boolean, style: string, certify: boolean) => {
    setFileName(file.name);
    setResultUrl(null);
    setErrorMsg("");

    let uploadFile = file;

    // If the file is large, compress client-side before upload so it sails
    // through the production proxy limit (~30 MB).
    if (shouldCompress(file)) {
      setState("compressing");
      setProgress(5);
      try {
        uploadFile = await compressAudioFile(file, {
          targetRate: 22050,
          mono: true,
          onProgress: (pct) => setProgress(Math.round(pct * 0.4)), // 0–40%
        });
      } catch (err: any) {
        setState("error");
        const msg = err.message ?? "Compression failed";
        setErrorMsg(msg);
        toast({ title: "Pre-processing failed", description: msg, variant: "destructive" });
        return;
      }
    }

    setState("processing");
    setProgress(40);

    const fd = new FormData();
    fd.append("audio", uploadFile);
    fd.append("mode", "master");
    fd.append("preset", selectedPreset);
    fd.append("denoise", String(denoise));
    fd.append("stylePrompt", style);
    if (certify) {
      fd.append("certify", "true");
      // Checking the certify box IS the ownership assertion.
      fd.append("author_assertion", "true");
    }

    // 3-minute hard cap — keeps mobile browsers from hanging forever when the
    // tab is backgrounded or the connection stalls mid-upload/download.
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, 180_000);

    // Slow-crawl the progress bar while the server is working so the user
    // knows the page hasn't frozen. Stops at 85 to leave room for the
    // "response received" jump to 95.
    let crawlValue = 40;
    const crawlId = setInterval(() => {
      crawlValue = Math.min(85, crawlValue + 1);
      setProgress(crawlValue);
    }, 800);

    try {
      const resp = await fetch("/api/kernel/master", {
        method: "POST",
        body: fd,
        credentials: "include",
        signal: controller.signal,
      });

      clearInterval(crawlId);
      setProgress(95);

      if (resp.status === 403) {
        const data = await resp.json().catch(() => ({})) as { code?: string };
        if (data.code === "EMAIL_REQUIRED") { emailGate.forceGate(); return; }
      }
      if (resp.status === 402) {
        const data = await resp.json() as { error: string };
        setState("error");
        setErrorMsg(data.error ?? "Free limit reached.");
        return;
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const data = text.startsWith("{") ? (JSON.parse(text) as { error?: string }) : { error: text || "Processing failed" };
        throw new Error(data.error ?? "Processing failed");
      }

      const rem = resp.headers.get("X-GK-Free-Remaining");
      if (rem !== null) setRemaining(parseInt(rem));

      // The server always streams the mastered WAV back — it plays and
      // downloads right here in the app, no external link.
      const blob = await resp.blob();
      setResultUrl(URL.createObjectURL(blob));
      setState("done");
      setProgress(100);
    } catch (err: any) {
      clearInterval(crawlId);
      setState("error");
      const name = (err as { name?: string } | null)?.name;
      const isAbort = timedOut || name === "AbortError" || name === "TimeoutError";
      const msg = isAbort
        ? "Mastering took too long. Keep the app open while processing, or try a shorter clip."
        : (err.message ?? "Something went wrong.");
      setErrorMsg(msg);
      toast({ title: "Mastering failed", description: msg, variant: "destructive" });
    } finally {
      clearTimeout(timeoutId);
    }
  }, [toast]);

  const handleFile = (files: FileList | null) => {
    if (!files?.length) return;
    const f = files[0];
    setPendingFile(f);
    setFileName(f.name);
    // The user's own upload IS the "before" — playable immediately on selection.
    setBeforeUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
    setState("idle");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files);
  };

  const startMastering = () => {
    if (pendingFile) processFile(pendingFile, preset, denoiseOn, stylePrompt, certifyOn);
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
    setBeforeUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setErrorMsg("");
    setPendingFile(null);
  };

  if (emailGate.gated) {
    return (
      <Layout>
        <EmailGate tool="mastering" onUnlocked={emailGate.unlock} />
      </Layout>
    );
  }

  const busy = state === "compressing" || state === "processing";
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
            <ToolHelp
              title="Mastering"
              summary="Runs a professional mastering chain — EQ, compression and loudness, with optional denoise — to polish a finished mix."
              steps={[
                "Upload your mixed-down track.",
                "Choose a preset that matches the genre or feel.",
                "Preview the master, then download it.",
              ]}
              note="Runs locally with MLK v3 — your audio is never uploaded to a third party."
            />
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
                  <p className="text-xs text-muted-foreground mt-1">MP3, WAV, FLAC · up to 30 MB on server</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Files over ~30 MB may fail — try shorter clips if needed</p>
                </div>
                <Button variant="outline" className="border-sky-500/40 text-sky-400 hover:bg-sky-500/10" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Choose File
                </Button>
              </CardContent>
            </Card>
            <input ref={fileInputRef} type="file" accept=".mp3,.wav,.flac,.m4a,.mp4,.mov,.m4v,.avi,.mkv,.webm,.wmv,.flv,.ogg,.aiff,.aac" className="hidden" onChange={(e) => handleFile(e.target.files)} />
          </motion.div>
        ) : null}

        {/* Preset selector + settings (shown after file picked, before processing) */}
        {pendingFile && state === "idle" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {beforeUrl && (
              <div className="rounded-lg border border-border/30 bg-card/30 p-3 space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground">Your upload — play it to hear the before</p>
                <audio src={beforeUrl} controls className="w-full h-9" preload="metadata" />
              </div>
            )}
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

            {/* Ownership certification (opt-in) — off by default so karaoke,
                covers, and reference mixes master with no copyright check and
                no watermark. */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-card/30">
              <input
                type="checkbox"
                id="certify"
                checked={certifyOn}
                onChange={(e) => setCertifyOn(e.target.checked)}
                className="w-4 h-4 accent-sky-500 mt-0.5"
              />
              <label htmlFor="certify" className="text-sm cursor-pointer">
                Certify this as my original work <span className="text-muted-foreground">(optional) — runs a copyright check and embeds an IP ownership certificate in the WAV. Leave off for karaoke, covers, or remixes.</span>
              </label>
            </div>

            {/* ── Human Authorship — Style Prompt ───────────────────────── */}
            <div className="space-y-2 p-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-indigo-300">Instrumental Style Prompt</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Describe how you directed the instrumental. The more specific, the stronger your copyright claim.
                  </p>
                </div>
                {stylePrompt.trim() && (
                  <div className={`shrink-0 text-right ${styleScore.eligible ? "text-emerald-400" : "text-amber-400"}`}>
                    <p className="text-lg font-black leading-none">{styleScore.score}</p>
                    <p className="text-[9px] leading-none mt-0.5 opacity-70">/ 100</p>
                  </div>
                )}
              </div>

              <textarea
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                placeholder={`e.g. "Outlaw grunge at 98 BPM in E minor — acoustic guitar intro, electric lead in verse, heavy distorted chorus with tight snare and ride cymbal, brooding and raw production"`}
                rows={3}
                className="w-full text-xs bg-background/60 border border-indigo-500/20 rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-indigo-500/50"
              />

              {stylePrompt.trim() && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={styleScore.eligible ? "text-emerald-400" : "text-amber-400"}>
                      {styleScore.label}
                    </span>
                    <span className="text-muted-foreground/60">
                      {styleScore.eligible ? "✓ Copyright eligible" : "Add more specifics"}
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-indigo-500/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        styleScore.score >= 75 ? "bg-emerald-400" :
                        styleScore.score >= 50 ? "bg-sky-400" :
                        styleScore.score >= 25 ? "bg-amber-400" : "bg-red-400/60"
                      }`}
                      style={{ width: `${styleScore.score}%` }}
                    />
                  </div>
                  {/* Breakdown chips */}
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {(Object.entries(styleScore.breakdown) as [string, number][])
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => (
                        <span key={k} className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {k} +{v}
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {!stylePrompt.trim() && (
                <p className="text-[10px] text-muted-foreground/50 italic">
                  Optional but recommended — embedded in the IP cert with your track. Helps prove human creative direction in court.
                </p>
              )}
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

        {/* Compressing / Processing */}
        <AnimatePresence>
          {state === "compressing" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="py-10 space-y-4 text-center">
                  <p className="text-sm text-muted-foreground"><FileDown className="w-4 h-4 inline mr-1 text-amber-400" />Compressing for upload…</p>
                  <p className="text-xs text-muted-foreground/70">{fileName} is large — pre-processing locally so it uploads fast.</p>
                  <Progress value={progress} className="h-1.5" />
                </CardContent>
              </Card>
            </motion.div>
          )}
          {state === "processing" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="border-sky-500/20 bg-sky-500/5">
                <CardContent className="py-10 space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">Mastering with <span className="text-sky-400 font-medium">{selectedPreset.label}</span>…</p>
                  <p className="text-xs text-muted-foreground/70">{fileName}</p>
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">Processing on the server — keep this page open until it finishes.</p>
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

                {beforeUrl && (
                  <BeforeAfterDemo
                    before={{ label: "Before", sub: "Your original upload", src: beforeUrl }}
                    after={{ label: "After", sub: `MLK v3 — ${selectedPreset.label}`, src: resultUrl }}
                    heading="Hear the difference"
                    sub="Your track — toggle before vs after mastering."
                  />
                )}

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
        {/* ── SEO content — always rendered ── */}
        <div className="mt-12 border-t border-border/20 pt-8 space-y-10 text-sm">

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground/90">How audio mastering works</h2>
            <p className="text-muted-foreground leading-relaxed">
              GravelKing Pro applies the{" "}
              <strong className="text-foreground/70">MLK v3 multi-band kernel</strong> server-side
              to your uploaded audio. The process runs a loudness pass targeting your chosen preset's
              LUFS standard, applies multi-band compression and EQ shaping, optionally runs a
              spectral denoise sweep, and returns a fully processed WAV — all without requiring
              any plug-ins or a DAW on your device.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Every preset matches a specific delivery platform or aesthetic. Baseline is a
              good default for anything going to streaming. Broadcast follows the EBU R128 standard
              used by television and radio. YouTube targets –14 LUFS, and SoundCloud targets –11 LUFS
              for the loudest allowed level on that platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground/90">Preset guide</h2>
            <div className="grid grid-cols-1 gap-2">
              {[
                { name: "Baseline",    desc: "Balanced +10% low-end boost, targeting YouTube loudness. Good all-purpose starting point." },
                { name: "Normal",      desc: "Neutral loudness curve for any content where you want minimal coloration." },
                { name: "Broadcast",   desc: "EBU R128 compliant at –23 LUFS. Required for TV, podcast distribution, and terrestrial radio." },
                { name: "Vinyl",       desc: "Warm analog-style processing with boosted lows and soft high-end roll-off." },
                { name: "Podcast",     desc: "Optimised for voice clarity: gentle compression, reduced room noise, and speech presence boost." },
                { name: "Club",        desc: "Heavy sub-bass, punchy transient shaping, and loud overall level for PA systems." },
                { name: "Film",        desc: "Wide cinematic dynamics with restrained limiting — preserves peaks for sync licensing." },
                { name: "YouTube",     desc: "–14 LUFS integrated loudness, the level at which YouTube's normalizer stops reducing volume." },
                { name: "SoundCloud",  desc: "–11 LUFS · the loudest level allowed before SoundCloud's compressor kicks in." },
                { name: "Apple Music", desc: "–16 LUFS per Apple Sound Check. Ensures your track is not attenuated on Apple devices." },
                { name: "Spacious",    desc: "Reverb tail and stereo widener for ambient, orchestral, or lo-fi tracks needing space." },
              ].map(p => (
                <div key={p.name} className="flex gap-3">
                  <span className="w-24 shrink-0 font-medium text-foreground/70">{p.name}</span>
                  <span className="text-muted-foreground leading-relaxed">{p.desc}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground/90">Supported file types and output</h2>
            <p className="text-muted-foreground leading-relaxed">
              Upload any of: <strong className="text-foreground/70">MP3, WAV, FLAC, M4A, AAC, OGG, AIFF, OPUS</strong>.
              Video files (MP4, MOV) are also accepted. Free-tier users receive a 30-second preview WAV
              to evaluate the preset before committing.{" "}
              <Link href="/pricing" className="text-sky-400 hover:underline">GravelKing Pro</Link>{" "}
              returns the full-length master as a 16-bit stereo 44.1 kHz WAV, ready for distribution
              or further editing in any DAW.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground/90">Common use cases</h2>
            <ul className="text-muted-foreground space-y-1.5 list-disc list-inside leading-relaxed">
              <li>Prepare a final track for streaming release on Spotify, Apple Music, or YouTube</li>
              <li>Match loudness across an EP or album so every track feels consistent</li>
              <li>Get broadcast-compliant levels for a podcast episode or radio submission</li>
              <li>Add warmth and analog character to a digital beat or sample-based track</li>
              <li>Master a backing track from the <Link href="/vocal-booth" className="text-sky-400 hover:underline">Vocal Booth</Link> for release or sync licensing</li>
              <li>Run a quick loudness check before submitting to a label or sync library</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground/90">Frequently asked questions</h2>

            <div className="space-y-1">
              <h3 className="font-medium text-foreground/80">What does the Denoise option do?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Enabling Denoise runs a spectral subtraction pass before mastering, reducing
                broadband noise, hiss, and room tone. It works best on vocal recordings and
                acoustic instruments. For heavily produced electronic tracks, leave it off — it
                can subtly affect the texture of synthesised pads and cymbals.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-medium text-foreground/80">Will mastering fix a poorly mixed track?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Mastering optimises the final output level, frequency balance, and stereo image of
                a mix that is already well-balanced. It cannot repair a mix where individual
                elements clash, where the low end is undefined, or where there is clipping in the
                source file. If your track needs significant tonal correction, mix it first in a DAW
                and then master here.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-medium text-foreground/80">Is the 30-second free preview the whole master?</h3>
              <p className="text-muted-foreground leading-relaxed">
                The preview is a 30-second excerpt taken from the start of the master, processed at
                full quality so you can evaluate how the preset sounds on your track before
                upgrading. The output format, loudness target, and processing chain are identical
                to what you receive on a full download with a Pro subscription.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-medium text-foreground/80">Which preset should I choose for Spotify?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Spotify normalises playback to –14 LUFS (similar to YouTube) so the YouTube preset
                is a good match. You can also use Baseline, which targets a similar level with a
                slightly warmer low-end. Avoid very loud presets like SoundCloud (–11 LUFS) if
                Spotify is your primary platform — they will be turned down during playback.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground/90">Related tools</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Vocal Booth", href: "/vocal-booth" },
                { label: "Live DAW", href: "/studio" },
                { label: "Songwriting Studio", href: "/songwriting" },
                { label: "Pricing", href: "/pricing" },
              ].map(({ label, href }) => (
                <Link key={href} href={href}>
                  <span className="inline-flex items-center rounded-md border border-border/30 px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors">
                    {label}
                  </span>
                </Link>
              ))}
            </div>
          </section>

        </div>
      </div>
    </Layout>
  );
}
