import { useState, useRef } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Music2, Zap, Download, Play, Square, RefreshCw, Lock } from "lucide-react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";

type Genre = "hiphop" | "rnb" | "electronic" | "lofi" | "trap" | "pop" | "soul";
type MusicKey = "C" | "D" | "E" | "F" | "G" | "A" | "B";
type Mood = "chill" | "dark" | "uplifting" | "aggressive" | "romantic";

const GENRES: { id: Genre; label: string; emoji: string; desc: string; img: string }[] = [
  { id: "hiphop",     label: "Hip Hop",    emoji: "🎤", desc: "Heavy 808 bass, punchy",    img: "https://media.istockphoto.com/id/2111019920/photo/aspiring-rapper-recording-a-new-track-in-a-soundproof-studio-at-night.jpg?s=612x612&w=0&k=20&c=xtqwolfuS5JS9dLc9KXR4Ib05p7M3FuUHrrOPSovpMs=" },
  { id: "rnb",        label: "R&B",        emoji: "🎵", desc: "Smooth, warm, soulful",     img: "https://i.pinimg.com/originals/a4/5d/49/a45d49891278b235f60abe4232b0cd47.jpg" },
  { id: "electronic", label: "Electronic", emoji: "⚡", desc: "Bright synth, crisp",       img: "https://images.unsplash.com/photo-1571266028253-6c7f4e8e8a0e?w=400&q=80" },
  { id: "lofi",       label: "Lo-fi",      emoji: "☕", desc: "Warm, filtered, chill",     img: "https://images.alphacoders.com/135/thumb-1920-1357322.jpeg" },
  { id: "trap",       label: "Trap",       emoji: "🔥", desc: "Sub-bass, hard-hitting",    img: "https://media.istockphoto.com/id/147301554/photo/hip-hop-dancer-balancing-on-one-leg.jpg?s=612x612&w=0&k=20&c=nKPD0szexyhiOZjN0ezgpLc6-67ACnoXL36RcbOJtAQ=" },
  { id: "pop",        label: "Pop",        emoji: "🌟", desc: "Balanced, radio-ready",     img: "https://static.vecteezy.com/system/resources/thumbnails/068/599/062/small/stage-with-bright-concert-lighting-spotlights-prepared-for-live-music-performance-photo.jpg" },
  { id: "soul",       label: "Soul",       emoji: "💿", desc: "Warm bass, vintage feel",   img: "https://media.gettyimages.com/id/1327551471/photo/cheerful-young-man-playing-guitar-and-singing-to-his-girlfriend-on-the-field-during-a-sunset.jpg?s=612x612&w=0&k=20&c=RkDWCEFWziH9gmUls5_Jz2JLHU3WQZcPseTru5IEdt8=" },
];

const MOODS: { id: Mood; label: string }[] = [
  { id: "chill",      label: "Chill" },
  { id: "uplifting",  label: "Uplifting" },
  { id: "dark",       label: "Dark" },
  { id: "aggressive", label: "Aggressive" },
  { id: "romantic",   label: "Romantic" },
];

const KEYS: MusicKey[] = ["C", "D", "E", "F", "G", "A", "B"];

export default function BeatMaker() {
  const { isPro } = useAppState();
  const [genre, setGenre] = useState<Genre>("hiphop");
  const [key, setKey] = useState<MusicKey>("C");
  const [bpm, setBpm] = useState([95]);
  const [mood, setMood] = useState<Mood>("chill");
  const [duration, setDuration] = useState([30]);
  const [state, setState] = useState<"idle" | "generating" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [kernelParity, setKernelParity] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setState("generating");
    setProgress(0);
    setAudioUrl(null);
    setAudioBlob(null);
    setIsSample(false);
    setKernelParity(null);

    let p = 0;
    const interval = setInterval(() => {
      p = Math.min(p + 4, 85);
      setProgress(p);
    }, 200);

    try {
      const body = new URLSearchParams({
        genre, key, bpm: String(bpm[0]),
        mood, duration: String(duration[0]),
      });
      const response = await fetch("/api/beatmaker/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      clearInterval(interval);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Beat generation failed." }));
        throw new Error(err.error ?? "Beat generation failed.");
      }

      setProgress(95);
      setIsSample(response.headers.get("X-GK-Sample") === "true");
      setKernelParity(response.headers.get("X-GK-Parity"));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setAudioBlob(blob);
      setAudioUrl(url);
      setProgress(100);
      setState("done");
    } catch (err: any) {
      clearInterval(interval);
      setProgress(0);
      setState("idle");
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    }
  };

  const handlePlay = () => {
    if (!audioUrl) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      if (!audioRef.current) audioRef.current = new Audio(audioUrl);
      audioRef.current.src = audioUrl;
      audioRef.current.play();
      setIsPlaying(true);
      audioRef.current.onended = () => setIsPlaying(false);
    }
  };

  const handleDownload = () => {
    if (!audioBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(audioBlob);
    a.download = `GKP_${key}_${genre}_${bpm[0]}bpm_MLKv3.wav`;
    a.click();
  };

  const selectedGenre = GENRES.find(g => g.id === genre)!;

  return (
    <Layout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold tracking-tight">Beat Maker</h1>
              <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">MLK v3</Badge>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">30s Free</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              Generate original instrumentals using the GravelKing MLK v3 kernel. Select genre, key, BPM, and mood.
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5">
            <Zap className="w-3.5 h-3.5" /> GravelKing Protocol
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls */}
          <div className="space-y-4">
            {/* Genre */}
            <Card className="border-border/40 bg-card/40">
              <CardContent className="p-5 space-y-3">
                <label className="text-sm font-medium">Genre</label>
                <div className="grid grid-cols-2 gap-2">
                  {GENRES.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setGenre(g.id)}
                      className={`relative overflow-hidden rounded-xl border-2 h-24 transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] ${genre === g.id ? "border-amber-500 shadow-lg shadow-amber-500/20" : "border-white/10 hover:border-amber-500/50"}`}
                    >
                      <img src={g.img} alt={g.label} className="absolute inset-0 w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      <div className={`absolute inset-0 transition-all duration-200 ${genre === g.id ? "bg-amber-500/25" : "bg-black/60 hover:bg-black/45"}`} />
                      {genre === g.id && <div className="absolute inset-0 ring-1 ring-inset ring-amber-400/30 rounded-xl" />}
                      <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1">
                        <span className="text-lg leading-none drop-shadow-lg">{g.emoji}</span>
                        <span className="text-[10px] font-bold text-white drop-shadow-md tracking-wide">{g.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Key, BPM, Mood */}
            <Card className="border-border/40 bg-card/40">
              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">Key</label>
                    <div className="grid grid-cols-4 gap-1">
                      {KEYS.map((k) => (
                        <button
                          key={k}
                          onClick={() => setKey(k)}
                          className={`py-1.5 text-xs font-mono font-semibold rounded-md border transition-colors ${
                            key === k ? "border-amber-500 bg-amber-500/20 text-amber-400" : "border-border/40 bg-secondary/20 hover:border-amber-500/40"
                          }`}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">Mood</label>
                    <Select value={mood} onValueChange={(v) => setMood(v as Mood)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MOODS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-xs text-muted-foreground font-medium">BPM</label>
                    <span className="text-xs font-mono text-amber-400 font-semibold">{bpm[0]}</span>
                  </div>
                  <Slider value={bpm} onValueChange={setBpm} min={60} max={180} step={1} />
                  <div className="flex justify-between text-[10px] text-muted-foreground/50">
                    <span>60 — slow</span><span>120 — mid</span><span>180 — fast</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-muted-foreground font-medium">Duration</label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-amber-400 font-semibold">{isPro ? duration[0] : 30}s</span>
                      {!isPro && <Badge variant="outline" className="text-[9px] px-1 border-sky-500/30 text-sky-400">30s (free)</Badge>}
                    </div>
                  </div>
                  <Slider
                    value={duration}
                    onValueChange={setDuration}
                    min={15}
                    max={120}
                    step={15}
                    disabled={!isPro}
                    className={!isPro ? "opacity-40" : ""}
                  />
                  {!isPro && (
                    <p className="text-[10px] text-muted-foreground/60">
                      <Link href="/pricing" className="text-amber-500 underline">Upgrade to Pro</Link> for up to 120-second tracks.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Button
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold h-12 text-base"
              onClick={handleGenerate}
              disabled={state === "generating"}
            >
              {state === "generating"
                ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Generating with MLK v3...</>
                : <><Music2 className="w-4 h-4 mr-2" />Generate {selectedGenre.emoji} {selectedGenre.label} Beat</>
              }
            </Button>
          </div>

          {/* Output */}
          <div className="space-y-4">
            {state === "generating" && (
              <Card className="border-border/40 bg-card/40">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
                    <span className="text-sm font-medium">Running GravelKing MLK v3...</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>{progress < 30 ? "Synthesizing frequency layers..." : progress < 70 ? "Applying MLK v3 multi-band kernel..." : "Normalizing output..."}</p>
                    <p>Key: {key} · {bpm[0]} BPM · {selectedGenre.label} · {mood}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <AnimatePresence>
              {state === "done" && audioUrl && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <Card className="border-emerald-500/30 bg-emerald-500/5">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-emerald-400">Beat Ready</span>
                        <div className="flex items-center gap-2">
                          {isSample && (
                            <Badge variant="outline" className="text-[9px] px-1.5 border-sky-500/30 text-sky-400">30s Sample</Badge>
                          )}
                          {kernelParity && (
                            <Badge variant="outline" className={`text-[9px] px-1.5 ${kernelParity === "MLK_V3_VALIDATED" ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"}`}>
                              {kernelParity}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <audio src={audioUrl} controls className="w-full h-8" style={{ colorScheme: "dark" }} />

                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          { label: "Key", value: key },
                          { label: "BPM", value: String(bpm[0]) },
                          { label: "Genre", value: selectedGenre.label },
                        ].map(m => (
                          <div key={m.label} className="rounded-lg bg-secondary/40 p-2">
                            <p className="text-[10px] text-muted-foreground">{m.label}</p>
                            <p className="text-xs font-semibold text-emerald-400 font-mono">{m.value}</p>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={handlePlay}>
                          {isPlaying ? <><Square className="w-4 h-4 mr-2" />Stop</> : <><Play className="w-4 h-4 mr-2" />Play</>}
                        </Button>
                        {isPro ? (
                          <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold" onClick={handleDownload}>
                            <Download className="w-4 h-4 mr-2" /> Download WAV
                          </Button>
                        ) : (
                          <Link href="/pricing" className="flex-1">
                            <Button variant="outline" className="w-full border-amber-500/30 text-amber-500">
                              <Lock className="w-4 h-4 mr-2" /> Upgrade to Download
                            </Button>
                          </Link>
                        )}
                      </div>

                      <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={handleGenerate}>
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Generate Another
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {state === "idle" && (
              <div className="flex flex-col items-center justify-center h-64 rounded-xl border-2 border-dashed border-border/30 text-center gap-3 p-6">
                <Music2 className="w-12 h-12 text-muted-foreground/30" />
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm font-medium">Configure your beat and hit Generate</p>
                  <p className="text-xs text-muted-foreground/60">Synthesized with GravelKing MLK v3 kernel · WAV output</p>
                </div>
              </div>
            )}
          </div>
        </div>

      </motion.div>
    </Layout>
  );
}
