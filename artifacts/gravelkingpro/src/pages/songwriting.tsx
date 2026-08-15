import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Layout } from "@/components/layout";
import { ToolHelp } from "@/components/tool-help";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import {
  Sparkles, Music2, Lock, CheckCircle2, AlertTriangle, Loader2,
  FileText, Mic, Shield, ShieldCheck, ShieldAlert, Fingerprint,
  ArrowRight, Clock3, Wand2, RotateCcw, Trash2,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { StyleTagPills, appendStyleTag } from "@/components/style-tag-pills";
import { authorshipScore as computeAuthorshipScore } from "@workspace/authorship";

// ─── Types ────────────────────────────────────────────────────────────────────

type VocalMode = "lyrics" | "random" | "instrumental";
type VerifyState = "idle" | "checking" | "clear" | "flagged" | "unavailable";

type LineState = {
  id: string;
  type: "section" | "lyric" | "empty";
  text: string;
  aiOriginal: string;
  isHumanEdited: boolean;
  sectionContext: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DURATIONS = [
  { s: 60, label: "1:00" },
  { s: 90, label: "1:30" },
  { s: 120, label: "2:00" },
  { s: 150, label: "2:30" },
  { s: 180, label: "3:00" },
  { s: 240, label: "4:00" },
] as const;

const DRAFT_KEY = "gk:songwriting:v2";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function textToLines(aiDraft: string, current: string): LineState[] {
  const draftLines = aiDraft.split("\n");
  return current.split("\n").map((text, i) => {
    const orig = draftLines[i] ?? "";
    const isSection = /^\s*\[.+\]\s*$/.test(text);
    return {
      id: `l${i}`,
      type: text.trim() === "" ? "empty" : isSection ? "section" : "lyric",
      text,
      aiOriginal: orig,
      isHumanEdited: text !== orig,
      sectionContext: "verse",
    } as LineState;
  });
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function ProGate({ feature }: { feature: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/30 text-sm text-muted-foreground">
      <Lock className="w-3.5 h-3.5 text-amber-500/70 shrink-0" />
      <span>{feature}</span>
      <a href="/pricing" className="ml-auto text-amber-500 hover:text-amber-400 text-xs font-medium whitespace-nowrap">Upgrade →</a>
    </div>
  );
}

/**
 * Copyright verification chip — honest language: this is an AI screening for
 * recognizable commercial lyrics (incl. phonetic disguises), not a commercial
 * copyright-database lookup.
 */
function VerifyBadge({ state, matchedWork }: { state: VerifyState; matchedWork?: string }) {
  if (state === "idle") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Shield className="w-3.5 h-3.5" /> Not verified yet
      </span>
    );
  }
  if (state === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-sky-300">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI copyright screen running…
      </span>
    );
  }
  if (state === "clear") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
        <ShieldCheck className="w-3.5 h-3.5" /> Cleared by AI screening
      </span>
    );
  }
  if (state === "unavailable") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-400 font-medium">
        <ShieldAlert className="w-3.5 h-3.5" /> Screening service unavailable — not verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-rose-400 font-semibold">
      <ShieldAlert className="w-3.5 h-3.5" /> Flagged{matchedWork ? `: ${matchedWork}` : ""}
    </span>
  );
}

function AuthorshipMeter({ score }: { score: number }) {
  const eligible = score >= 25;
  const color = eligible ? "bg-emerald-500" : score >= 12 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold flex items-center gap-2">
          {eligible ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <FileText className="w-4 h-4 text-amber-500" />}
          Human Authorship
        </span>
        <span className={`font-bold ${eligible ? "text-emerald-400" : "text-muted-foreground"}`}>{score}%</span>
      </div>
      <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(2, score)}%` }} />
      </div>
      <p className={`text-xs font-semibold ${eligible ? "text-emerald-400" : "text-rose-400"}`}>
        {eligible
          ? "Copyright eligibility goal achieved — human ownership locked."
          : `AI draft status — rewrite ${Math.max(0, 25 - score)}% more in your own words to reach the 25% goal.`}
      </p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SongwritingStudio() {
  const { isPro, isDeveloper } = useAppState();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const hasAccess = isPro || isDeveloper;

  // ── Mode (deep-linkable via ?mode=advanced) ──────────────────────────────
  const [mode, setMode] = useState<"simple" | "advanced">(() => {
    try {
      return new URLSearchParams(window.location.search).get("mode") === "advanced" ? "advanced" : "simple";
    } catch {
      return "simple";
    }
  });

  // ── Shared: the RAW style prompt (atmosphere + beat style + genre in one box).
  // Sent to the server EXACTLY as typed — no client-side tag conversion.
  const [styleRaw, setStyleRaw] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [durationS, setDurationS] = useState<number>(120);

  // ── Advanced: lyrics module ───────────────────────────────────────────────
  const [lyricsText, setLyricsText] = useState("");
  const [aiDraft, setAiDraft] = useState(""); // last AI-generated draft (read-only pane)
  const [isWritingLyrics, setIsWritingLyrics] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ── Verification gate ─────────────────────────────────────────────────────
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [verifyMsg, setVerifyMsg] = useState<string>("");
  const [matchedWork, setMatchedWork] = useState<string | undefined>(undefined);
  /** The specific matching passage returned by the screening model (≤120 chars). */
  const [flaggedEvidence, setFlaggedEvidence] = useState<string | undefined>(undefined);
  /** Whether the AI rewrite suggestion box is expanded. */
  const [showRewriteBox, setShowRewriteBox] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteSuggestion, setRewriteSuggestion] = useState("");
  const verifiedTextRef = useRef<string>("");

  // ── Generation ────────────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // ── Import / possession stamp ─────────────────────────────────────────────
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importCertified, setImportCertified] = useState(false);
  const [isStamping, setIsStamping] = useState(false);
  const [lastStampAt, setLastStampAt] = useState<string | null>(null);
  // True when the last stamp was saved during a copyright-screen outage —
  // the stamp exists but must never be presented as screened/cleared.
  const [lastStampUnscreened, setLastStampUnscreened] = useState(false);

  const authorship = useMemo(
    () => (aiDraft && lyricsText ? computeAuthorshipScore(aiDraft, lyricsText) : lyricsText.trim() ? 100 : 0),
    [aiDraft, lyricsText],
  );

  // Whether this run will sing the user's own lyrics.
  const usesOwnLyrics = mode === "advanced" && !instrumental && lyricsText.trim().length >= 5;
  const effectiveVocalMode: VocalMode = instrumental
    ? "instrumental"
    : usesOwnLyrics
      ? "lyrics"
      : "random";

  // Verification is only demanded when the user's own lyrics will be sung/saved.
  const needsVerification = usesOwnLyrics;
  // "unavailable" counts as a completed screen attempt (fail-open policy):
  // saving/generating may proceed, but the UI never claims the lyrics cleared.
  const isVerifiedCurrent = (verifyState === "clear" || verifyState === "unavailable")
    && verifiedTextRef.current === lyricsText.trim();

  // Any lyric edit invalidates a previous verdict.
  useEffect(() => {
    if (verifyState !== "idle" && verifiedTextRef.current !== lyricsText.trim()) {
      setVerifyState("idle");
      setVerifyMsg("");
      setMatchedWork(undefined);
      setFlaggedEvidence(undefined);
      setShowRewriteBox(false);
      setRewriteSuggestion("");
    }
  }, [lyricsText, verifyState]);

  // ── Draft restore / persist ───────────────────────────────────────────────
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as {
        mode?: "simple" | "advanced"; styleRaw?: string; instrumental?: boolean;
        durationS?: number; lyricsText?: string; aiDraft?: string; projectId?: string | null;
      };
      // An explicit ?mode= in the URL wins over the remembered draft mode.
      const urlMode = new URLSearchParams(window.location.search).get("mode");
      if (d.mode && urlMode !== "advanced" && urlMode !== "simple") setMode(d.mode);
      if (d.styleRaw) setStyleRaw(d.styleRaw);
      if (typeof d.instrumental === "boolean") setInstrumental(d.instrumental);
      if (d.durationS) setDurationS(d.durationS);
      if (d.lyricsText) setLyricsText(d.lyricsText);
      if (d.aiDraft) setAiDraft(d.aiDraft);
      if (d.projectId) setProjectId(d.projectId);
    } catch { /* non-critical */ }
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          mode, styleRaw, instrumental, durationS, lyricsText, aiDraft, projectId,
        }));
      } catch { /* storage full — silent */ }
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [mode, styleRaw, instrumental, durationS, lyricsText, aiDraft, projectId]);

  // ── Verify lyrics (AI copyright screen) ───────────────────────────────────
  const runVerify = useCallback(async (): Promise<boolean> => {
    const text = lyricsText.trim();
    if (text.length < 5) return false;
    setVerifyState("checking");
    setVerifyMsg("");
    setMatchedWork(undefined);
    try {
      const res = await fetch("/api/lyrics/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as {
        verdict?: string; reason?: string; matchedWork?: string; evidence?: string;
        error?: string; screeningUnavailable?: boolean;
      };
      if (!res.ok) throw new Error(data.error || "Verification failed");
      verifiedTextRef.current = text;
      if (data.verdict === "flagged") {
        setVerifyState("flagged");
        setMatchedWork(data.matchedWork);
        setFlaggedEvidence(data.evidence || undefined);
        setShowRewriteBox(false);
        setRewriteSuggestion("");
        setVerifyMsg(data.reason || "These lyrics appear to reproduce a released song. Rewrite the matching passage in your own words.");
        return false;
      }
      if (data.screeningUnavailable) {
        // Fail-open policy: the outage never blocks songwriting, but we must
        // NOT claim the lyrics were cleared — mark them honestly as unscreened.
        setVerifyState("unavailable");
        setVerifyMsg("The AI copyright screen is temporarily unavailable. You can still save and generate, but these lyrics have NOT been screened. You can delete the project at any time.");
        return true;
      }
      setVerifyState("clear");
      return true;
    } catch (err) {
      setVerifyState("idle");
      toast({
        title: "Verification unavailable",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      return false;
    }
  }, [lyricsText, toast]);

  // ── Auto-generate lyrics (advanced, independent of song generation) ──────
  const handleWriteLyrics = useCallback(async () => {
    if (styleRaw.trim().length < 5) {
      toast({ title: "Describe your style first", description: "The style box drives the lyric writer.", variant: "destructive" });
      return;
    }
    setIsWritingLyrics(true);
    try {
      const res = await fetch("/api/lyrics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: "simple", story: styleRaw.trim(), genre: styleRaw.trim().slice(0, 60) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { lyrics: string };
      setAiDraft(data.lyrics);
      setLyricsText(data.lyrics);
      setProjectId(null);
      toast({ title: "Lyrics drafted", description: "Rewrite lines in your own words on the right to build your IP claim." });
    } catch {
      toast({ title: "Lyric generation failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsWritingLyrics(false);
    }
  }, [styleRaw, toast]);

  // ── Save lyrics project (gated on verification) ───────────────────────────
  const handleSaveProject = useCallback(async () => {
    const text = lyricsText.trim();
    if (!text) return;
    // Verification gate for library saves — run it now if not current.
    if (!isVerifiedCurrent) {
      const ok = await runVerify();
      if (!ok) return;
    }
    setIsSaving(true);
    try {
      const lines = textToLines(aiDraft || text, text);
      if (!projectId) {
        const res = await fetch("/api/lyrics/project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            aiDraft: aiDraft || text,
            content: text,
            title: text.split("\n").find((l) => l.trim() && !/^\s*\[/.test(l))?.slice(0, 40) || "Untitled",
            genre: styleRaw.slice(0, 40) || "Song",
            mode: "simple",
            storyPrompt: styleRaw || undefined,
            stylePrompt: styleRaw,
            linesState: lines,
            generationCount: aiDraft ? 1 : 0,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string; code?: string; matchedWork?: string; evidence?: string } | null;
          if (body?.code === "lyrics_flagged") {
            setVerifyState("flagged");
            setMatchedWork(body.matchedWork);
            setFlaggedEvidence(body.evidence || undefined);
            setShowRewriteBox(false);
            setRewriteSuggestion("");
            setVerifyMsg(body.error || "These lyrics appear to reproduce a released song. Rewrite the matching passage in your own words.");
            verifiedTextRef.current = text;
            toast({
              title: "Lyrics flagged by the AI copyright screen",
              description: body.error || "Rewrite the matching passage in your own words, then save again.",
              variant: "destructive",
            });
            return;
          }
          throw new Error(body?.error || "Save failed");
        }
        const data = (await res.json()) as { id: string; screeningUnavailable?: boolean; evidence?: string };
        setProjectId(data.id);
        if (data.screeningUnavailable) {
          setVerifyState("unavailable");
          verifiedTextRef.current = text;
          toast({
            title: "Saved — but NOT screened",
            description: "The AI copyright screen is temporarily unavailable, so these lyrics were saved unscreened. You can delete the project at any time.",
          });
          return;
        }
      } else {
        const res = await fetch("/api/lyrics/revise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ projectId, content: text, linesState: lines, editType: "manual_edit" }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
          if (body?.code === "lyrics_flagged") {
            setVerifyState("flagged");
            setFlaggedEvidence((body as { evidence?: string }).evidence || undefined);
            setShowRewriteBox(false);
            setRewriteSuggestion("");
            setVerifyMsg(body.error || "These lyrics appear to reproduce a released song. Rewrite the matching passage in your own words.");
            verifiedTextRef.current = text;
            toast({
              title: "Lyrics flagged by the AI copyright screen",
              description: body.error || "Rewrite the matching passage in your own words, then save again.",
              variant: "destructive",
            });
            return;
          }
          throw new Error(body?.error || "Save failed");
        }
        const revData = (await res.json().catch(() => ({}))) as { screeningUnavailable?: boolean };
        if (revData.screeningUnavailable) {
          setVerifyState("unavailable");
          verifiedTextRef.current = text;
          toast({
            title: "Revision saved — but NOT screened",
            description: "The AI copyright screen is temporarily unavailable, so this revision was saved unscreened. You can delete the project at any time.",
          });
          return;
        }
      }
      toast({ title: "Lyrics saved", description: "Verified and saved to your library with the forensic revision ledger." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [lyricsText, aiDraft, projectId, styleRaw, isVerifiedCurrent, runVerify, toast]);

  // ── Delete saved project (owner-scoped) ───────────────────────────────────
  const [isDeleting, setIsDeleting] = useState(false);
  const handleDeleteProject = useCallback(async () => {
    if (!projectId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/lyrics/project/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Delete failed");
      }
      setProjectId(null);
      setVerifyState("idle");
      setVerifyMsg("");
      setMatchedWork(undefined);
      toast({ title: "Project deleted", description: "The lyrics project and its revision ledger were removed from your library." });
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [projectId, toast]);

  // ── Generate the song ─────────────────────────────────────────────────────
  const handleGenerateSong = useCallback(async () => {
    if (!hasAccess) {
      toast({
        title: "GravelKing Pro required",
        description: "Upgrade to GravelKing Pro to generate AI tracks.",
        variant: "destructive",
      });
      return;
    }
    if (styleRaw.trim().length < 5) {
      toast({ title: "Describe your style first", description: "Atmosphere, beat style, genre — one box, your words.", variant: "destructive" });
      return;
    }

    // Verification gate: own lyrics must clear the AI copyright screen first.
    if (needsVerification && !isVerifiedCurrent) {
      const ok = await runVerify();
      if (!ok) return;
    }

    setIsGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/mlk/v35/generate-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lyricId: projectId,
          text: effectiveVocalMode === "lyrics" ? lyricsText : "",
          stylePrompt: styleRaw.trim(), // RAW user prompt — server handles Lyria-side sanitizing
          vocalMode: effectiveVocalMode,
          durationS: mode === "advanced" ? durationS : undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        trackId?: string;
        title?: string;
        certificationStatus?: "sealed" | "skipped_match" | "skipped_unavailable";
      };
      if (!res.ok || !data.trackId) {
        const msg = data.error || `Generation failed (HTTP ${res.status})`;
        if (data.code === "lyrics_flagged") {
          setVerifyState("flagged");
          setVerifyMsg(msg);
        }
        if (res.status === 422 || data.code === "content_blocked") {
          toast({ title: "Prompt flagged", description: msg, variant: "destructive" });
        }
        throw new Error(msg);
      }
      if (data.certificationStatus === "skipped_unavailable") {
        toast({
          title: "Track generated — stamp skipped",
          description: "The copyright scan is temporarily unavailable. Your track was still saved and is ready to use.",
        });
      } else if (data.certificationStatus === "skipped_match") {
        toast({
          title: "Track generated — stamp skipped",
          description: "A commercial catalog match was detected. Your track was still saved without an IP stamp.",
        });
      }
      // Track is auto-saved to the library — land the user on its player.
      navigate(`/library?track=${encodeURIComponent(data.trackId)}`);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed.");
      setIsGenerating(false);
    }
  }, [hasAccess, styleRaw, needsVerification, isVerifiedCurrent, runVerify, projectId,
      effectiveVocalMode, lyricsText, mode, durationS, navigate, toast]);

  // ── Import stamp ──────────────────────────────────────────────────────────
  const handleStampImport = useCallback(async () => {
    if (importText.trim().length < 5 || !importCertified) return;
    setIsStamping(true);
    try {
      // Imports also pass the copyright screen before entering the library.
      const vRes = await fetch("/api/lyrics/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: importText }),
      });
      const v = (await vRes.json().catch(() => ({}))) as { verdict?: string; reason?: string };
      if (vRes.ok && v.verdict === "flagged") {
        throw new Error(v.reason || "These lyrics appear to reproduce a released song.");
      }
      const res = await fetch("/api/lyrics/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text: importText,
          certifiedHumanAuthor: importCertified,
          certificationText: "I certify these lyrics are my original human work and were NOT produced by an AI.",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        import?: { stampedAt?: string };
        screeningUnavailable?: boolean;
      };
      if (!res.ok) throw new Error(data.error || "Failed to stamp lyrics");
      setImportText("");
      setImportCertified(false);
      setLastStampAt(data.import?.stampedAt ?? new Date().toISOString());
      setLastStampUnscreened(data.screeningUnavailable === true);
      if (data.screeningUnavailable) {
        // Honest labeling: the stamp exists, but the copyright screen did NOT run.
        toast({
          title: "Stamped — copyright screen unavailable",
          description:
            "Your possession stamp was saved, but the AI copyright screen could not run. These lyrics have NOT been screened.",
        });
      } else {
        toast({ title: "Lyrics stamped ✓", description: "SHA-256 possession stamp saved to My Protected Lyrics." });
      }
    } catch (err) {
      toast({
        title: "Stamp failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsStamping(false);
    }
  }, [importText, importCertified, toast]);

  const resetAll = () => {
    setStyleRaw(""); setLyricsText(""); setAiDraft(""); setProjectId(null);
    setVerifyState("idle"); setVerifyMsg(""); setMatchedWork(undefined); setGenError(null);
    setFlaggedEvidence(undefined); setShowRewriteBox(false); setRewriteSuggestion("");
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* non-critical */ }
  };

  // ── Rewrite a flagged passage with AI ────────────────────────────────────
  const handleRewritePassage = useCallback(async () => {
    if (!flaggedEvidence) return;
    setIsRewriting(true);
    setShowRewriteBox(true);
    setRewriteSuggestion("");
    try {
      const res = await fetch("/api/lyrics/rewrite-passage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          passage: flaggedEvidence,
          matchedWork,
          songContext: lyricsText.slice(0, 800),
        }),
      });
      const data = (await res.json()) as { rewrite?: string; error?: string };
      if (!res.ok || !data.rewrite) throw new Error(data.error || "Rewrite failed");
      setRewriteSuggestion(data.rewrite);
    } catch (err) {
      toast({
        title: "AI rewrite unavailable",
        description: err instanceof Error ? err.message : "Please rewrite the passage manually.",
        variant: "destructive",
      });
      setShowRewriteBox(false);
    } finally {
      setIsRewriting(false);
    }
  }, [flaggedEvidence, matchedWork, lyricsText, toast]);

  // Apply the accepted rewrite suggestion — replace the flagged passage in the
  // lyrics text, then immediately re-run verification so the user sees a new verdict.
  const handleAcceptRewrite = useCallback(async () => {
    if (!flaggedEvidence || !rewriteSuggestion.trim()) return;
    // Replace the flagged passage with the accepted rewrite (case-sensitive first,
    // then case-insensitive fallback so the match survives minor capitalization drift).
    const updated = lyricsText.includes(flaggedEvidence)
      ? lyricsText.replace(flaggedEvidence, rewriteSuggestion.trim())
      : lyricsText.replace(
          new RegExp(flaggedEvidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
          rewriteSuggestion.trim(),
        );
    setLyricsText(updated);
    setShowRewriteBox(false);
    setRewriteSuggestion("");
    // verifyState reset is handled by the lyricsText useEffect above, but we
    // also need the updated text to be committed before runVerify reads it.
    // Schedule verify after the state flush.
    setTimeout(() => { void runVerify(); }, 0);
  }, [flaggedEvidence, rewriteSuggestion, lyricsText, runVerify]);

  // ── The style box + suggestions (shared between both modes) ──────────────
  const styleBox = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium">
          Style — atmosphere, beat style, genre <span className="text-amber-500">*</span>
        </label>
        <Textarea
          placeholder={"Describe the whole vibe in your own words — it goes to the engine exactly as written.\n\nExamples:\n• dark trap, rainy midnight streets, heavy 808s, whispered hook\n• sunny reggaeton beach party, brass stabs, festival energy\n• slow-burn southern gospel soul, warm organ, handclaps"}
          className="min-h-[110px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50"
          value={styleRaw}
          onChange={(e) => setStyleRaw(e.target.value)}
          maxLength={500}
          data-testid="input-style-raw"
        />
      </div>
      {/* Inline suggestions — tap to append. Raw text only, never converted. */}
      <StyleTagPills
        lyricsOn={!instrumental}
        onAppend={(tag) => setStyleRaw((p) => appendStyleTag(p, tag).slice(0, 500))}
      />
      <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Mic className={`w-4 h-4 ${instrumental ? "text-muted-foreground" : "text-emerald-400"}`} />
          <span className="text-xs font-semibold">{instrumental ? "Instrumental — no vocals" : "Vocals ON"}</span>
        </div>
        <Switch
          checked={instrumental}
          onCheckedChange={setInstrumental}
          aria-label="Instrumental mode"
          data-testid="switch-instrumental"
        />
      </div>
    </div>
  );

  const generateButton = (
    <div className="space-y-2">
      <Button
        onClick={() => void handleGenerateSong()}
        disabled={isGenerating || styleRaw.trim().length < 5 || (needsVerification && verifyState === "flagged")}
        aria-disabled={!hasAccess}
        className={`w-full font-bold py-3 ${hasAccess
          ? "bg-emerald-500 hover:bg-emerald-600 text-black"
          : "bg-muted text-muted-foreground opacity-60 cursor-not-allowed hover:bg-muted"}`}
        data-testid="button-generate-song"
      >
        {isGenerating
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating your track (2–3 min)…</>
          : <><Music2 className="w-4 h-4 mr-2" />Generate Song{!hasAccess && " — Pro"}</>}
      </Button>
      <p className="text-[11px] text-muted-foreground leading-relaxed text-center">
        {!hasAccess
          ? "Upgrade to GravelKing Pro to generate AI tracks."
          : instrumental
            ? "A pure instrumental from your style prompt — IP-certified, saved unmastered to your library."
            : effectiveVocalMode === "random"
              ? "The AI writes and sings its own lyrics to match your style — IP-certified, saved unmastered to your library."
              : "Your verified lyrics are hash-stamped and sung exactly as written — IP-certified, saved unmastered to your library."}
      </p>
      {genError && (
        <p className="text-xs text-rose-400 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{genError}
        </p>
      )}
    </div>
  );

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Music2 className="w-6 h-6 text-amber-500" />
            <span className="text-xs font-bold tracking-widest uppercase text-amber-500">Songwriting Studio</span>
            <ToolHelp
              title="Songwriting Studio"
              summary="Describe a style, get a full AI song saved straight to your library. Advanced mode adds your own lyrics with copyright verification and IP tracking."
              steps={[
                "Simple: describe the vibe, hit Generate — done.",
                "Advanced: add or auto-write lyrics, rewrite them in your own words, verify, then generate.",
                "Every track lands unmastered in My Library — master it there when you're ready.",
              ]}
              note="Own-lyric songs pass an AI copyright screen (recognizable-lyrics detection) before generation."
            />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Describe it. Generate it. It's in your library.</h1>
          <p className="text-muted-foreground text-sm max-w-lg mx-auto">
            One style box drives the whole song. Advanced mode adds your own verified lyrics and IP certification.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-border/40 bg-background/40 p-0.5 gap-0.5 max-w-md mx-auto">
          {(["simple", "advanced"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 text-sm py-2 rounded-md font-medium transition-colors ${mode === m ? "bg-amber-500/20 text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
              data-testid={`button-mode-${m}`}
            >
              {m === "simple" ? "💡 Simple" : "🎛️ Advanced"}
            </button>
          ))}
        </div>

        {/* ══ SIMPLE MODE — style box + generate, nothing else ══ */}
        {mode === "simple" && (
          <div className="rounded-2xl border border-border/40 bg-card/60 p-6 space-y-4 max-w-2xl mx-auto">
            {styleBox}
            {generateButton}
          </div>
        )}

        {/* ══ ADVANCED MODE ══ */}
        {mode === "advanced" && (
          <div className="space-y-6">

            {/* Style + duration */}
            <div className="rounded-2xl border border-border/40 bg-card/60 p-6 space-y-4">
              {styleBox}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                  <Clock3 className="w-3.5 h-3.5" /> Target length
                </label>
                <div className="grid grid-cols-6 gap-1.5">
                  {DURATIONS.map((d) => (
                    <button
                      key={d.s}
                      type="button"
                      onClick={() => setDurationS(d.s)}
                      className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        durationS === d.s
                          ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
                          : "border-border/40 bg-background/40 text-muted-foreground hover:border-amber-500/30"
                      }`}
                      data-testid={`button-duration-${d.s}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Lyrics module — hidden entirely in instrumental mode */}
            {!instrumental && (
              <div className="rounded-2xl border border-border/40 bg-card/60 p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-500" />
                    <h2 className="text-sm font-bold">Lyrics</h2>
                    {aiDraft && <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400/80">AI draft loaded</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleWriteLyrics()}
                      disabled={isWritingLyrics || styleRaw.trim().length < 5}
                      className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-xs"
                      data-testid="button-write-lyrics"
                    >
                      {isWritingLyrics
                        ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Writing…</>
                        : <><Wand2 className="w-3.5 h-3.5 mr-1.5" />Auto-write lyrics</>}
                    </Button>
                    {(lyricsText || aiDraft) && (
                      <Button size="sm" variant="ghost" onClick={resetAll} className="text-xs text-muted-foreground">
                        <RotateCcw className="w-3 h-3 mr-1" />Clear
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  Type your own lyrics, or auto-write a draft and rewrite it in your own words.
                  Leave empty and the AI sings its own lyrics.
                </p>

                {/* Rewrite / IP split view: AI draft (read-only) beside your editable text */}
                {aiDraft ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">AI draft (reference)</label>
                      <pre className="min-h-[260px] max-h-[420px] overflow-y-auto rounded-lg border border-border/40 bg-background/40 p-3 text-xs font-mono text-muted-foreground/80 whitespace-pre-wrap">{aiDraft}</pre>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-amber-400 uppercase tracking-wide">Your version (editable)</label>
                      <Textarea
                        value={lyricsText}
                        onChange={(e) => setLyricsText(e.target.value)}
                        className="min-h-[260px] max-h-[420px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50 font-mono text-xs"
                        maxLength={20000}
                        data-testid="input-lyrics-editable"
                      />
                    </div>
                  </div>
                ) : (
                  <Textarea
                    placeholder={"Type or paste your lyrics here…\n\n[Verse 1]\n…\n\n[Chorus]\n…"}
                    value={lyricsText}
                    onChange={(e) => setLyricsText(e.target.value)}
                    className="min-h-[200px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50 font-mono text-sm"
                    maxLength={20000}
                    data-testid="input-lyrics-manual"
                  />
                )}

                {/* Authorship meter (only meaningful against an AI draft) */}
                {aiDraft && lyricsText && <AuthorshipMeter score={authorship} />}

                {/* Verification row */}
                {lyricsText.trim().length >= 5 && (
                  <div className="rounded-xl border border-border/40 bg-background/40 px-4 py-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <VerifyBadge state={verifyState} matchedWork={matchedWork} />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void runVerify()}
                          disabled={verifyState === "checking"}
                          className="text-xs border-sky-500/40 text-sky-300 hover:bg-sky-500/10"
                          data-testid="button-verify-lyrics"
                        >
                          {verifyState === "checking"
                            ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Checking…</>
                            : <><Shield className="w-3.5 h-3.5 mr-1.5" />Verify lyrics</>}
                        </Button>
                        {hasAccess ? (
                          <Button
                            size="sm"
                            onClick={() => void handleSaveProject()}
                            disabled={isSaving || verifyState === "flagged"}
                            className="text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                            data-testid="button-save-lyrics"
                          >
                            {isSaving
                              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
                              : projectId ? <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Saved — log revision</> : "Save to library"}
                          </Button>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Pro saves lyrics + forensic ledger</span>
                        )}
                        {projectId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleDeleteProject()}
                            disabled={isDeleting}
                            className="text-xs text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10"
                            data-testid="button-delete-project"
                          >
                            {isDeleting
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <><Trash2 className="w-3.5 h-3.5 mr-1" />Delete</>}
                          </Button>
                        )}
                      </div>
                    </div>
                    {verifyState === "flagged" && (
                      <div className="space-y-3 pt-1">
                        {/* Explanation text */}
                        {verifyMsg && (
                          <p className="text-xs text-rose-400 leading-relaxed">{verifyMsg}</p>
                        )}

                        {/* Highlighted matching passage */}
                        {flaggedEvidence && (
                          <div className="rounded-lg border border-rose-500/40 bg-rose-500/[0.06] px-3 py-2.5 space-y-1.5">
                            <p className="text-[10px] font-semibold text-rose-400 uppercase tracking-wide">
                              Matching passage identified by the screen
                            </p>
                            <blockquote className="text-xs font-mono text-rose-300 leading-relaxed border-l-2 border-rose-500/50 pl-2 italic whitespace-pre-wrap">
                              {flaggedEvidence}
                            </blockquote>
                            <p className="text-[10px] text-rose-400/70">
                              Replace this passage with your own original words to clear the flag.
                            </p>
                          </div>
                        )}

                        {/* AI rewrite assist */}
                        {flaggedEvidence && !showRewriteBox && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleRewritePassage()}
                            disabled={isRewriting}
                            className="text-xs border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                            data-testid="button-rewrite-passage"
                          >
                            {isRewriting
                              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Getting AI suggestion…</>
                              : <><Wand2 className="w-3.5 h-3.5 mr-1.5" />Suggest an original rewrite</>}
                          </Button>
                        )}

                        {/* Rewrite suggestion box */}
                        {showRewriteBox && (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3 space-y-2.5">
                            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">
                              AI suggested rewrite — edit freely, then accept
                            </p>
                            <Textarea
                              value={rewriteSuggestion}
                              onChange={(e) => setRewriteSuggestion(e.target.value)}
                              className="min-h-[80px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50 font-mono text-xs"
                              placeholder="AI rewrite will appear here…"
                              maxLength={2000}
                              data-testid="textarea-rewrite-suggestion"
                            />
                            <p className="text-[10px] text-muted-foreground/70">
                              This replaces the flagged passage in your lyrics and re-runs verification automatically.
                              You remain the author — this is a starting point, not a finished line.
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => void handleAcceptRewrite()}
                                disabled={!rewriteSuggestion.trim()}
                                className="text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                                data-testid="button-accept-rewrite"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Use this rewrite
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setShowRewriteBox(false); setRewriteSuggestion(""); }}
                                className="text-xs text-muted-foreground"
                                data-testid="button-dismiss-rewrite"
                              >
                                Dismiss
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {verifyMsg && verifyState === "unavailable" && (
                      <p className="text-xs text-amber-400 leading-relaxed">{verifyMsg}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                      Verification is an AI screening for recognizable commercial lyrics — including phonetically
                      disguised ones — plus your author assertion. It is not a legal clearance service.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Song generation — always below the lyrics module */}
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold">Generate the Song</h2>
              </div>
              {generateButton}
            </div>

            {/* Import / possession stamp (collapsible, unchanged flow) */}
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.03] p-6 space-y-4">
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => setShowImport((s) => !s)}
                data-testid="button-toggle-import"
              >
                <ShieldCheck className="w-5 h-5 text-amber-500" />
                <h2 className="text-sm font-bold tracking-wide uppercase text-amber-500">Stamp Self-Written Lyrics</h2>
                <span className="ml-auto text-xs text-muted-foreground">{showImport ? "Hide" : "Show"}</span>
              </button>
              {showImport && (
                <>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Wrote lyrics 100% yourself? Stamp them for a cryptographic, timestamped possession
                    record — kept separate from AI drafts. Stamps also pass the copyright screen.
                  </p>
                  <Textarea
                    placeholder="Paste the lyrics you wrote yourself…"
                    className="min-h-[140px] resize-none bg-background/60 border-border/50 focus:border-amber-500/50 font-mono text-sm"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    maxLength={20000}
                    data-testid="input-import-lyrics"
                  />
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <Checkbox
                      checked={importCertified}
                      onCheckedChange={(v) => setImportCertified(v === true)}
                      className="mt-0.5 border-amber-500/50 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                      data-testid="checkbox-certify-author"
                    />
                    <span className="text-xs text-muted-foreground leading-relaxed">
                      I certify these lyrics are my original human work and were <span className="font-bold text-amber-400">NOT produced by an AI</span>.
                    </span>
                  </label>
                  <Button
                    onClick={() => void handleStampImport()}
                    disabled={isStamping || importText.trim().length < 5 || !importCertified}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-3 disabled:opacity-50"
                    data-testid="button-stamp-import"
                  >
                    {isStamping
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Stamping…</>
                      : <><Fingerprint className="w-4 h-4 mr-2" />Stamp My Lyrics</>}
                  </Button>
                  {lastStampAt && (
                    lastStampUnscreened ? (
                      <div className="flex items-start gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25" data-testid="banner-stamp-unscreened">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span className="text-xs text-amber-400 font-medium leading-relaxed">
                          Stamped {new Date(lastStampAt).toLocaleString()} — copyright screen unavailable.
                          These lyrics were NOT screened.
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-xs text-emerald-400 font-medium">
                          Stamped {new Date(lastStampAt).toLocaleString()}
                        </span>
                      </div>
                    )
                  )}
                  <Link
                    href="/protected-lyrics"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    View My Protected Lyrics <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </>
              )}
            </div>

            {!isPro && (
              <div className="space-y-2 max-w-2xl mx-auto">
                <ProGate feature="Song generation + IP certification with MLK v3.5" />
                <ProGate feature="Save lyrics + forensic authorship ledger" />
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
