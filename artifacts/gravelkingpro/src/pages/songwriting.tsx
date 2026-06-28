import { useState, useEffect, useCallback, useRef } from "react";
import { Layout } from "@/components/layout";
import { ToolHelp } from "@/components/tool-help";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import {
  Sparkles, Music2, Edit3, Lock, Copy, ExternalLink,
  CheckCircle2, AlertTriangle, Loader2, RotateCcw,
  FileText, Clock, Wand2, Check, RefreshCw, Plus, Trash2,
  ChevronRight, Mic, X, Share2, Shield,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type LineState = {
  id: string;
  type: "section" | "lyric" | "empty";
  text: string;
  aiOriginal: string;
  isHumanEdited: boolean;
  sectionContext: string;
  timestampMs?: number;
};

type TimelineBlock = {
  id: string;
  timestampMs: number;
  label: string;
  sectionType: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GENRES = [
  "Hip-Hop", "R&B", "Pop", "Trap", "Soul", "Gospel",
  "Country", "Rock", "Afrobeats", "Reggae", "Lo-Fi", "EDM",
];

const SECTION_TYPES = ["intro", "verse", "pre-chorus", "chorus", "bridge", "outro"];

const KEYS = [
  "C Major", "C Minor", "D Major", "D Minor", "E Major", "E Minor",
  "F Major", "F Minor", "G Major", "G Minor", "A Major", "A Minor",
  "B Major", "B Minor", "C# Minor", "F# Minor", "Bb Major", "Eb Major",
];

const VOCAL_TYPES = [
  "Male tenor", "Male baritone", "Male bass",
  "Female soprano", "Female mezzo-soprano", "Female alto",
  "Rapper (male)", "Rapper (female)", "R&B vocalist",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function msToTimestamp(ms: number) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timestampToMs(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 2) return (parts[0]! * 60 + parts[1]!) * 1000;
  return 0;
}

function lyricsFromLines(lines: LineState[]): string {
  return lines.map((l) => (l.type === "section" ? l.text : l.type === "empty" ? "" : l.text)).join("\n");
}

function getLastWord(text: string): string {
  const words = text.trim().split(/\s+/);
  return words[words.length - 1]?.replace(/[^\w]/g, "") ?? "";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AuthorshipMeter({ score }: { score: number }) {
  const eligible = score >= 25;
  const isFullHuman = score === 100;
  const color = eligible ? "bg-emerald-500" : score >= 12 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold flex items-center gap-2">
          {eligible ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Edit3 className="w-4 h-4 text-amber-500" />}
          Copyright Eligibility Goal
        </span>
        <span className={`font-bold ${eligible ? "text-emerald-400" : "text-muted-foreground"}`}>{score}%</span>
      </div>
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(2, score)}%` }} />
      </div>
      <p className={`text-xs font-semibold ${eligible ? "text-emerald-400" : "text-rose-400"}`}>
        {isFullHuman
          ? "Human Ownership Locked — 100% original."
          : eligible
            ? "Copyright Registered Goal Achieved! Human Ownership Locked."
            : `AI Draft Status (Public Domain Only) — ${Math.max(0, 25 - score)}% more edits needed.`}
      </p>
      {eligible && (
        <p className="text-[10px] text-muted-foreground/60 border-t border-border/30 pt-2">
          Instrumental tracking locked to AI/Public Domain. Lyrics protected.
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
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

// ── Timeline canvas (Advanced mode) ───────────────────────────────────────────

function TimelineCanvas({ blocks, onChange }: { blocks: TimelineBlock[]; onChange: (b: TimelineBlock[]) => void }) {
  const addBlock = () => {
    const lastMs = blocks.length > 0 ? (blocks[blocks.length - 1]?.timestampMs ?? 0) + 30000 : 0;
    onChange([...blocks, { id: crypto.randomUUID(), timestampMs: lastMs, label: "", sectionType: "verse" }]);
  };
  const updateBlock = (id: string, patch: Partial<TimelineBlock>) => {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const removeBlock = (id: string) => onChange(blocks.filter((b) => b.id !== id));

  return (
    <div className="space-y-2">
      {blocks.map((block) => (
        <div key={block.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
          <Mic className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Input
            value={msToTimestamp(block.timestampMs)}
            onChange={(e) => updateBlock(block.id, { timestampMs: timestampToMs(e.target.value) })}
            className="w-16 text-xs bg-transparent border-0 p-0 font-mono focus-visible:ring-0 text-amber-400"
            placeholder="0:00"
          />
          <select
            value={block.sectionType}
            onChange={(e) => updateBlock(block.id, { sectionType: e.target.value })}
            className="text-xs bg-transparent border border-border/40 rounded px-2 py-1 focus:outline-none text-muted-foreground"
          >
            {SECTION_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Input
            value={block.label}
            onChange={(e) => updateBlock(block.id, { label: e.target.value })}
            placeholder="e.g. Violin Intro, Heavy Metal Verse"
            className="flex-1 text-xs bg-transparent border-0 p-0 focus-visible:ring-0"
          />
          <button onClick={() => removeBlock(block.id)} className="text-muted-foreground hover:text-rose-400 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={addBlock} className="w-full border border-dashed border-border/40 text-muted-foreground hover:text-amber-400 hover:border-amber-500/40">
        <Plus className="w-3.5 h-3.5 mr-1.5" />Add Timeline Block
      </Button>
    </div>
  );
}

// ── Variation picker overlay ───────────────────────────────────────────────────

function VariationPicker({
  variations, instruction, onPick, onClose,
}: {
  variations: string[];
  instruction: string;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/40 bg-card shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />3 Variations
          </p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {instruction && (
          <p className="text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-lg">"{instruction}"</p>
        )}
        <div className="space-y-2">
          {variations.map((v, i) => (
            <button
              key={i}
              onClick={() => onPick(v)}
              className="w-full text-left rounded-xl border border-border/40 bg-background/60 px-4 py-3 text-sm hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors group"
            >
              <span className="text-[10px] text-amber-500/60 font-bold uppercase tracking-wide block mb-1">Option {i + 1}</span>
              <span className="text-foreground/90">{v}</span>
              <ChevronRight className="w-3.5 h-3.5 text-amber-500 float-right mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Rhyming tray ──────────────────────────────────────────────────────────────

function RhymingTray({
  rhymes, word, isLoading, onInsert,
}: {
  rhymes: string[]; word: string; isLoading: boolean; onInsert: (w: string) => void;
}) {
  if (!word && !isLoading) return null;
  return (
    <div className="sticky bottom-0 bg-card/95 backdrop-blur-md border-t border-border/40 px-4 py-2 z-40">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        <span className="text-[10px] text-muted-foreground/60 shrink-0">Rhymes with <strong className="text-amber-500/70">{word}</strong>:</span>
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500/60 shrink-0" />}
        {rhymes.map((r) => (
          <button
            key={r}
            onClick={() => onInsert(r)}
            className="shrink-0 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/25 transition-colors"
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Single lyric line row ──────────────────────────────────────────────────────

function LyricLineRow({
  line, isPro, isEditing, editText, remixMode, remixInstruction,
  isRemixing, onStartEdit, onEditChange, onSaveEdit, onCancelEdit,
  onStartRemix, onRemixInstructionChange, onTriggerRemix,
  onFocus, onInsertRhyme, rhymeInsertTarget,
}: {
  line: LineState;
  isPro: boolean;
  isEditing: boolean;
  editText: string;
  remixMode: boolean;
  remixInstruction: string;
  isRemixing: boolean;
  onStartEdit: () => void;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartRemix: () => void;
  onRemixInstructionChange: (v: string) => void;
  onTriggerRemix: () => void;
  onFocus: (lastWord: string) => void;
  onInsertRhyme: (word: string) => void;
  rhymeInsertTarget: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  if (line.type === "section") {
    return (
      <p className="text-xs font-bold text-amber-500 uppercase tracking-widest pt-4 pb-1 select-none">
        {line.text}
      </p>
    );
  }
  if (line.type === "empty") return <div className="h-2" />;

  return (
    <div className={`group relative rounded-lg transition-colors ${isEditing || remixMode ? "bg-amber-500/5 border border-amber-500/20" : "hover:bg-white/3"}`}>
      {isEditing ? (
        <div className="px-3 py-2 space-y-2">
          <input
            ref={inputRef}
            value={editText}
            onChange={(e) => onEditChange(e.target.value)}
            onFocus={() => {
              const prev = getLastWord(line.text);
              onFocus(prev);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onSaveEdit(); }
              if (e.key === "Escape") onCancelEdit();
            }}
            className="w-full bg-transparent text-sm text-foreground font-mono focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onSaveEdit} className="h-6 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-black">Save</Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit} className="h-6 px-2 text-xs">Cancel</Button>
          </div>
        </div>
      ) : remixMode ? (
        <div className="px-3 py-2 space-y-2">
          <p className="text-sm text-muted-foreground/60 italic font-mono">{line.text}</p>
          <p className="text-xs text-amber-500/70 font-semibold">What should this line be about?</p>
          <Input
            autoFocus
            value={remixInstruction}
            onChange={(e) => onRemixInstructionChange(e.target.value)}
            placeholder='e.g. "Make this about brown hats" or leave blank to just remix'
            className="text-xs h-8 bg-background/60"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onTriggerRemix(); } if (e.key === "Escape") onCancelEdit(); }}
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={onTriggerRemix} disabled={isRemixing} className="h-6 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-black">
              {isRemixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Sparkles className="w-3 h-3 mr-1" />Get 3 Variations</>}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelEdit} className="h-6 px-2 text-xs">Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Tapping the line text directly enters edit mode — like the Notes app */}
          <p
            className={`flex-1 text-sm font-mono leading-relaxed select-text ${
              line.isHumanEdited ? "text-emerald-300/90" : "text-foreground/85"
            } ${isPro ? "cursor-text hover:text-foreground" : ""}`}
            onClick={isPro ? onStartEdit : undefined}
            title={isPro ? "Tap to edit this line" : undefined}
          >
            {line.text}
          </p>
          {isPro ? (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onStartRemix}
                className="p-1.5 rounded hover:bg-amber-500/20 text-muted-foreground/40 hover:text-amber-400 transition-colors opacity-0 group-hover:opacity-100"
                title="AI remix this line — get 3 variations"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <Lock className="w-3 h-3 text-border/40 opacity-0 group-hover:opacity-100 shrink-0" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SongwritingStudio() {
  const { isPro } = useAppState();
  const { toast } = useToast();

  // ── Mode & input ──────────────────────────────────────────────────────────
  const [lyricsMode, setLyricsMode] = useState<"simple" | "advanced">("simple");
  const [story, setStory] = useState("");
  const [genre, setGenre] = useState("Hip-Hop");
  const [bpm, setBpm] = useState("");
  // Advanced mode
  const [advKey, setAdvKey] = useState("C Minor");
  const [advVocalType, setAdvVocalType] = useState("Male tenor");
  const [timelineBlocks, setTimelineBlocks] = useState<TimelineBlock[]>([
    { id: crypto.randomUUID(), timestampMs: 0, label: "Intro", sectionType: "intro" },
    { id: crypto.randomUUID(), timestampMs: 30000, label: "Verse 1", sectionType: "verse" },
    { id: crypto.randomUUID(), timestampMs: 75000, label: "Chorus", sectionType: "chorus" },
  ]);

  // ── Style step ────────────────────────────────────────────────────────────
  const [styleInput, setStyleInput] = useState("");
  const [convertedStyle, setConvertedStyle] = useState("");
  const [isConvertingStyle, setIsConvertingStyle] = useState(false);
  const [styleCopied, setStyleCopied] = useState(false);

  // ── Output state ──────────────────────────────────────────────────────────
  const [aiDraft, setAiDraft] = useState("");
  const [lines, setLines] = useState<LineState[]>([]);
  const [stylePrompt, setStylePrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationCount, setGenerationCount] = useState(0);

  // ── Authorship ────────────────────────────────────────────────────────────
  const [authorshipScore, setAuthorshipScore] = useState(0);

  // ── Line editing state (only one active at a time) ───────────────────────
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // ── Surgical remix state ──────────────────────────────────────────────────
  const [remixLineId, setRemixLineId] = useState<string | null>(null);
  const [remixInstruction, setRemixInstruction] = useState("");
  const [remixVariations, setRemixVariations] = useState<string[]>([]);
  const [isRemixing, setIsRemixing] = useState(false);

  // ── Rhyming tray ──────────────────────────────────────────────────────────
  const [rhymeWord, setRhymeWord] = useState("");
  const [rhymes, setRhymes] = useState<string[]>([]);
  const [isLoadingRhymes, setIsLoadingRhymes] = useState(false);
  const rhymeTarget = useRef<string | null>(null);

  // ── Saving ────────────────────────────────────────────────────────────────
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);

  // ── IP Embed ───────────────────────────────────────────────────────────────
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [embedToken, setEmbedToken] = useState<string | null>(null);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);

  // ── Authorship score recompute whenever lines change ─────────────────────
  useEffect(() => {
    if (!aiDraft || lines.length === 0) return;
    const currentText = lyricsFromLines(lines);
    setAuthorshipScore(levenshteinPercent(aiDraft, currentText));
  }, [lines, aiDraft]);

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (generationCount >= 2 && !isPro) {
      toast({ title: "Generation limit reached", description: "Upgrade to Pro for unlimited generations.", variant: "destructive" });
      return;
    }
    if (lyricsMode === "simple" && !story.trim()) {
      toast({ title: "Describe your song first", variant: "destructive" });
      return;
    }
    if (lyricsMode === "advanced" && timelineBlocks.filter((b) => b.label.trim()).length === 0) {
      toast({ title: "Add at least one labeled timeline block", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    setLines([]); setAiDraft(""); setAuthorshipScore(0); setProjectId(null);
    setEditingLineId(null); setRemixLineId(null);

    try {
      const body =
        lyricsMode === "simple"
          ? { mode: "simple", story: story.trim(), genre, bpm: bpm ? parseInt(bpm) : undefined }
          : {
              mode: "advanced",
              genre, bpm: bpm ? parseInt(bpm) : undefined,
              key: advKey, vocalType: advVocalType, genreTags: genre,
              timelineBlocks: timelineBlocks.filter((b) => b.label.trim()).map((b, i) => ({
                timestampMs: b.timestampMs, label: b.label, sectionType: b.sectionType, sortOrder: i,
              })),
            };

      const res = await fetch("/api/lyrics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { lyrics: string; stylePrompt: string; lines: LineState[] };

      setAiDraft(data.lyrics);
      setLines(data.lines);
      setStylePrompt(data.stylePrompt);
      setGenerationCount((c) => c + 1);
    } catch {
      toast({ title: "Generation failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }, [lyricsMode, story, genre, bpm, advKey, advVocalType, timelineBlocks, generationCount, isPro, toast]);

  // ── Fetch rhymes ──────────────────────────────────────────────────────────
  const fetchRhymes = useCallback(async (word: string) => {
    if (!word || word.length < 2) { setRhymes([]); setRhymeWord(""); return; }
    rhymeTarget.current = word;
    setRhymeWord(word); setIsLoadingRhymes(true);
    try {
      const res = await fetch("/api/lyrics/rhymes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, genre }),
      });
      if (res.ok && rhymeTarget.current === word) {
        const data = await res.json() as { rhymes: string[] };
        setRhymes(data.rhymes);
      }
    } catch { /* silent */ } finally {
      setIsLoadingRhymes(false);
    }
  }, [genre]);

  // ── Line editing ──────────────────────────────────────────────────────────
  const startEdit = useCallback((line: LineState) => {
    setRemixLineId(null); setRemixInstruction("");
    setEditingLineId(line.id); setEditText(line.text);
  }, []);

  const saveEdit = useCallback((lineId: string, newText: string) => {
    if (!newText.trim()) { setEditingLineId(null); return; }
    setLines((prev) => {
      const oldLine = prev.find((l) => l.id === lineId);
      if (!oldLine || oldLine.text === newText) { setEditingLineId(null); return prev; }
      const updated = prev.map((l) =>
        l.id === lineId ? { ...l, text: newText, isHumanEdited: true } : l
      );
      // Log forensic entry (fire-and-forget)
      if (projectId) {
        const currentText = lyricsFromLines(updated);
        const scoreBefore = authorshipScore;
        const scoreAfter = levenshteinPercent(aiDraft, currentText);
        fetch("/api/lyrics/forensic-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId, editType: "manual_edit",
            lineIndex: prev.findIndex((l) => l.id === lineId),
            originalText: oldLine.text, newText,
            levenshteinDelta: Math.abs(newText.length - oldLine.text.length),
            authorshipScoreBefore: scoreBefore, authorshipScoreAfter: scoreAfter,
          }),
        }).catch(() => {});
      }
      return updated;
    });
    setEditingLineId(null); setRhymes([]); setRhymeWord("");
  }, [projectId, aiDraft, authorshipScore]);

  // ── Surgical remix ────────────────────────────────────────────────────────
  const startRemix = useCallback((line: LineState) => {
    setEditingLineId(null);
    setRemixLineId(line.id); setRemixInstruction("");
  }, []);

  const triggerRemix = useCallback(async (lineId: string) => {
    const lineIndex = lines.findIndex((l) => l.id === lineId);
    const line = lines[lineIndex];
    if (!line) return;

    const lyricLines = lines.filter((l) => l.type === "lyric");
    const lyricIdx = lyricLines.findIndex((l) => l.id === lineId);
    const prevLine = lyricLines[lyricIdx - 1]?.text;
    const nextLine = lyricLines[lyricIdx + 1]?.text;

    setIsRemixing(true);
    try {
      const res = await fetch("/api/lyrics/regenerate-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line: line.text, instruction: remixInstruction || undefined,
          sectionLabel: line.sectionContext, genre,
          songConcept: story || `${genre} song`,
          prevLine, nextLine,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { variations: string[] };
      setRemixVariations(data.variations);
    } catch {
      toast({ title: "Remix failed", description: "Please try again.", variant: "destructive" });
      setRemixLineId(null);
    } finally {
      setIsRemixing(false);
    }
  }, [lines, remixInstruction, genre, story, toast]);

  const pickVariation = useCallback((lineId: string, variation: string) => {
    const lineIndex = lines.findIndex((l) => l.id === lineId);
    const oldLine = lines[lineIndex];
    if (!oldLine) return;

    setLines((prev) => prev.map((l) =>
      l.id === lineId ? { ...l, text: variation, isHumanEdited: true } : l
    ));

    // Log forensic entry
    if (projectId) {
      const updated = lines.map((l) => l.id === lineId ? { ...l, text: variation } : l);
      const currentText = lyricsFromLines(updated);
      const scoreAfter = levenshteinPercent(aiDraft, currentText);
      fetch("/api/lyrics/forensic-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId, editType: "ai_line_regen",
          lineIndex, originalText: oldLine.text, newText: variation,
          regenInstruction: remixInstruction,
          levenshteinDelta: Math.abs(variation.length - oldLine.text.length),
          authorshipScoreBefore: authorshipScore, authorshipScoreAfter: scoreAfter,
        }),
      }).catch(() => {});
    }

    setRemixLineId(null); setRemixVariations([]); setRemixInstruction("");
    toast({ title: "Line updated", description: "Your authorship meter has been updated." });
  }, [lines, projectId, aiDraft, authorshipScore, remixInstruction, toast]);

  // ── Style convert ─────────────────────────────────────────────────────────
  const handleConvertStyle = useCallback(async () => {
    if (!styleInput.trim()) return;
    setIsConvertingStyle(true);
    try {
      const res = await fetch("/api/lyrics/convert-style", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ styleDescription: styleInput.trim() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { styleTags: string };
      setConvertedStyle(data.styleTags);
    } catch {
      toast({ title: "Style conversion failed", variant: "destructive" });
    } finally {
      setIsConvertingStyle(false);
    }
  }, [styleInput, toast]);

  // ── Push to Suno / Udio ───────────────────────────────────────────────────
  const handlePushTo = useCallback(async (platform: "suno" | "udio") => {
    const styleText = convertedStyle || styleInput || stylePrompt;
    const lyricsText = lyricsFromLines(lines);
    const clip = `Style: ${styleText}\n\nLyrics:\n${lyricsText}`;
    try {
      await navigator.clipboard.writeText(clip);
      setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2500);
      toast({ title: "Copied!", description: `Opening ${platform === "suno" ? "Suno" : "Udio"} — paste in Style + Lyrics fields.` });
    } catch { /* fallback */ }
    window.open(platform === "suno" ? "https://suno.com/create" : "https://udio.com", "_blank", "noopener");
  }, [convertedStyle, styleInput, stylePrompt, lines, toast]);

  // ── Save project ──────────────────────────────────────────────────────────
  const handleSaveProject = useCallback(async () => {
    if (!aiDraft) return;
    setIsSaving(true);
    try {
      const id = projectId ?? randomUUID_client();
      if (!projectId) {
        const res = await fetch("/api/lyrics/project", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aiDraft, title: story.slice(0, 40) || "Untitled", genre,
            bpm: bpm ? parseInt(bpm) : undefined,
            mode: lyricsMode,
            storyPrompt: story || undefined,
            key: lyricsMode === "advanced" ? advKey : undefined,
            vocalType: lyricsMode === "advanced" ? advVocalType : undefined,
            stylePrompt: convertedStyle || stylePrompt,
            linesState: lines, generationCount,
          }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json() as { id: string };
        setProjectId(data.id);
      } else {
        await fetch("/api/lyrics/revise", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId, content: lyricsFromLines(lines),
            linesState: lines, editType: "manual_edit",
          }),
        });
      }
      toast({ title: "Project saved", description: "Forensic revision history logged." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [aiDraft, projectId, story, genre, bpm, lyricsMode, advKey, advVocalType, convertedStyle, stylePrompt, lines, generationCount, toast]);

  const handleReset = () => {
    setAiDraft(""); setLines([]); setStylePrompt(""); setAuthorshipScore(0);
    setEditingLineId(null); setRemixLineId(null); setProjectId(null);
    setRhymes([]); setRhymeWord("");
  };

  const downloadCertificate = async () => {
    if (!projectId) {
      toast({ title: "Save your project first", description: "Save and edit to 25% authorship before certifying.", variant: "destructive" });
      return;
    }
    type CertResponse = { title: string; genre: string | null; authorshipScore: number; certifiedAt: string; embedToken: string; embedUrl: string };
    let cert: CertResponse;
    try {
      const r = await fetch(`/api/lyrics/certificate/${projectId}`, { credentials: "include" });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        toast({ title: "Certificate unavailable", description: d.error || "Could not verify eligibility.", variant: "destructive" });
        return;
      }
      cert = (await r.json()) as CertResponse;
    } catch {
      toast({ title: "Error", description: "Could not reach the certification service.", variant: "destructive" });
      return;
    }

    setEmbedUrl(cert.embedUrl);
    setEmbedToken(cert.embedToken);
    setShowEmbed(true);

    const songTitle = (cert.title || `${cert.genre ?? genre} Work`).slice(0, 80);
    const date = new Date(cert.certifiedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const fingerprint = `GKP-${cert.embedToken.slice(0, 8).toUpperCase()}-${cert.embedToken.slice(8, 16).toUpperCase()}`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>IP Certificate</title>
<style>
  @page { size: letter landscape; margin: 0; }
  body { font-family: Georgia, "Times New Roman", serif; margin: 0; background: #0f0f0f; color: #1a1a1a; }
  .cert { max-width: 960px; margin: 32px auto; background: #fffdf6; border: 10px double #c9a227; padding: 56px 64px; text-align: center; position: relative; }
  .seal { font-size: 12px; font-weight: bold; letter-spacing: 4px; text-transform: uppercase; color: #c9a227; }
  h1 { font-size: 32px; margin: 18px 0 6px; color: #161616; }
  .badge { display: inline-block; margin: 14px 0; padding: 8px 20px; border: 2px solid #2a7a2a; border-radius: 999px; color: #2a7a2a; font-weight: bold; letter-spacing: 1px; text-transform: uppercase; font-size: 13px; }
  .title { font-size: 26px; font-style: italic; margin: 28px 0 6px; }
  .row { font-size: 14px; color: #444; margin: 6px 0; }
  .score { font-size: 20px; font-weight: bold; color: #2a7a2a; margin: 22px 0; }
  .legal { font-size: 12px; color: #555; max-width: 640px; margin: 20px auto 0; line-height: 1.5; }
  .footer { margin-top: 36px; border-top: 2px solid #c9a227; padding-top: 16px; font-size: 10px; color: #888; }
  .fp { background: #f5f0e8; border: 1px solid #d4b96e; border-radius: 4px; padding: 6px 12px; display: inline-block; margin-top: 10px; font-family: monospace; font-size: 12px; letter-spacing: 2px; color: #8a6914; }
  @media print { body { background: #fff; } .cert { margin: 0 auto; } }
</style></head>
<body><div class="cert">
  <div class="seal">Gravel King Productions · Engine 2 IP Pipeline</div>
  <h1>Certificate of Human–AI Collaborative Authorship</h1>
  <div class="badge">Certified Human-AI Collaborative Work</div>
  <div class="title">&ldquo;${songTitle.replace(/</g, "&lt;")}&rdquo;</div>
  <div class="row">Genre: ${cert.genre ?? genre}</div>
  <div class="row">Date Certified: ${date}</div>
  <div class="score">Human Authorship Score: ${cert.authorshipScore}%</div>
  <div class="legal">This document certifies that the named work contains sufficient human creative
  expression — through manual line-by-line editing and reconfiguration of AI-generated elements —
  to support a claim of human authorship under current U.S. Copyright Office guidance. The complete
  forensic edit ledger is retained on file.</div>
  <div class="footer">Verified by forensic authorship ledger<br><div class="fp">${fingerprint}</div></div>
</div>
<script>window.onload=function(){setTimeout(function(){window.print();},400);};<\/script>
</body></html>`;
    const w = window.open("", "_blank", "width=1000,height=760");
    if (!w) {
      toast({ title: "Pop-up blocked", description: "Allow pop-ups to open the printable certificate.", variant: "destructive" });
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const hasOutput = lines.length > 0;
  const isEligible = authorshipScore >= 25;
  const effectiveStyle = convertedStyle || styleInput || stylePrompt;
  const generationLimitReached = generationCount >= 2 && !isPro;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Music2 className="w-6 h-6 text-amber-500" />
            <span className="text-xs font-bold tracking-widest uppercase text-amber-500">Songwriting Studio</span>
            <ToolHelp
              title="Songwriting Studio"
              summary="AI co-writes a full song from your idea. Free gives you the draft; Pro lets you edit line-by-line and certify your authorship."
              steps={[
                "Enter a theme, mood or lyric seed and pick a genre.",
                "Generate — Gemini writes the complete song.",
                "Pro: edit line-by-line, certify your human–AI authorship, and send it to Suno.",
              ]}
              note="Free drafts carry no IP rights — only Pro edits establish certified authorship."
            />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Build it here. Send it to Suno.</h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            Gemini writes the full song. Pro users edit line-by-line and lock in their IP. Free users get the AI draft — no IP rights.
          </p>
        </div>

        {/* ── STEP 1: Lyrics ── */}
        <div className="rounded-2xl border border-border/40 bg-card/60 p-6 space-y-4">
          <StepBadge n="1" label="Your Lyrics" />

          {/* Mode toggle */}
          <div className="flex rounded-lg border border-border/40 bg-background/40 p-0.5 gap-0.5">
            {(["simple", "advanced"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setLyricsMode(m)}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${lyricsMode === m ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "simple" ? "💡 Simple" : "🎛️ Advanced Timeline"}
              </button>
            ))}
          </div>

          {/* Simple mode */}
          {lyricsMode === "simple" && (
            <div className="space-y-4">
              <Textarea
                placeholder="What is your song about? Describe a feeling, story, moment, relationship. The more real, the better the lyrics."
                className="min-h-[110px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50"
                value={story}
                onChange={(e) => setStory(e.target.value)}
                maxLength={1000}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Genre</label>
                  <select className="w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm focus:outline-none focus:border-amber-500/50" value={genre} onChange={(e) => setGenre(e.target.value)}>
                    {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">BPM <span className="font-normal">(optional)</span></label>
                  <Input type="number" placeholder="e.g. 90" className="bg-background/60 border-border/50 focus:border-amber-500/50" value={bpm} onChange={(e) => setBpm(e.target.value)} min={40} max={200} />
                </div>
              </div>
            </div>
          )}

          {/* Advanced mode */}
          {lyricsMode === "advanced" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Genre</label>
                  <select className="w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm focus:outline-none" value={genre} onChange={(e) => setGenre(e.target.value)}>
                    {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">BPM</label>
                  <Input type="number" placeholder="e.g. 90" className="bg-background/60 border-border/50" value={bpm} onChange={(e) => setBpm(e.target.value)} min={40} max={200} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Key</label>
                  <select className="w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm focus:outline-none" value={advKey} onChange={(e) => setAdvKey(e.target.value)}>
                    {KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Vocal Type</label>
                  <select className="w-full rounded-md border border-border/50 bg-background/60 px-3 py-2 text-sm focus:outline-none" value={advVocalType} onChange={(e) => setAdvVocalType(e.target.value)}>
                    {VOCAL_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">Song Timeline</label>
                <TimelineCanvas blocks={timelineBlocks} onChange={setTimelineBlocks} />
              </div>
            </div>
          )}

          {/* Generation paywall warning */}
          {generationLimitReached && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <Lock className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-400">Free generation limit reached</p>
                <p className="text-xs text-amber-400/70">2 free generations used. Upgrade to Pro for unlimited.</p>
              </div>
              <a href="/pricing" className="text-xs font-bold text-amber-400 hover:text-amber-300 whitespace-nowrap">Upgrade →</a>
            </div>
          )}

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || generationLimitReached || (lyricsMode === "simple" && story.trim().length < 5)}
            className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-3"
          >
            {isGenerating
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Writing lyrics…</>
              : <><Sparkles className="w-4 h-4 mr-2" />{hasOutput ? "Regenerate Full Song" : "Generate Lyrics"}</>}
          </Button>

          {!isPro && (
            <p className="text-[10px] text-center text-muted-foreground/50">
              {2 - generationCount} free generation{2 - generationCount !== 1 ? "s" : ""} remaining
            </p>
          )}
        </div>

        {/* ── STEP 2: Style ── */}
        <div className="rounded-2xl border border-border/40 bg-card/60 p-6 space-y-4">
          <StepBadge n="2" label="Your Style" />
          <Textarea
            placeholder={"Describe the vibe, mood, genre — or reference an artist or song.\n\nExamples:\n• dark trap, rainy midnight, heavy 808s\n• sounds like Future meets James Blake\n• Kendrick Lamar storytelling, cinematic, orchestral trap"}
            className="min-h-[100px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50"
            value={styleInput}
            onChange={(e) => setStyleInput(e.target.value)}
            maxLength={500}
          />
          <Button onClick={handleConvertStyle} disabled={isConvertingStyle || styleInput.trim().length < 3} variant="outline" className="w-full border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-semibold">
            {isConvertingStyle ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Converting…</> : <><Wand2 className="w-4 h-4 mr-2" />Convert to Suno Style Tags</>}
          </Button>
          {convertedStyle && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Style tags (editable):</p>
                <button onClick={async () => { await navigator.clipboard.writeText(convertedStyle); setStyleCopied(true); setTimeout(() => setStyleCopied(false), 1800); }} className="p-1 rounded hover:bg-border/20">
                  {styleCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
              </div>
              <Input value={convertedStyle} onChange={(e) => setConvertedStyle(e.target.value)} className="bg-background/60 border-amber-500/30 text-sm font-mono" />
            </div>
          )}
        </div>

        {/* ── OUTPUT: Line-by-line editor ── */}
        {hasOutput && (
          <div className="space-y-5">

            {/* Status banner */}
            {isEligible ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-400">Copyright Registered Goal Achieved! Human Ownership Locked.</p>
                  <p className="text-xs text-emerald-400/70">Your edits qualify these lyrics for copyright documentation.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-rose-400">AI Draft Status (Public Domain Only)</p>
                  <p className="text-xs text-rose-400/70">
                    {isPro ? "Edit lines below until your Authorship Meter hits 25% to lock in your IP." : "Upgrade to Pro to edit lines and claim authorship rights."}
                  </p>
                </div>
              </div>
            )}

            {/* Lyric editor card */}
            <div className="rounded-2xl border border-border/40 bg-card/60 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/40">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{genre} Lyrics</span>
                  <Badge variant="outline" className={`text-xs ${isEligible ? "border-emerald-500/40 text-emerald-400" : "border-rose-500/40 text-rose-400"}`}>
                    {isEligible ? "Stamped" : "AI Draft"}
                  </Badge>
                  {isPro && <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400/70">Pro Editor</Badge>}
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleReset}>
                  <RotateCcw className="w-3 h-3 mr-1" />New
                </Button>
              </div>

              {/* Pro editor hint */}
              {isPro && !isEligible && (
                <div className="px-4 py-2 bg-amber-500/5 border-b border-amber-500/15 flex items-center gap-2">
                  <Edit3 className="w-3.5 h-3.5 text-amber-500/60 shrink-0" />
                  <p className="text-[11px] text-amber-500/70">
                    Tap any line to edit it directly. Hover for <strong>↻</strong> to get 3 AI variations with your instruction.
                    <span className="text-emerald-400/70 ml-1">Green = human edited.</span>
                  </p>
                </div>
              )}

              {!isPro && (
                <div className="px-4 py-2 bg-muted/20 border-b border-border/30 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-500/60 shrink-0" />
                  <p className="text-[11px] text-muted-foreground">
                    Free users: AI draft only — no IP rights. <a href="/pricing" className="text-amber-500 font-medium hover:underline">Upgrade to Pro</a> to edit line-by-line and lock your authorship.
                  </p>
                </div>
              )}

              <div className="p-4 space-y-0.5">
                {lines.map((line) => (
                  <LyricLineRow
                    key={line.id}
                    line={line}
                    isPro={isPro}
                    isEditing={editingLineId === line.id}
                    editText={editText}
                    remixMode={remixLineId === line.id}
                    remixInstruction={remixInstruction}
                    isRemixing={isRemixing}
                    onStartEdit={() => startEdit(line)}
                    onEditChange={(v) => setEditText(v)}
                    onSaveEdit={() => saveEdit(line.id, editText)}
                    onCancelEdit={() => { setEditingLineId(null); setRemixLineId(null); setRhymes([]); setRhymeWord(""); }}
                    onStartRemix={() => startRemix(line)}
                    onRemixInstructionChange={(v) => setRemixInstruction(v)}
                    onTriggerRemix={() => void triggerRemix(line.id)}
                    onFocus={(word) => { if (isPro) void fetchRhymes(word); }}
                    onInsertRhyme={(word) => {
                      const words = editText.split(" ");
                      words[words.length - 1] = word;
                      setEditText(words.join(" "));
                    }}
                    rhymeInsertTarget={editingLineId}
                  />
                ))}
              </div>
            </div>

            {/* Authorship meter */}
            <AuthorshipMeter score={authorshipScore} />

            {/* Rhyming tray (sticky bottom when editing) */}
            {isPro && editingLineId && (
              <RhymingTray
                rhymes={rhymes}
                word={rhymeWord}
                isLoading={isLoadingRhymes}
                onInsert={(word) => {
                  const words = editText.split(" ");
                  words[words.length - 1] = word;
                  setEditText(words.join(" "));
                }}
              />
            )}

            {/* Style display */}
            {effectiveStyle && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 space-y-1">
                <p className="text-xs font-semibold text-amber-500/70 uppercase tracking-wide">Style prompt for Suno</p>
                <p className="text-sm text-foreground/80 font-mono">{effectiveStyle}</p>
              </div>
            )}

            {/* Push to Suno */}
            <div className="rounded-xl border border-border/40 bg-card/60 p-5 space-y-4">
              <p className="text-sm font-semibold flex items-center gap-2"><Music2 className="w-4 h-4 text-amber-500" />Push to Suno</p>
              <ol className="space-y-2">
                {[
                  "Open Suno → Create → switch to Advanced mode",
                  "Optional: upload an instrumental from Voice Splitter as audio reference",
                  "Paste style tags into the Style field, use the Audio/Style influence slider",
                  "Paste your lyrics into the Lyrics field → Generate",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => void handlePushTo("suno")} className="bg-amber-500 hover:bg-amber-600 text-black font-bold">
                  {copiedAll ? <><Check className="w-4 h-4 mr-2" />Copied!</> : <><Copy className="w-4 h-4 mr-2" />Copy + Open Suno</>}
                  <ExternalLink className="w-3 h-3 ml-1.5 opacity-60" />
                </Button>
                <Button onClick={() => void handlePushTo("udio")} variant="outline" className="font-semibold border-border/50">
                  <Copy className="w-4 h-4 mr-2" />Copy + Open Udio
                  <ExternalLink className="w-3 h-3 ml-1.5 opacity-50" />
                </Button>
              </div>
            </div>

            {/* Pro features */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pro Features</p>
              {isPro ? (
                <div className="space-y-2">
                  <Button onClick={() => void handleSaveProject()} disabled={isSaving} className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold">
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
                  {isEligible ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Button onClick={() => void downloadCertificate()} variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 font-semibold text-xs">
                          <FileText className="w-3.5 h-3.5 mr-1.5" />Print Certificate
                        </Button>
                        <Button onClick={() => void downloadCertificate()} variant="outline" className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-semibold text-xs">
                          <Share2 className="w-3.5 h-3.5 mr-1.5" />Get Embed Code
                        </Button>
                      </div>
                      {/* Embed code panel — shown after cert fetch */}
                      {showEmbed && embedUrl && embedToken && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <Share2 className="w-4 h-4 text-amber-400" />
                            <span className="text-sm font-semibold text-amber-400">Your IP Embed Code</span>
                            <button onClick={() => setShowEmbed(false)} className="ml-auto text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            Paste this <code className="bg-muted/60 px-1 py-0.5 rounded text-amber-400">&lt;iframe&gt;</code> anywhere — your website, SoundCloud bio, press kit, or social profile. Anyone who clicks it sees your certified authorship proof.
                          </p>
                          {/* Fingerprint */}
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/60 border border-border/40">
                            <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="text-xs text-muted-foreground">Fingerprint:</span>
                            <span className="text-xs font-mono text-emerald-400 tracking-wider">
                              GKP-{embedToken.slice(0, 8).toUpperCase()}-{embedToken.slice(8, 16).toUpperCase()}
                            </span>
                          </div>
                          {/* The iframe code */}
                          <div className="relative">
                            <pre className="rounded-lg bg-background/80 border border-border/50 p-3 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">{`<iframe\n  src="${window.location.origin}${embedUrl}"\n  width="600"\n  height="400"\n  frameborder="0"\n  title="IP Certificate"\n  style="border-radius:8px;border:1px solid #c9a227;max-width:100%"\n></iframe>`}</pre>
                            <button
                              onClick={async () => {
                                const code = `<iframe\n  src="${window.location.origin}${embedUrl}"\n  width="600"\n  height="400"\n  frameborder="0"\n  title="IP Certificate"\n  style="border-radius:8px;border:1px solid #c9a227;max-width:100%"\n></iframe>`;
                                await navigator.clipboard.writeText(code);
                                setEmbedCopied(true);
                                setTimeout(() => setEmbedCopied(false), 2000);
                              }}
                              className="absolute top-2 right-2 p-1.5 rounded bg-muted/60 hover:bg-muted border border-border/40 transition-colors"
                              title="Copy embed code"
                            >
                              {embedCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                            </button>
                          </div>
                          {/* Direct link */}
                          <div className="flex items-center gap-2">
                            <a
                              href={embedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-amber-400 hover:text-amber-300 underline flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />View certificate page directly
                            </a>
                            <span className="text-xs text-muted-foreground">— share this URL directly too</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground/60 border-t border-border/30 pt-2">
                            The embed code is tied to this project's authorship score. If you edit further and recertify, generate a new code.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/30 text-xs text-muted-foreground">
                      <Lock className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
                      <span>Reach 25% authorship to unlock your shareable IP embed code + printable certificate.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <ProGate feature="Line-by-line surgical editor + AI variations" />
                  <ProGate feature="Rhyming tray — live suggestions while editing" />
                  <ProGate feature="Save Project + Forensic Authorship Ledger" />
                  <ProGate feature=".lrc Timed Lyric Export (BandLab, StarMaker)" />
                  <ProGate feature="Form PA Copyright PDF with Authorship Log" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Variation picker overlay */}
      {remixVariations.length > 0 && remixLineId && (
        <VariationPicker
          variations={remixVariations}
          instruction={remixInstruction}
          onPick={(v) => pickVariation(remixLineId, v)}
          onClose={() => { setRemixVariations([]); setRemixLineId(null); }}
        />
      )}
    </Layout>
  );
}

// Client-side UUID (no import needed — crypto is available in modern browsers)
function randomUUID_client(): string {
  return crypto.randomUUID();
}
