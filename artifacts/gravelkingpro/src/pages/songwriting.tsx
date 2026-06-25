import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import {
  Sparkles,
  Music2,
  Edit3,
  Lock,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RotateCcw,
  FileText,
  Clock,
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

function AuthorshipMeter({ score, isEditing }: { score: number; isEditing: boolean }) {
  const eligible = score >= 20;
  const color = eligible ? "bg-emerald-500" : score >= 10 ? "bg-amber-500" : "bg-rose-500";
  const label = eligible
    ? "Human Authorship Documented"
    : `${score}% — Need ${20 - score}% more edits to qualify`;

  if (!isEditing && score === 0) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-foreground flex items-center gap-2">
          {eligible ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          ) : (
            <Edit3 className="w-4 h-4 text-amber-500" />
          )}
          Authorship Meter
        </span>
        <span className={`font-bold text-sm ${eligible ? "text-emerald-400" : "text-muted-foreground"}`}>
          {score}%
        </span>
      </div>

      <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className={`text-xs ${eligible ? "text-emerald-400 font-medium" : "text-muted-foreground"}`}>
          {label}
        </p>
        {eligible && (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
            Copyright Eligible
          </Badge>
        )}
      </div>

      {!eligible && (
        <p className="text-xs text-muted-foreground/70">
          Edit, rewrite, or rearrange lines until you reach 20% — that's when your human authorship is documentable.
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
      <a href="/pricing" className="ml-auto text-amber-500 hover:text-amber-400 text-xs font-medium whitespace-nowrap">
        Upgrade →
      </a>
    </div>
  );
}

export default function SongwritingStudio() {
  const { isPro } = useAppState();
  const { toast } = useToast();

  const [story, setStory] = useState("");
  const [genre, setGenre] = useState("Hip-Hop");
  const [bpm, setBpm] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [aiDraft, setAiDraft] = useState("");
  const [sunoPrompt, setSunoPrompt] = useState("");
  const [editedLyrics, setEditedLyrics] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [authorshipScore, setAuthorshipScore] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!aiDraft || !editedLyrics) return;
    setAuthorshipScore(levenshteinPercent(aiDraft, editedLyrics));
  }, [editedLyrics, aiDraft]);

  const handleGenerate = useCallback(async () => {
    if (!story.trim()) {
      toast({ title: "Write your story first", description: "Give us your idea and we'll write the lyrics.", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    setAiDraft("");
    setEditedLyrics("");
    setAuthorshipScore(0);
    setIsEditing(false);
    setProjectId(null);

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

  const handleSaveProject = useCallback(async () => {
    if (!aiDraft) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/lyrics/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiDraft, title: story.slice(0, 40) || "Untitled", genre, bpm: bpm ? parseInt(bpm) : undefined, sunoPrompt }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { id: string };
      setProjectId(data.id);

      if (editedLyrics !== aiDraft) {
        await fetch("/api/lyrics/revise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: data.id, content: editedLyrics }),
        });
      }
      toast({ title: "Project saved", description: "Your lyrics and revision history are logged." });
    } catch {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [aiDraft, editedLyrics, story, genre, bpm, sunoPrompt, toast]);

  const handlePushTo = useCallback(async (platform: "suno" | "udio") => {
    const url = platform === "suno" ? "https://suno.com" : "https://udio.com";
    const promptText = `${sunoPrompt}\n\nLyrics:\n${editedLyrics || aiDraft}`;
    try {
      await navigator.clipboard.writeText(promptText);
      toast({
        title: "Prompt + lyrics copied!",
        description: `Opening ${platform === "suno" ? "Suno" : "Udio"} — paste when you arrive.`,
      });
    } catch {
      toast({ title: "Opening " + (platform === "suno" ? "Suno" : "Udio"), description: "Copy your prompt manually." });
    }
    window.open(url, "_blank", "noopener");
  }, [sunoPrompt, editedLyrics, aiDraft, toast]);

  const handleReset = useCallback(() => {
    setAiDraft("");
    setEditedLyrics("");
    setSunoPrompt("");
    setAuthorshipScore(0);
    setIsEditing(false);
    setProjectId(null);
  }, []);

  const hasOutput = aiDraft.length > 0;
  const isEligible = authorshipScore >= 20;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Music2 className="w-6 h-6 text-amber-500" />
            <span className="text-xs font-bold tracking-widest uppercase text-amber-500">Songwriting Studio</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Write it. Own it. Stamp it.</h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            AI writes the first draft. You edit it into yours. Hit 20% human authorship and your
            lyrics are documentable for copyright — the world's first authorship-stamping workflow.
          </p>
        </div>

        {/* Input form */}
        {!hasOutput && (
          <div className="rounded-2xl border border-border/40 bg-card/60 p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Your story or idea</label>
              <Textarea
                placeholder="Tell us what the song is about — a feeling, a moment, a relationship, anything. The more real, the better the lyrics."
                className="min-h-[120px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50"
                value={story}
                onChange={(e) => setStory(e.target.value)}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground text-right">{story.length}/1000</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Genre</label>
                <select
                  className="w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                >
                  {GENRES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">BPM <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  type="number"
                  placeholder="e.g. 90"
                  className="bg-background/60 border-border/50 focus:border-amber-500/50"
                  value={bpm}
                  onChange={(e) => setBpm(e.target.value)}
                  min={40}
                  max={200}
                />
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || story.trim().length < 5}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-3 text-base"
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Writing lyrics...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" /> Generate Lyrics</>
              )}
            </Button>
          </div>
        )}

        {/* Output section */}
        {hasOutput && (
          <div className="space-y-5">

            {/* Watermark / status banner */}
            {isEligible ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Human Authorship Documented</p>
                  <p className="text-xs text-emerald-400/70">Your edits qualify these lyrics for copyright registration documentation.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-rose-400">AI-Generated — Not Copyright Eligible</p>
                  <p className="text-xs text-rose-400/70">Edit the lyrics below until your Authorship Meter hits 20% to document your human contribution.</p>
                </div>
              </div>
            )}

            {/* Lyrics display / editor */}
            <div className="rounded-2xl border border-border/40 bg-card/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/40">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{genre} Lyrics</span>
                  {!isEligible && (
                    <Badge variant="outline" className="text-xs border-rose-500/40 text-rose-400">AI Draft</Badge>
                  )}
                  {isEligible && (
                    <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-400">Stamped</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setIsEditing(!isEditing)}
                  >
                    {isEditing ? "Preview" : <><Edit3 className="w-3 h-3 mr-1" />Edit</>}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleReset}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />New
                  </Button>
                </div>
              </div>

              {isEditing ? (
                <Textarea
                  value={editedLyrics}
                  onChange={(e) => setEditedLyrics(e.target.value)}
                  className="min-h-[400px] rounded-none border-0 bg-transparent font-mono text-sm leading-relaxed resize-none focus-visible:ring-0 p-5"
                  placeholder="Your lyrics..."
                />
              ) : (
                <pre className="p-5 text-sm font-mono leading-relaxed whitespace-pre-wrap text-foreground/90 min-h-[200px]">
                  {editedLyrics}
                </pre>
              )}
            </div>

            {/* Authorship meter */}
            <AuthorshipMeter score={authorshipScore} isEditing={isEditing || editedLyrics !== aiDraft} />

            {/* Suno prompt display */}
            {sunoPrompt && (
              <div className="rounded-xl border border-border/40 bg-card/40 px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Generated Suno/Udio Prompt</p>
                <p className="text-sm text-foreground/80 font-mono">{sunoPrompt}</p>
              </div>
            )}

            {/* Push buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => handlePushTo("suno")}
                variant="outline"
                className="border-border/50 hover:border-amber-500/50 hover:bg-amber-500/5 font-semibold"
              >
                <Copy className="w-4 h-4 mr-2" />
                Push to Suno
                <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
              </Button>
              <Button
                onClick={() => handlePushTo("udio")}
                variant="outline"
                className="border-border/50 hover:border-amber-500/50 hover:bg-amber-500/5 font-semibold"
              >
                <Copy className="w-4 h-4 mr-2" />
                Push to Udio
                <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
              </Button>
            </div>

            {/* Pro features */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pro Features</p>
              {isPro ? (
                <div className="space-y-2">
                  <Button
                    onClick={handleSaveProject}
                    disabled={isSaving}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold"
                  >
                    {isSaving ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
                    ) : projectId ? (
                      <><CheckCircle2 className="w-4 h-4 mr-2" />Saved — Log Revision</>
                    ) : (
                      <><FileText className="w-4 h-4 mr-2" />Save Project + Log Revision</>
                    )}
                  </Button>
                  {projectId && (
                    <p className="text-xs text-center text-muted-foreground">
                      <Clock className="w-3 h-3 inline mr-1" />
                      Forensic revision history is being recorded.
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
