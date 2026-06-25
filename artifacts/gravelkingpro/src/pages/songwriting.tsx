import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import {
  Sparkles, Music2, Edit3, Lock, Copy, ExternalLink,
  CheckCircle2, AlertTriangle, Loader2, RotateCcw,
  FileText, Clock, Wand2, Check, RefreshCw,
} from "lucide-react";

const GENRES = [
  "Hip-Hop", "R&B", "Pop", "Trap", "Soul", "Gospel",
  "Country", "Rock", "Afrobeats", "Reggae", "Lo-Fi", "EDM",
];

function levenshteinPercent(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return 100;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = temp;
    }
  }
  return Math.min(100, Math.round(((dp[n] ?? 0) / m) * 100));
}

function AuthorshipMeter({ score }: { score: number }) {
  const eligible = score >= 20;
  const color = eligible ? "bg-emerald-500" : score >= 10 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold flex items-center gap-2">
          {eligible ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Edit3 className="w-4 h-4 text-amber-500" />}
          Authorship Meter
        </span>
        <span className={`font-bold ${eligible ? "text-emerald-400" : "text-muted-foreground"}`}>{score}%</span>
      </div>
      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(2, score)}%` }} />
      </div>
      <div className="flex items-center justify-between">
        <p className={`text-xs ${eligible ? "text-emerald-400 font-medium" : "text-muted-foreground"}`}>
          {eligible ? "Human Authorship Documented" : `${score}% — need ${20 - score}% more edits to qualify`}
        </p>
        {eligible && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Copyright Eligible</Badge>}
      </div>
      {!eligible && (
        <p className="text-xs text-muted-foreground/70">
          Edit, rewrite or rearrange lines until you hit 20% — that's when your human authorship is documentable.
        </p>
      )}
    </div>
  );
}

function ProGate({ feature }: { feature: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/30 text-sm text-muted-foreground">
      <Lock className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
      <span>{feature}</span>
      <a href="/pricing" className="ml-auto text-amber-500 hover:text-amber-400 text-xs font-medium whitespace-nowrap">Upgrade →</a>
    </div>
  );
}

function StepBadge({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
      <span className="text-sm font-semibold text-foreground">{label}</span>
    </div>
  );
}

export default function SongwritingStudio() {
  const { isPro } = useAppState();
  const { toast } = useToast();

  // ── Step 1: Lyrics ────────────────────────────────────
  const [lyricsMode, setLyricsMode] = useState<"describe" | "write">("describe");
  const [story, setStory] = useState("");        // describe mode
  const [userLyrics, setUserLyrics] = useState(""); // write mode
  const [genre, setGenre] = useState("Hip-Hop");
  const [bpm, setBpm] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  // ── Step 2: Style ─────────────────────────────────────
  const [styleInput, setStyleInput] = useState("");
  const [convertedStyle, setConvertedStyle] = useState("");
  const [isConvertingStyle, setIsConvertingStyle] = useState(false);
  const [styleCopied, setStyleCopied] = useState(false);

  // ── Output ────────────────────────────────────────────
  const [aiDraft, setAiDraft] = useState("");
  const [editedLyrics, setEditedLyrics] = useState("");
  const [sunoPrompt, setSunoPrompt] = useState(""); // auto from API
  const [isEditing, setIsEditing] = useState(false);
  const [authorshipScore, setAuthorshipScore] = useState(0);
  const [copiedAll, setCopiedAll] = useState(false);

  // ── Saving (Pro) ──────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!editedLyrics) return;
    setAuthorshipScore(levenshteinPercent(aiDraft, editedLyrics));
  }, [editedLyrics, aiDraft]);

  // ── Describe → Generate full lyrics ──────────────────
  const handleGenerate = useCallback(async () => {
    if (!story.trim()) {
      toast({ title: "Describe your song first", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    setAiDraft(""); setEditedLyrics(""); setAuthorshipScore(0); setProjectId(null);
    try {
      const res = await fetch("/api/lyrics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story: story.trim(), genre, bpm: bpm ? parseInt(bpm) : undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { lyrics: string; sunoPrompt: string };
      setAiDraft(data.lyrics);
      setEditedLyrics(data.lyrics);
      setSunoPrompt(data.sunoPrompt);
    } catch {
      toast({ title: "Generation failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }, [story, genre, bpm, toast]);

  // ── Write → Use As-Is (100% human) ───────────────────
  const handleUseAsIs = useCallback(() => {
    if (!userLyrics.trim()) {
      toast({ title: "Write some lyrics first", variant: "destructive" });
      return;
    }
    setAiDraft("");             // empty baseline = 100% authorship
    setEditedLyrics(userLyrics.trim());
    setAuthorshipScore(100);
    setProjectId(null);
  }, [userLyrics, toast]);

  // ── Write → Generate More (Gemini expands partial) ───
  const handleGenerateMore = useCallback(async () => {
    if (!userLyrics.trim()) {
      toast({ title: "Write some lyrics first", variant: "destructive" });
      return;
    }
    setIsExpanding(true);
    setAiDraft(""); setEditedLyrics(""); setAuthorshipScore(0); setProjectId(null);
    try {
      const res = await fetch("/api/lyrics/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partialLyrics: userLyrics.trim(),
          genre,
          bpm: bpm ? parseInt(bpm) : undefined,
          styleContext: convertedStyle || styleInput || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { lyrics: string; sunoPrompt: string };
      setAiDraft(data.lyrics);
      setEditedLyrics(data.lyrics);
      setSunoPrompt(data.sunoPrompt);
    } catch {
      toast({ title: "Expansion failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsExpanding(false);
    }
  }, [userLyrics, genre, bpm, convertedStyle, styleInput, toast]);

  // ── Convert style description → Suno tags ────────────
  const handleConvertStyle = useCallback(async () => {
    if (!styleInput.trim()) {
      toast({ title: "Describe your style first", variant: "destructive" });
      return;
    }
    setIsConvertingStyle(true);
    try {
      const res = await fetch("/api/lyrics/convert-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleDescription: styleInput.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { styleTags: string };
      setConvertedStyle(data.styleTags);
    } catch {
      toast({ title: "Style conversion failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsConvertingStyle(false);
    }
  }, [styleInput, toast]);

  // ── Push to Suno / Udio ───────────────────────────────
  const handlePushTo = useCallback(async (platform: "suno" | "udio") => {
    const styleText = convertedStyle || styleInput || sunoPrompt;
    const lyricsText = editedLyrics || aiDraft;
    const clip = `Style: ${styleText}\n\nLyrics:\n${lyricsText}`;
    try {
      await navigator.clipboard.writeText(clip);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
      toast({
        title: copiedAll ? "Copied again!" : "Copied to clipboard!",
        description: `Opening ${platform === "suno" ? "Suno" : "Udio"} — paste in the style + lyrics fields.`,
      });
    } catch {
      toast({ title: `Opening ${platform === "suno" ? "Suno" : "Udio"}`, description: "Copy your content manually." });
    }
    window.open(platform === "suno" ? "https://suno.com/create" : "https://udio.com", "_blank", "noopener");
  }, [convertedStyle, styleInput, sunoPrompt, editedLyrics, aiDraft, copiedAll, toast]);

  // ── Save project (Pro) ────────────────────────────────
  const handleSaveProject = useCallback(async () => {
    if (!aiDraft && !editedLyrics) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/lyrics/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiDraft: aiDraft || editedLyrics,
          title: (story || userLyrics).slice(0, 40) || "Untitled",
          genre,
          bpm: bpm ? parseInt(bpm) : undefined,
          sunoPrompt: convertedStyle || sunoPrompt,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { id: string };
      setProjectId(data.id);
      if (editedLyrics !== aiDraft && editedLyrics) {
        await fetch("/api/lyrics/revise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: data.id, content: editedLyrics }),
        });
      }
      toast({ title: "Project saved", description: "Lyrics and revision history logged." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [aiDraft, editedLyrics, story, userLyrics, genre, bpm, convertedStyle, sunoPrompt, toast]);

  const handleReset = useCallback(() => {
    setAiDraft(""); setEditedLyrics(""); setSunoPrompt("");
    setAuthorshipScore(0); setIsEditing(false); setProjectId(null);
  }, []);

  const hasOutput = editedLyrics.length > 0;
  const isEligible = authorshipScore >= 20;
  const effectiveStyle = convertedStyle || styleInput || sunoPrompt;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Music2 className="w-6 h-6 text-amber-500" />
            <span className="text-xs font-bold tracking-widest uppercase text-amber-500">Songwriting Studio</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Build it here. Send it to Suno.</h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Pre-build your lyrics and style prompt in one place, then push everything straight to Suno or Udio — no copy-paste chaos.
          </p>
        </div>

        {/* ── STEP 1: Lyrics ── */}
        <div className="rounded-2xl border border-border/40 bg-card/60 p-6 space-y-4">
          <StepBadge n="1" label="Your Lyrics" />

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border/40 bg-background/40 p-0.5 gap-0.5">
            {(["describe", "write"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setLyricsMode(mode)}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${
                  lyricsMode === mode
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode === "describe" ? "💡 Describe the Song" : "✏️ Write Your Lyrics"}
              </button>
            ))}
          </div>

          {/* Describe mode */}
          {lyricsMode === "describe" && (
            <div className="space-y-4">
              <Textarea
                placeholder="Describe what the song is about — a feeling, a story, a moment, a relationship. The more real, the better."
                className="min-h-[110px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50"
                value={story}
                onChange={(e) => setStory(e.target.value)}
                maxLength={1000}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Genre</label>
                  <select
                    className="w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                  >
                    {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">BPM <span className="font-normal">(optional)</span></label>
                  <Input
                    type="number" placeholder="e.g. 90"
                    className="bg-background/60 border-border/50 focus:border-amber-500/50"
                    value={bpm} onChange={(e) => setBpm(e.target.value)} min={40} max={200}
                  />
                </div>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || story.trim().length < 5}
                className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-3"
              >
                {isGenerating
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Writing lyrics…</>
                  : <><Sparkles className="w-4 h-4 mr-2" />Generate Lyrics</>}
              </Button>
            </div>
          )}

          {/* Write mode */}
          {lyricsMode === "write" && (
            <div className="space-y-4">
              <Textarea
                placeholder={"Write your lyrics here — full or partial.\n\nIf you only have a verse or chorus, click Generate More and Gemini will complete the rest while keeping every line you wrote.\n\nOr click Use As-Is to skip AI entirely — your authorship is already 100%."}
                className="min-h-[180px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50 font-mono text-sm leading-relaxed"
                value={userLyrics}
                onChange={(e) => setUserLyrics(e.target.value)}
                maxLength={3000}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Genre</label>
                  <select
                    className="w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                  >
                    {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">BPM <span className="font-normal">(optional)</span></label>
                  <Input
                    type="number" placeholder="e.g. 90"
                    className="bg-background/60 border-border/50 focus:border-amber-500/50"
                    value={bpm} onChange={(e) => setBpm(e.target.value)} min={40} max={200}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={handleUseAsIs}
                  disabled={!userLyrics.trim() || isExpanding}
                  className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 font-semibold"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />Use As-Is
                </Button>
                <Button
                  onClick={handleGenerateMore}
                  disabled={isExpanding || !userLyrics.trim()}
                  className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
                >
                  {isExpanding
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                    : <><Sparkles className="w-4 h-4 mr-2" />Generate More</>}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/70 text-center">
                <strong className="text-foreground/70">Use As-Is</strong> — your words only, authorship 100%.{" "}
                <strong className="text-foreground/70">Generate More</strong> — Gemini fills out the rest while keeping every line you wrote.
              </p>
            </div>
          )}
        </div>

        {/* ── STEP 2: Style ── */}
        <div className="rounded-2xl border border-border/40 bg-card/60 p-6 space-y-4">
          <StepBadge n="2" label="Your Style" />
          <Textarea
            placeholder={"Describe the vibe, environment, mood, genre — or reference an artist or song.\n\nExamples:\n• dark trap, rainy midnight, heavy 808s, melancholic\n• sounds like Future meets James Blake\n• Kendrick Lamar storytelling, cinematic, orchestral trap\n• upbeat Afrobeats, Lagos summer, joyful, percussive\n\nGemini will convert any artist/song references into actual Suno style tags."}
            className="min-h-[130px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50"
            value={styleInput}
            onChange={(e) => setStyleInput(e.target.value)}
            maxLength={500}
          />
          <Button
            onClick={handleConvertStyle}
            disabled={isConvertingStyle || styleInput.trim().length < 3}
            variant="outline"
            className="w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-semibold"
          >
            {isConvertingStyle
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Converting…</>
              : <><Wand2 className="w-4 h-4 mr-2" />Convert to Suno Style Tags</>}
          </Button>

          {/* Style tags preview */}
          {convertedStyle && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Style tags (editable):</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(convertedStyle);
                      setStyleCopied(true);
                      setTimeout(() => setStyleCopied(false), 1800);
                    }}
                    className="p-1 rounded hover:bg-border/20 transition-colors"
                    title="Copy style tags"
                  >
                    {styleCopied
                      ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                      : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  <button
                    onClick={handleConvertStyle}
                    className="p-1 rounded hover:bg-border/20 transition-colors"
                    title="Re-convert"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
              <Input
                value={convertedStyle}
                onChange={(e) => setConvertedStyle(e.target.value)}
                className="bg-background/60 border-amber-500/30 text-sm font-mono"
                placeholder="Style tags will appear here…"
              />
              <p className="text-[10px] text-muted-foreground">
                Paste this into the <strong>Style</strong> field in Suno. You can edit it before pushing.
              </p>
            </div>
          )}
        </div>

        {/* ── OUTPUT: Preview + Push ── */}
        {hasOutput && (
          <div className="space-y-5">

            {/* Status banner */}
            {isEligible ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Human Authorship Documented</p>
                  <p className="text-xs text-emerald-400/70">Your edits qualify these lyrics for copyright registration documentation.</p>
                </div>
              </div>
            ) : authorshipScore === 100 ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">100% Human-Written</p>
                  <p className="text-xs text-emerald-400/70">You wrote all of these lyrics — full authorship documented.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-rose-400">AI Draft — Edit to Document Authorship</p>
                  <p className="text-xs text-rose-400/70">Rewrite or rearrange lines until your Authorship Meter hits 20%.</p>
                </div>
              </div>
            )}

            {/* Lyrics editor */}
            <div className="rounded-2xl border border-border/40 bg-card/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/40">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{genre} Lyrics</span>
                  <Badge variant="outline" className={`text-xs ${isEligible || authorshipScore === 100 ? "border-emerald-500/40 text-emerald-400" : "border-rose-500/40 text-rose-400"}`}>
                    {isEligible || authorshipScore === 100 ? "Stamped" : "AI Draft"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(!isEditing)}>
                    {isEditing ? "Preview" : <><Edit3 className="w-3 h-3 mr-1" />Edit</>}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleReset}>
                    <RotateCcw className="w-3 h-3 mr-1" />New
                  </Button>
                </div>
              </div>
              {isEditing ? (
                <Textarea
                  value={editedLyrics}
                  onChange={(e) => setEditedLyrics(e.target.value)}
                  className="min-h-[360px] rounded-none border-0 bg-transparent font-mono text-sm leading-relaxed resize-none focus-visible:ring-0 p-5"
                />
              ) : (
                <pre className="p-5 text-sm font-mono leading-relaxed whitespace-pre-wrap text-foreground/90 min-h-[200px]">
                  {editedLyrics}
                </pre>
              )}
            </div>

            {/* Authorship meter */}
            {authorshipScore < 100 && <AuthorshipMeter score={authorshipScore} />}

            {/* Style tags display */}
            {effectiveStyle && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-amber-500/70 uppercase tracking-wide">Style prompt for Suno</p>
                <p className="text-sm text-foreground/80 font-mono">{effectiveStyle}</p>
              </div>
            )}

            {/* Push to Suno — with exact workflow steps */}
            <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Music2 className="w-4 h-4 text-amber-500" /> Push to Suno
              </p>

              <ol className="space-y-2.5">
                {[
                  { n: "1", text: 'Open Suno → click Create → switch to Advanced mode' },
                  { n: "2", text: 'If you have an instrumental split from Voice Splitter, click "Upload Audio" and load it as audio reference' },
                  { n: "3", text: 'Paste the style tags into the Style field. Use the Audio/Style influence slider to control how much the instrumental shapes the output' },
                  { n: "4", text: 'Paste your lyrics into the Lyrics field — click Generate' },
                ].map(({ n, text }) => (
                  <li key={n} className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold flex items-center justify-center">{n}</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">{text}</span>
                  </li>
                ))}
              </ol>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => void handlePushTo("suno")}
                  className="bg-amber-500 hover:bg-amber-600 text-black font-bold"
                >
                  {copiedAll ? <><Check className="w-4 h-4 mr-2" />Copied!</> : <><Copy className="w-4 h-4 mr-2" />Copy + Open Suno</>}
                  <ExternalLink className="w-3 h-3 ml-1.5 opacity-60" />
                </Button>
                <Button
                  onClick={() => void handlePushTo("udio")}
                  variant="outline"
                  className="border-border/50 font-semibold"
                >
                  <Copy className="w-4 h-4 mr-2" />Copy + Open Udio
                  <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                Copies your style tags + lyrics to clipboard, then opens the platform.
              </p>
            </div>

            {/* Pro features */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pro Features</p>
              {isPro ? (
                <div className="space-y-2">
                  <Button
                    onClick={() => void handleSaveProject()}
                    disabled={isSaving}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold"
                  >
                    {isSaving
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                      : projectId
                        ? <><CheckCircle2 className="w-4 h-4 mr-2" />Saved — Log Revision</>
                        : <><FileText className="w-4 h-4 mr-2" />Save Project + Log Revision</>}
                  </Button>
                  {projectId && (
                    <p className="text-xs text-center text-muted-foreground">
                      <Clock className="w-3 h-3 inline mr-1" />Forensic revision history is being recorded.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <ProGate feature="Save Project + Forensic Revision Log" />
                  <ProGate feature=".lrc Timed Lyric Export (for BandLab, StarMaker)" />
                  <ProGate feature="Form PA Copyright PDF with Authorship Log" />
                  <ProGate feature="Surgical Line Editor + Rhyming Tray" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
