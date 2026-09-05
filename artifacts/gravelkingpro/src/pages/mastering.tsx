import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { styleAuthorshipScore } from "@workspace/authorship";
import { BeforeAfterDemo } from "@/components/before-after-demo";
import { Layout } from "@/components/layout";
import { ToolHelp } from "@/components/tool-help";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Download, Upload, Wand2, CheckCircle2, AlertCircle, FileDown, Shuffle } from "lucide-react";
import { RemixModal } from "@/components/remix-modal";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import { downloadUrl } from "@/lib/download";
import { compressAudioFile, shouldCompress } from "@/lib/audioCompressor";
import { EmailGate, useEmailGate } from "@/components/email-gate";
import { ExportQuotaBadge } from "@/components/export-quota-badge";
import { formatResetDate, useExportQuota } from "@/hooks/use-export-quota";
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

const CERT_CATEGORIES = [
  { id: "full_track",        label: "Full track" },
  { id: "instrumental",      label: "Instrumental" },
  { id: "lyrics",            label: "Lyrics" },
  { id: "vocal_performance", label: "Vocal performance" },
] as const;
type CertCategory = (typeof CERT_CATEGORIES)[number]["id"];

interface CertStatus {
  unlocked: boolean;
  priceCents: number;
  includedUnlocks: { available: boolean; used: number; limit: number; resetsAt: string | null } | null;
}

/**
 * Certificate document access — the stamp is free, but the court document
 * (JSON + PDF) stays private until unlocked: $1.99 one-time, or one of a
 * Studio subscriber's 20 included unlocks per rolling 30 days.
 */
function CertUnlockCard({ certId }: { certId: string }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<CertStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/court-cert/${encodeURIComponent(certId)}/status`, { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 401 ? "Sign in to manage this certificate." : "Could not load certificate status.");
      setStatus(await res.json() as CertStatus);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load certificate status.");
    }
  }, [certId]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const useIncluded = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/court-cert/${encodeURIComponent(certId)}/unlock`, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Unlock failed.");
      toast({ title: "Certificate unlocked", description: "Your court document is ready to download." });
      await loadStatus();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unlock failed.";
      toast({ title: "Unlock failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const buyUnlock = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/court-cert/${encodeURIComponent(certId)}/checkout`, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string; alreadyUnlocked?: boolean };
      if (data.alreadyUnlocked) { await loadStatus(); return; }
      if (!res.ok || !data.url) throw new Error(data.error ?? "Could not start checkout.");
      window.location.href = data.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start checkout.";
      toast({ title: "Checkout failed", description: msg, variant: "destructive" });
      setBusy(false);
    }
  };

  if (error) return <p className="text-xs text-amber-400">{error}</p>;
  if (!status) return <p className="text-xs text-muted-foreground">Checking certificate status…</p>;

  if (status.unlocked) {
    return (
      <div className="space-y-2 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5" data-testid="cert-unlocked">
        <p className="text-sm font-medium text-emerald-300">IP Certificate — unlocked</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 border-emerald-500/30"
            onClick={() => downloadUrl(`/api/court-cert/${encodeURIComponent(certId)}.pdf`, `gravelking-cert-${certId}.pdf`)}
            data-testid="button-cert-pdf">
            <FileDown className="w-3.5 h-3.5 mr-1.5" /> Court PDF
          </Button>
          <Button size="sm" variant="outline" className="flex-1 border-emerald-500/30"
            onClick={() => window.open(`/api/court-cert/${encodeURIComponent(certId)}`, "_blank")}
            data-testid="button-cert-json">
            View JSON
          </Button>
        </div>
      </div>
    );
  }

  const inc = status.includedUnlocks;
  return (
    <div className="space-y-2 p-3 rounded-lg border border-sky-500/20 bg-sky-500/5" data-testid="cert-locked">
      <p className="text-sm font-medium text-sky-300">IP Certificate stamped — document locked</p>
      <p className="text-xs text-muted-foreground">
        Your track is stamped and the server record is sealed. Unlock the court-ready certificate
        document (JSON + PDF) whenever you need it — the unlock is permanent for this certificate.
      </p>
      <div className="flex gap-2">
        {inc && (
          <Button size="sm" disabled={busy || !inc.available} onClick={useIncluded}
            className="flex-1 bg-sky-600 hover:bg-sky-700" data-testid="button-cert-included">
            {inc.available
              ? `Use included unlock (${inc.limit - inc.used} left)`
              : `Included unlocks used${inc.resetsAt ? ` — resets ${formatResetDate(inc.resetsAt)}` : ""}`}
          </Button>
        )}
        <Button size="sm" disabled={busy} onClick={buyUnlock} variant={inc ? "outline" : "default"}
          className={inc ? "flex-1 border-sky-500/30" : "flex-1 bg-sky-600 hover:bg-sky-700"}
          data-testid="button-cert-buy">
          Unlock for ${(status.priceCents / 100).toFixed(2)}
        </Button>
      </div>
    </div>
  );
}

export default function Mastering() {
  const { isPro, isDeveloper } = useAppState();
  const { toast } = useToast();
  const emailGate = useEmailGate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Admin/developer accounts always bypass the Pro paywall (same rule as the
  // Lyric Studio generate card).
  const hasProAccess = isPro || isDeveloper;
  // Set when the loaded input came from the user's vault (?gkTrack=…) — only
  // those tracks can be remixed through the MLK v3.5 Remix Engine.
  const [gkLoaded, setGkLoaded] = useState<{ id: string; title: string } | null>(null);
  const [remixOpen, setRemixOpen] = useState(false);
  // Direct upload is preserved but collapsed — the primary entry is
  // Library → "Master this track".
  const [showUpload, setShowUpload] = useState(false);

  const [state, setState] = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [preset, setPreset] = useState<PresetId>("baseline");
  const [denoiseOn, setDenoiseOn] = useState(false);
  const [certifyOn, setCertifyOn] = useState(false);
  const [certCategory, setCertCategory] = useState<CertCategory>("full_track");
  // certId of the freshly stamped master (from X-GK-Cert-Id) — drives the
  // unlock panel. Also set when returning from a $1.99 unlock checkout.
  const [certId, setCertId] = useState<string | null>(null);
  const [returnedCertId, setReturnedCertId] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [downloadHref, setDownloadHref] = useState<string | null>(null);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [intensity, setIntensity] = useState(75);
  const [sidechainFilter, setSidechainFilter] = useState<"none" | "highpass" | "lowpass">("highpass");
  const [sidechainFreq, setSidechainFreq] = useState(140);
  const [stereoLink, setStereoLink] = useState(true);
  const [adaptiveMode, setAdaptiveMode] = useState<"off" | "bass_aware">("bass_aware");
  const [autoThreshold, setAutoThreshold] = useState(true);
  const [autoThresholdOffset, setAutoThresholdOffset] = useState(-16.0);
  const [stylePrompt, setStylePrompt] = useState("");
  // Global music industry identifiers — optional, only sent when certifying.
  const [ipiNumber, setIpiNumber] = useState("");
  const [iswc, setIswc] = useState("");
  const [isrc, setIsrc] = useState("");

  const styleScore = useMemo(() => styleAuthorshipScore(stylePrompt), [stylePrompt]);
  const { quota, refresh: refreshQuota } = useExportQuota();

  const processFile = useCallback(async (
    file: File, selectedPreset: PresetId, denoise: boolean,
    style: string, certify: boolean, intensityVal: number,
    scFilter: "none" | "highpass" | "lowpass", scFreq: number,
    stereoLinkVal: boolean, adaptiveModeVal: "off" | "bass_aware",
    autoThresholdVal: boolean, autoThresholdOffsetVal: number,
    industryIds?: { ipi: string; iswc: string; isrc: string }
  ) => {
    setFileName(file.name);
    setResultUrl(null);
    setCertId(null);
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
    fd.append("intensity", String(intensityVal));
    fd.append("sidechainFilter", scFilter);
    fd.append("sidechainFreq", String(scFreq));
    fd.append("stereoLink", String(stereoLinkVal));
    fd.append("adaptiveMode", adaptiveModeVal);
    fd.append("autoThreshold", String(autoThresholdVal));
    fd.append("autoThresholdOffset", String(autoThresholdOffsetVal));
    fd.append("stylePrompt", style);
    if (certify) {
      fd.append("certify", "true");
      // Checking the certify box IS the ownership assertion.
      fd.append("author_assertion", "true");
      fd.append("certCategory", certCategory);
      // Global industry identifiers — bound to the cert record server-side.
      if (industryIds?.ipi.trim())  fd.append("ipiNumber", industryIds.ipi.trim());
      if (industryIds?.iswc.trim()) fd.append("iswc", industryIds.iswc.trim());
      if (industryIds?.isrc.trim()) fd.append("isrc", industryIds.isrc.trim());
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
      const certificationStatus = resp.headers.get("X-GK-Certification");
      if (certify && certificationStatus === "sealed-local") {
        toast({
          title: "Master complete — local scan certificate sealed",
          description: "A local audio-signature scan found no project-catalog match. Worldwide commercial catalog clearance was not checked.",
        });
      } else if (certify && certificationStatus === "skipped-acr-unavailable") {
        toast({
          title: "Master complete — stamp skipped",
          description: "The copyright scan is temporarily unavailable. Your master still completed and was not stamped.",
        });
      } else if (certify && certificationStatus === "skipped-acr-match") {
        toast({
          title: "Master complete — stamp skipped",
          description: "A commercial catalog match was detected. Your master still completed and was not stamped.",
        });
      }
      // Real HTTPS download URL — large blob: URLs stall when saving on mobile.
      setDownloadHref(resp.headers.get("X-GK-Download-Url"));
      // Certificate id (only present when this master was certified).
      setCertId(resp.headers.get("X-GK-Cert-Id"));

      // The server always streams the mastered WAV back — it plays and
      // downloads right here in the app, no external link.
      const blob = await resp.blob();
      setResultUrl(URL.createObjectURL(blob));
      setState("done");
      setProgress(100);
      void refreshQuota();
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
  }, [toast, certCategory]);

  // Returning from the $1.99 certificate-unlock checkout — the webhook grants
  // the unlock server-side; here we just surface the (now unlockable/unlocked)
  // certificate panel so the user can download their documents.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("certUnlock");
    const returnedId = params.get("certId");
    if (!result || !returnedId) return;
    setReturnedCertId(returnedId);
    if (result === "success") {
      toast({ title: "Payment received", description: "Your certificate is being unlocked — documents appear below." });
    } else {
      toast({ title: "Checkout cancelled", description: "Your certificate is still locked. You can unlock it any time." });
    }
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = (files: FileList | null) => {
    if (!files?.length) return;
    const f = files[0];
    setPendingFile(f);
    setFileName(f.name);
    // The user's own upload IS the "before" — playable immediately on selection.
    setBeforeUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
    setState("idle");
  };

  // MLK v3.5 generate-master handoff: when the Lyric Studio finishes an
  // in-house generation it redirects here with ?gkTrack=<vault track id>.
  // Pull the generated audio from the user's vault and preload it as the
  // selected input — the existing Mastering Tool UI handles everything else
  // (playback, re-mastering, WAV download).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gkTrack = params.get("gkTrack");
    if (!gkTrack) return;
    const gkTitle = params.get("gkTitle") || "Generated Track";
    let cancelled = false;
    void (async () => {
      try {
        // Stream route: full-quality authenticated audio that does NOT consume
        // the export quota (loading a track into the tool is not an export).
        const res = await fetch(`/api/tracks/${encodeURIComponent(gkTrack)}/stream`, { credentials: "include" });
        if (!res.ok) throw new Error(`Could not load your generated track (HTTP ${res.status}).`);
        const blob = await res.blob();
        if (cancelled) return;
        const safe = gkTitle.replace(/[^\w\s.-]/g, "").trim() || "Generated Track";
        const file = new File([blob], `${safe}.wav`, { type: blob.type || "audio/wav" });
        setPendingFile(file);
        setFileName(file.name);
        setBeforeUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
        setState("idle");
        setGkLoaded({ id: gkTrack, title: safe });
        // Clean the query only after a successful preload so refresh retries.
        window.history.replaceState({}, "", window.location.pathname);
        toast({ title: "Generated track loaded", description: `“${safe}” is ready in the Mastering Tool.` });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Could not load your generated track.";
        setErrorMsg(msg);
        toast({ title: "Track load failed", description: msg, variant: "destructive" });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files);
  };

  const startMastering = () => {
    if (pendingFile) processFile(pendingFile, preset, denoiseOn, stylePrompt, certifyOn, intensity, sidechainFilter, sidechainFreq, stereoLink, adaptiveMode, autoThreshold, autoThresholdOffset, { ipi: ipiNumber, iswc, isrc });
  };

  const download = () => {
    if (!resultUrl) return;
    downloadUrl(downloadHref ?? resultUrl, `gravelking_mastered_${preset}.wav`);
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
            <ExportQuotaBadge quota={quota} />
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

        {/* MLK v3.5 Remix Engine — only for tracks loaded from the user's vault */}
        {gkLoaded && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">“{gkLoaded.title}”</p>
              <p className="text-[11px] text-muted-foreground">
                Generated with MLK v3.5 — spin a new variation that keeps its identity, with a child IP cert linked to the original.
              </p>
            </div>
            <Button
              onClick={() => {
                if (!hasProAccess) {
                  toast({
                    title: "GravelKing Pro required",
                    description: "Upgrade to GravelKing Pro to remix tracks with MLK v3.5.",
                    variant: "destructive",
                  });
                  return;
                }
                setRemixOpen(true);
              }}
              aria-disabled={!hasProAccess}
              className={`shrink-0 font-bold ${hasProAccess
                ? "bg-emerald-500 hover:bg-emerald-600 text-black"
                : "bg-muted text-muted-foreground opacity-60 cursor-not-allowed hover:bg-muted"}`}
            >
              <Shuffle className="w-4 h-4 mr-2" />
              Remix Track with MLK v3.5{!hasProAccess && " — Pro"}
            </Button>
          </div>
        )}
        {gkLoaded && (
          <RemixModal
            open={remixOpen}
            onOpenChange={setRemixOpen}
            parentTrackId={gkLoaded.id}
            parentTitle={gkLoaded.title}
          />
        )}

        {/* Entry state — the primary path is Library → "Master this track".
            Direct upload stays fully available but collapsed behind a toggle. */}
        {!pendingFile && !busy && state !== "done" ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <Card className="border border-border/40 bg-card/40">
              <CardContent className="py-10 flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Wand2 className="w-7 h-7 text-amber-400" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Pick a track from your library to master</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Generated tracks arrive here unmastered — open one in My Library and hit “Master this track”.
                  </p>
                </div>
                <Link href="/library">
                  <Button className="bg-amber-500 hover:bg-amber-600 text-black font-bold" data-testid="button-open-library">
                    Open My Library
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {!showUpload ? (
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className="w-full text-center text-xs text-sky-400 hover:text-sky-300 py-2"
                data-testid="button-show-upload"
              >
                …or upload an audio file directly
              </button>
            ) : (
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
            )}
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

            {/* Intensity slider */}
            <div className="p-3 rounded-lg border border-sky-500/20 bg-sky-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-sky-300">Kernel Intensity</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    How hard the MLK v3 mastering chain pushes the signal. 75 is the tuned default.
                  </p>
                </div>
                <span className="text-2xl font-black text-sky-300 leading-none tabular-nums">{intensity}</span>
              </div>
              <Slider
                value={[intensity]}
                onValueChange={(v) => setIntensity(v[0])}
                min={0}
                max={100}
                step={1}
                data-testid="slider-master-intensity"
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground/50 select-none">
                <span>Subtle</span>
                <span>Balanced (75)</span>
                <span>Maximum</span>
              </div>
            </div>

            {/* Sidechain compressor */}
            <div className="p-3 rounded-lg border border-violet-500/20 bg-violet-500/5 space-y-3">
              <div>
                <p className="text-sm font-medium text-violet-300">Sidechain Compressor</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Filters the detector signal so bass/kick don't pump the compressor. Recommended: Highpass at 160 Hz.
                </p>
              </div>
              {/* Filter type buttons */}
              <div className="flex gap-2">
                {(["none","highpass","lowpass"] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => setSidechainFilter(opt)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      sidechainFilter === opt
                        ? "border-violet-500/60 bg-violet-500/20 text-violet-200"
                        : "border-border/30 bg-card/20 text-muted-foreground hover:border-border/60"
                    }`}
                  >
                    {opt === "none" ? "Off" : opt === "highpass" ? "Highpass" : "Lowpass"}
                  </button>
                ))}
              </div>
              {/* Frequency slider — only when a filter is active */}
              {sidechainFilter !== "none" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Detector cutoff frequency</p>
                    <span className="text-sm font-black text-violet-300 tabular-nums">{sidechainFreq} Hz</span>
                  </div>
                  <Slider
                    value={[sidechainFreq]}
                    onValueChange={(v) => setSidechainFreq(v[0])}
                    min={60}
                    max={400}
                    step={5}
                    data-testid="slider-sidechain-freq"
                    className="w-full"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/50 select-none">
                    <span>60 Hz</span>
                    <span>Typical: 120–250 Hz</span>
                    <span>400 Hz</span>
                  </div>
                </div>
              )}
              {/* Adaptive mode */}
              {sidechainFilter !== "none" && (
                <div className="space-y-1 pt-1">
                  <p className="text-xs font-medium text-violet-300/80">Adaptive Mode</p>
                  <div className="flex gap-2">
                    {(["bass_aware","off"] as const).map(opt => (
                      <button
                        key={opt}
                        onClick={() => setAdaptiveMode(opt)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          adaptiveMode === opt
                            ? "border-violet-500/60 bg-violet-500/20 text-violet-200"
                            : "border-border/30 bg-card/20 text-muted-foreground hover:border-border/60"
                        }`}
                      >
                        {opt === "bass_aware" ? "Bass Aware ✦" : "Fixed"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/50">
                    {adaptiveMode === "bass_aware"
                      ? "Detector bandpasses around your cutoff frequency — tracks bass energy, not broadband level. Prevents pumping on heavy sub content."
                      : "Fixed detector at the cutoff frequency. Predictable, consistent behaviour."}
                  </p>
                </div>
              )}

              {/* Auto threshold */}
              {sidechainFilter !== "none" && (
                <div className="space-y-2 pt-1 border-t border-violet-500/10">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="autothreshold"
                      checked={autoThreshold}
                      onChange={(e) => setAutoThreshold(e.target.checked)}
                      className="w-4 h-4 accent-violet-500"
                    />
                    <label htmlFor="autothreshold" className="text-xs font-medium cursor-pointer text-violet-300">
                      Auto Threshold <span className="text-muted-foreground/60 font-normal">— measured from your track's RMS (set-and-forget)</span>
                    </label>
                  </div>
                  {autoThreshold && (
                    <div className="space-y-2 pl-7">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground/70">Offset below RMS</p>
                        <span className="text-sm font-black text-violet-300 tabular-nums">{autoThresholdOffset.toFixed(1)} dB</span>
                      </div>
                      <Slider
                        value={[autoThresholdOffset]}
                        onValueChange={(v) => setAutoThresholdOffset(v[0])}
                        min={-30}
                        max={-6}
                        step={0.5}
                        data-testid="slider-auto-threshold-offset"
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground/50 select-none">
                        <span>−30 dB (gentle)</span>
                        <span>Typical: −12 to −18</span>
                        <span>−6 dB (aggressive)</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Stereo link */}
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="stereolink"
                  checked={stereoLink}
                  onChange={(e) => setStereoLink(e.target.checked)}
                  className="w-4 h-4 accent-violet-500"
                />
                <label htmlFor="stereolink" className="text-xs cursor-pointer text-muted-foreground">
                  Stereo link <span className="text-muted-foreground/60">— both channels compress together (recommended for mastering)</span>
                </label>
              </div>
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
                Certify this as my original work <span className="text-muted-foreground">(optional) — runs the available local audio-signature scan and embeds an IP ownership certificate in the WAV. The certificate clearly shows that worldwide commercial-catalog clearance was not checked. Leave off for karaoke, covers, or remixes.</span>
              </label>
            </div>

            {/* ── Global Industry Identifiers — only relevant when certifying ── */}
            {certifyOn && (
              <div className="space-y-3 p-3 rounded-lg border border-sky-500/20 bg-sky-500/5">
                <div>
                  <p className="text-sm font-medium text-sky-300">What are you certifying?</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {CERT_CATEGORIES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCertCategory(c.id)}
                        data-testid={`button-cert-category-${c.id}`}
                        className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                          certCategory === c.id
                            ? "border-sky-500/60 bg-sky-500/15 text-sky-300"
                            : "border-border/30 text-muted-foreground hover:border-sky-500/30"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-sky-300">Global Industry Identifiers <span className="text-muted-foreground font-normal">(optional)</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Attach your IPI, ISWC, or ISRC to bind them to the track's cryptographic IP certificate.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={ipiNumber}
                    onChange={(e) => setIpiNumber(e.target.value)}
                    placeholder="IPI Number (Songwriter)"
                    maxLength={64}
                    data-testid="input-ipi-number"
                    className="w-full text-xs bg-background/60 border border-sky-500/20 rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-sky-500/50"
                  />
                  <input
                    type="text"
                    value={iswc}
                    onChange={(e) => setIswc(e.target.value)}
                    placeholder="ISWC (Composition)"
                    maxLength={32}
                    data-testid="input-iswc"
                    className="w-full text-xs bg-background/60 border border-sky-500/20 rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-sky-500/50"
                  />
                  <input
                    type="text"
                    value={isrc}
                    onChange={(e) => setIsrc(e.target.value)}
                    placeholder="ISRC (Recording)"
                    maxLength={32}
                    data-testid="input-isrc"
                    className="w-full text-xs bg-background/60 border border-sky-500/20 rounded-md px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-sky-500/50"
                  />
                </div>
              </div>
            )}

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

            {/* At 0 exports left the server would 429 the mastering run itself, so the
                start action explains the reset date instead of failing on click. */}
            {quota && quota.remaining <= 0 ? (
              <Button disabled variant="outline" className="w-full border-rose-500/30 text-rose-400 font-semibold" data-testid="button-export-limit">
                Export limit reached — resets {formatResetDate(quota.resetsAt)}
              </Button>
            ) : (
              <Button
                onClick={startMastering}
                className="w-full bg-sky-600 hover:bg-sky-700 font-semibold"
              >
                <Wand2 className="w-4 h-4 mr-2" /> Master with {selectedPreset.label}
              </Button>
            )}

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

        {/* Back from a certificate-unlock checkout — show that cert's panel. */}
        {returnedCertId && (
          <Card className="border-sky-500/20 bg-card/40">
            <CardContent className="py-4">
              <CertUnlockCard certId={returnedCertId} />
            </CardContent>
          </Card>
        )}

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

                {certId && <CertUnlockCard certId={certId} />}

                <div className="flex gap-3">
                  {/* This result already consumed its export credit server-side when
                      the master ran — saving it must stay possible even if the quota
                      just hit 0, so the download is never gated here. */}
                  <Button onClick={download} className="flex-1 bg-sky-600 hover:bg-sky-700">
                    <Download className="w-4 h-4 mr-2" /> Download WAV
                  </Button>
                  <Button variant="outline" onClick={reset} className="border-border/40">New File</Button>
                </div>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Just mastered my track with GravelKing Pro 🎚️ Server-side mastering, no plugins needed — free to try → gravelkingpro.com #MusicProduction #Mastering #AudioEngineering #BeatMaker")}`}
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
              any plug-ins or additional production software on your device.
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
              or further editing in your preferred audio software.
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
                source file. If your track needs significant tonal correction, revise the mix in your preferred audio editor
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
                Use the YouTube preset for a –14 LUFS target, or Baseline for a slightly warmer
                low-end. Choose the preset that matches your actual delivery requirement and
                review the returned loudness before release.
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground/90">Related tools</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Vocal Booth", href: "/vocal-booth" },
                { label: "JAX", href: "/songwriting" },
                { label: "Converter", href: "/convert" },
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
