import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/layout";
import { ToolHelp } from "@/components/tool-help";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Download, Upload, Mic2, CheckCircle2, AlertCircle,
  FileText, Wand2, Scissors, Play, Pause, Volume2, VolumeX,
  Crown, ArrowRight, RefreshCcw, Send,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import { useSplitter, type SplitStage } from "@/lib/splitterStore";
import { downloadBlob } from "@/lib/download";
import { Link, useLocation } from "wouter";

// ── Stage config ───────────────────────────────────────────────────────────────

interface StageInfo {
  key: SplitStage;
  label: string;
  detail: string;
  Icon: React.ElementType;
}

const STAGES: StageInfo[] = [
  { key: "uploading",  label: "Upload",           detail: "Sending your track…",           Icon: Upload   },
  { key: "analyzing",  label: "AI Analyzing",      detail: "Reading audio format & length…", Icon: Wand2    },
  { key: "splitting",  label: "Splitting",          detail: "Neural stem separation running…",Icon: Scissors },
  { key: "lyrics",     label: "Lyric Prediction",  detail: "Transcribing vocal stem…",       Icon: FileText },
];

const ACTIVE_STAGES = new Set<SplitStage>(["uploading","analyzing","splitting","lyrics"]);

// ── Progress bar for a running stage ─────────────────────────────────────────

function StageBar({ stage }: { stage: SplitStage }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    setPct(0);
    const durations: Partial<Record<SplitStage, number>> = {
      uploading: 3000, analyzing: 3000, splitting: 90_000, lyrics: 12_000,
    };
    const dur = durations[stage] ?? 5000;
    const interval = 200;
    const step = (interval / dur) * 90;
    const id = setInterval(() => setPct(p => Math.min(90, p + step)), interval);
    return () => clearInterval(id);
  }, [stage]);
  return (
    <div className="w-full h-1 bg-border/30 rounded-full overflow-hidden mt-2">
      <motion.div
        className="h-full bg-purple-500 rounded-full"
        animate={{ width: `${pct}%` }}
        transition={{ ease: "linear" }}
      />
    </div>
  );
}

// ── Single audio player card ──────────────────────────────────────────────────

interface PlayerProps {
  label: string;
  icon: React.ElementType;
  color: string;
  url: string;
  blob: Blob;
  filename: string;
  volume: number;
  onVolumeChange: (v: number) => void;
  audioRef: React.RefObject<HTMLAudioElement>;
}

function StemPlayer({ label, icon: Icon, color, url, blob, filename, volume, onVolumeChange, audioRef }: PlayerProps) {
  const [playing, setPlaying] = useState(false);
  const muted = volume === 0;

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, audioRef]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { void audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div className={`rounded-xl border ${color} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span className="font-semibold text-sm">{label}</span>
        {muted && <Badge variant="outline" className="text-[10px] ml-auto border-yellow-500/30 text-yellow-400">Muted</Badge>}
      </div>
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} className="hidden" />
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={toggle} className="w-9 h-9 p-0 shrink-0 border-border/40">
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </Button>
        <div className="flex items-center gap-2 flex-1">
          {muted ? <VolumeX className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <Volume2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          <Slider
            value={[Math.round(volume * 100)]}
            min={0} max={100} step={1}
            onValueChange={([v]) => onVolumeChange(v / 100)}
            className="flex-1"
          />
          <span className="text-[10px] text-muted-foreground w-7 text-right">{Math.round(volume * 100)}%</span>
        </div>
      </div>
      <Button
        size="sm" variant="outline"
        onClick={() => downloadBlob(blob, filename)}
        className="w-full h-8 text-xs border-border/40 gap-1.5"
      >
        <Download className="w-3 h-3" /> Download {label}
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VoiceRemoval() {
  const { hasSplits } = useAppState();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { stage, fileName, stems, errorMsg, processFile, reset: resetSplit } = useSplitter();

  const [vocalVol, setVocalVol]   = useState(1);
  const [instrVol, setInstrVol]   = useState(1);
  const [bothPlaying, setBothPlaying] = useState(false);
  const [singAlong, setSingAlong] = useState(false);

  const vocalRef = useRef<HTMLAudioElement>(null);
  const instrRef = useRef<HTMLAudioElement>(null);

  // The store owns the error text; surface it once as a toast when it appears.
  const lastToastedError = useRef<string>("");
  useEffect(() => {
    if (stage === "error" && errorMsg && errorMsg !== lastToastedError.current) {
      lastToastedError.current = errorMsg;
      toast({ title: "Split failed", description: errorMsg, variant: "destructive" });
    } else if (stage !== "error") {
      lastToastedError.current = "";
    }
  }, [stage, errorMsg, toast]);

  const handleFile = (files: FileList | null) => {
    if (!files?.length) return;
    void processFile(files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files);
  };

  const reset = () => {
    resetSplit();
    setSingAlong(false);
    setBothPlaying(false);
    if (vocalRef.current) vocalRef.current.pause();
    if (instrRef.current) instrRef.current.pause();
  };

  const playBoth = () => {
    if (bothPlaying) {
      vocalRef.current?.pause();
      instrRef.current?.pause();
      setBothPlaying(false);
    } else {
      void Promise.allSettled([vocalRef.current?.play(), instrRef.current?.play()]);
      setBothPlaying(true);
    }
  };

  const toggleSingAlong = () => {
    const next = !singAlong;
    setSingAlong(next);
    setVocalVol(next ? 0 : 1);
    if (vocalRef.current) vocalRef.current.volume = next ? 0 : 1;
    if (next) {
      void instrRef.current?.play();
      setBothPlaying(true);
    }
  };

  const sendToSongwriting = () => {
    if (!stems?.lyrics) return;
    try {
      localStorage.setItem("gk:prefill:split_lyrics", JSON.stringify({
        text: stems.lyrics,
        filename: stems.filename,
      }));
    } catch {}
    navigate("/songwriting");
  };

  const stageIndex = STAGES.findIndex(s => s.key === stage);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Header ── */}
        <div className="flex items-center gap-2">
          <Mic2 className="w-5 h-5 text-purple-400" />
          <h1 className="text-2xl font-bold tracking-tight">Voice Splitter</h1>
          {!hasSplits && (
            <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">1 free</Badge>
          )}
          <ToolHelp
            title="Voice Splitter"
            summary="Splits your track into a vocal stem and instrumental stem using neural AI separation."
            steps={[
              "Drop or choose any audio/video file up to 100 MB.",
              "Watch the 4-step progress — Upload → Analyze → Split → Lyric Prediction.",
              "Use the vocal/instrumental players independently — mute vocals to sing along.",
              "Hit 'Send to Songwriting Studio' to load the predicted lyrics into your session.",
            ]}
            note="Neural AI runs on Cloud Run Demucs. Falls back to MLK V3 DSP if unavailable — results are still strong."
          />
        </div>
        <p className="text-sm text-muted-foreground -mt-4">
          Get both stems — vocal + instrumental — plus predicted lyrics ready for your next session.
        </p>

        {/* ── 4-step progress tracker ── */}
        <AnimatePresence>
          {ACTIVE_STAGES.has(stage) && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Card className="border-purple-500/20 bg-purple-500/5">
                <CardContent className="pt-5 pb-4 px-5 space-y-4">
                  <div className="grid grid-cols-4 gap-2">
                    {STAGES.map((s, i) => {
                      const done = i < stageIndex;
                      const active = s.key === stage;
                      const pending = i > stageIndex;
                      return (
                        <div key={s.key} className="flex flex-col items-center gap-1.5 text-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                            done    ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400" :
                            active  ? "bg-purple-500/20 border-2 border-purple-500 text-purple-400" :
                            "bg-secondary/40 border-2 border-border/30 text-muted-foreground/40"
                          }`}>
                            {done
                              ? <CheckCircle2 className="w-4 h-4" />
                              : <s.Icon className={`w-4 h-4 ${active ? "animate-pulse" : ""}`} />}
                          </div>
                          <span className={`text-[10px] font-medium leading-tight ${
                            done ? "text-emerald-400" : active ? "text-purple-400" : "text-muted-foreground/40"
                          }`}>{s.label}</span>
                          {active && (
                            <span className="text-[9px] text-muted-foreground leading-tight">{s.detail}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {ACTIVE_STAGES.has(stage) && <StageBar stage={stage} />}

                  <p className="text-xs text-muted-foreground text-center font-medium truncate">
                    {fileName}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Upload zone ── */}
        {stage === "idle" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              className="border-2 border-dashed border-purple-500/30 bg-purple-500/5 hover:border-purple-500/60 hover:bg-purple-500/10 transition-all cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <CardContent className="py-14 flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-purple-400" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">Drop your track here</p>
                  <p className="text-xs text-muted-foreground mt-1">MP3, WAV, FLAC, M4A, MP4, MOV · up to 100 MB</p>
                </div>
                <Button
                  variant="outline"
                  className="border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  Choose File
                </Button>
              </CardContent>
            </Card>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,.wav,.flac,.m4a,.mp4,.mov,.m4v,.avi,.mkv,.webm,.wmv,.flv,.ogg,.aiff,.aac"
              className="hidden"
              onChange={(e) => handleFile(e.target.files)}
            />
          </motion.div>
        )}

        {/* ── Done — dual stem players ── */}
        {stage === "done" && stems && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

            {/* Success badge */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <p className="font-semibold text-sm">Split complete — vocal + instrumental ready</p>
              {stems.remaining !== null && (
                <Badge variant="outline" className="ml-auto text-[10px] border-purple-500/30 text-purple-400">
                  {stems.remaining} free left
                </Badge>
              )}
            </div>

            {/* Two players */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StemPlayer
                label="Vocals"
                icon={Mic2}
                color="border-purple-500/30 bg-purple-500/5"
                url={stems.vocalUrl}
                blob={stems.vocalBlob}
                filename={`gkp_vocals_${stems.filename.replace(/\.[^.]+$/, "")}.wav`}
                volume={vocalVol}
                onVolumeChange={(v) => { setVocalVol(v); if (vocalRef.current) vocalRef.current.volume = v; }}
                audioRef={vocalRef as React.RefObject<HTMLAudioElement>}
              />
              <StemPlayer
                label="Instrumental"
                icon={Volume2}
                color="border-emerald-500/30 bg-emerald-500/5"
                url={stems.instrUrl}
                blob={stems.instrBlob}
                filename={`gkp_instrumental_${stems.filename.replace(/\.[^.]+$/, "")}.wav`}
                volume={instrVol}
                onVolumeChange={(v) => { setInstrVol(v); if (instrRef.current) instrRef.current.volume = v; }}
                audioRef={instrRef as React.RefObject<HTMLAudioElement>}
              />
            </div>

            {/* Playback controls */}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                className={`flex-1 border-border/40 gap-2 ${bothPlaying ? "border-purple-500/50 text-purple-400" : ""}`}
                onClick={playBoth}
              >
                {bothPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {bothPlaying ? "Pause Both" : "Play Together"}
              </Button>
              <Button
                variant={singAlong ? "default" : "outline"}
                className={`flex-1 gap-2 ${singAlong ? "bg-amber-500 hover:bg-amber-600 text-black font-semibold" : "border-border/40"}`}
                onClick={toggleSingAlong}
              >
                <Mic2 className="w-4 h-4" />
                {singAlong ? "Sing Along ON" : "Sing Along Mode"}
              </Button>
            </div>
            {singAlong && (
              <p className="text-xs text-amber-400 text-center -mt-1">
                Vocals muted — instrumental playing. Sing over it!
              </p>
            )}

            {/* Lyric prediction */}
            {stems.lyrics ? (
              <Card className="border-sky-500/20 bg-sky-500/5">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="font-semibold text-sm text-sky-300">Predicted Lyrics</span>
                    <Badge variant="outline" className="ml-auto text-[10px] border-sky-500/30 text-sky-400">AI transcription</Badge>
                  </div>
                  <pre className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-sans max-h-48 overflow-y-auto rounded bg-background/50 border border-border/30 p-3">
                    {stems.lyrics}
                  </pre>
                  <Button
                    onClick={sendToSongwriting}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white gap-2 font-semibold"
                  >
                    <Send className="w-4 h-4" />
                    Send to Songwriting Studio
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Lyrics load into your studio session — edit them to claim authorship
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-xl border border-border/30 bg-card/30 p-4 text-center space-y-2">
                <FileText className="w-4 h-4 text-muted-foreground mx-auto" />
                <p className="text-xs text-muted-foreground">Lyric prediction unavailable for this track.</p>
                <Link href="/songwriting">
                  <Button variant="outline" size="sm" className="border-border/40 gap-1.5">
                    <Send className="w-3 h-3" /> Open Songwriting Studio
                  </Button>
                </Link>
              </div>
            )}

            {/* Upgrade / new file */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-border/40 gap-2" onClick={reset}>
                <RefreshCcw className="w-3.5 h-3.5" /> New File
              </Button>
              {!hasSplits && (
                <Link href="/pricing" className="flex-1">
                  <Button className="w-full bg-purple-600 hover:bg-purple-700 gap-2 font-semibold">
                    <Crown className="w-4 h-4" /> Unlimited Splits
                  </Button>
                </Link>
              )}
            </div>

            {!hasSplits && (
              <p className="text-xs text-muted-foreground text-center">
                Free tier exports WAV. <Link href="/pricing" className="text-purple-400 hover:underline">Upgrade</Link> for unlimited splits + WAV downloads.
              </p>
            )}
          </motion.div>
        )}

        {/* ── Error ── */}
        {stage === "error" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="py-8 space-y-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <p className="text-sm text-red-400">{errorMsg}</p>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <Button variant="outline" onClick={reset} className="border-border/40">Try Again</Button>
                  {(errorMsg.toLowerCase().includes("limit") || errorMsg.toLowerCase().includes("subscribe")) && (
                    <Link href="/pricing">
                      <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">Upgrade</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ── Feature grid ── */}
        {stage === "idle" && (
          <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
            {[
              { label: "Neural AI",       desc: "Demucs htdemucs stems"    },
              { label: "Both Stems",      desc: "Vocal + instrumental"      },
              { label: "Lyric Predict",   desc: "Auto-transcribed vocals"   },
            ].map((i) => (
              <div key={i.label} className="p-3 rounded-lg border border-border/20 bg-card/30 space-y-1">
                <p className="font-medium text-foreground/80">{i.label}</p>
                <p>{i.desc}</p>
              </div>
            ))}
          </div>
        )}
        {/* ── SEO content — always rendered ── */}
        <div className="mt-12 border-t border-border/20 pt-8 space-y-10 text-sm">

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground/90">How voice removal works</h2>
            <p className="text-muted-foreground leading-relaxed">
              GravelKing Pro uses{" "}
              <strong className="text-foreground/70">Demucs htdemucs</strong>, a neural source-separation
              model trained on thousands of commercial tracks, to split your audio into two stems: an
              isolated vocal track and a clean instrumental. The model runs server-side — you upload
              the file, and we return both stems as 16-bit stereo WAV files with the MLK v3 kernel
              applied for phase and transient correction. No plug-ins, no installs, no latency on your device.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              The separation is strongest on tracks recorded with a center-panned lead vocal and
              a stereo instrumental bed — typical for pop, R&B, hip-hop, and country. Tracks with
              heavy vocal reverb, multi-layered harmonics, or wide-panned doubling will separate
              with some bleed, which is normal for any stem-separation tool.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground/90">Supported file types and limits</h2>
            <p className="text-muted-foreground leading-relaxed">
              Upload any common audio format: <strong className="text-foreground/70">MP3, WAV, FLAC, M4A, AAC, OGG, AIFF, OPUS</strong>.
              Video files (MP4, MOV) are also accepted — the audio stream is extracted automatically
              before processing. Maximum track length is 10 minutes. Files are processed on our
              servers and deleted after your session; nothing is stored long-term.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Output is always a standard 16-bit stereo WAV at 44.1 kHz — compatible with every DAW,
              sampler, and audio editor. Free-tier users get one voice removal run; upgrading to{" "}
              <Link href="/pricing" className="text-purple-400 hover:underline">GravelKing Pro</Link>{" "}
              unlocks unlimited runs and WAV downloads for every stem.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground/90">Common use cases</h2>
            <ul className="text-muted-foreground space-y-1.5 list-disc list-inside leading-relaxed">
              <li>Create karaoke or practice-along versions of any song</li>
              <li>Extract an instrumental for sampling, remixing, or a cover track</li>
              <li>Isolate vocals for a cappella mashups or vocal chops</li>
              <li>Remove distracting background music from a podcast or interview recording</li>
              <li>Prep stems for re-mixing or re-mastering in your DAW</li>
              <li>Feed the isolated vocal into the <Link href="/vocal-booth" className="text-purple-400 hover:underline">Vocal Booth</Link> as a guide track</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="text-base font-semibold text-foreground/90">Frequently asked questions</h2>

            <div className="space-y-1">
              <h3 className="font-medium text-foreground/80">Does the output preserve stereo imaging?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Yes. Both the vocal and instrumental stems are returned as stereo WAV files. The
                spatial relationship between left, center, and right channels is maintained through
                the MLK v3 post-processing pass.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-medium text-foreground/80">Is one free use really free — no card required?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Yes. Your first voice removal run is free and requires no payment method. The
                server tracks usage by session, not by account, so you can try it immediately after
                uploading a file. After your free run, you can{" "}
                <Link href="/pricing" className="text-purple-400 hover:underline">upgrade to Pro</Link>{" "}
                for unlimited access.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-medium text-foreground/80">How does this compare to stem splitting?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Voice removal returns two stems: vocals and instrumental. Stem splitting goes further
                and separates the track into up to five distinct layers — vocals, bass, drums, midrange,
                and a full instrumental mix. If you need individual instrument stems for remixing,{" "}
                <Link href="/studio" className="text-purple-400 hover:underline">use the Studio's stem split mode</Link>{" "}
                instead.
              </p>
            </div>

            <div className="space-y-1">
              <h3 className="font-medium text-foreground/80">Can I master the instrumental after removing vocals?</h3>
              <p className="text-muted-foreground leading-relaxed">
                Absolutely. Download the instrumental WAV and drop it straight into the{" "}
                <Link href="/mastering" className="text-purple-400 hover:underline">Audio Mastering</Link>{" "}
                tool to apply a platform-specific loudness target. Broadcast, YouTube, Spotify, and
                Vinyl presets are all available.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground/90">Related tools</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Audio Mastering", href: "/mastering" },
                { label: "Studio (5-Stem Split)", href: "/studio" },
                { label: "Vocal Booth", href: "/vocal-booth" },
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
