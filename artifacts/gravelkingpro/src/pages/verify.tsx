import { useState, useRef, useCallback, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LeadCaptureModal } from "@/components/lead-capture-modal";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Upload, CheckCircle2, XCircle, AlertCircle,
  FileAudio, Loader2, Lock, Fingerprint, Key, FileText,
  Zap, Building2, RefreshCw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AnchorStatus = "VALID" | "INVALID" | "ABSENT";
type WarrantStatus = "INTACT" | "TAMPERED" | "NO_WATERMARK";

interface AnchorResult {
  status: AnchorStatus;
  detail: string;
}

interface VerifyResult {
  warrant: WarrantStatus;
  anchorA: AnchorResult;
  anchorB: AnchorResult;
  hmac: AnchorResult;
  certId: string | null;
  artist: string | null;
  certifiedAt: string | null;
  kernel: string;
  note: string;
}

type PageState = "idle" | "uploading" | "verifying" | "done" | "error";

function StatusIcon({ status }: { status: AnchorStatus }) {
  if (status === "VALID") return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
  if (status === "INVALID") return <XCircle className="w-5 h-5 text-red-400" />;
  return <AlertCircle className="w-5 h-5 text-zinc-500" />;
}

function statusColor(status: AnchorStatus) {
  if (status === "VALID") return "border-emerald-500/30 bg-emerald-500/5";
  if (status === "INVALID") return "border-red-500/30 bg-red-500/5";
  return "border-border/30 bg-muted/10";
}

function statusLabel(status: AnchorStatus) {
  if (status === "VALID") return <span className="text-emerald-400 font-bold text-xs tracking-widest">VALID</span>;
  if (status === "INVALID") return <span className="text-red-400 font-bold text-xs tracking-widest">INVALID</span>;
  return <span className="text-zinc-500 font-bold text-xs tracking-widest">N/A</span>;
}

function WarrantBadge({ warrant }: { warrant: WarrantStatus }) {
  if (warrant === "INTACT") {
    return (
      <div className="flex items-center gap-2 border-2 border-emerald-500 text-emerald-400 rounded-full px-6 py-2 font-bold text-sm tracking-wider uppercase">
        <CheckCircle2 className="w-4 h-4" /> WARRANT INTACT
      </div>
    );
  }
  if (warrant === "TAMPERED") {
    return (
      <div className="flex items-center gap-2 border-2 border-red-500 text-red-400 rounded-full px-6 py-2 font-bold text-sm tracking-wider uppercase">
        <XCircle className="w-4 h-4" /> DEFAULT OF WARRANT — TAMPERED
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 border-2 border-zinc-600 text-zinc-400 rounded-full px-6 py-2 font-bold text-sm tracking-wider uppercase">
      <AlertCircle className="w-4 h-4" /> NO WATERMARK FOUND
    </div>
  );
}

/** Draws a simple waveform from an audio buffer on a canvas. */
function WaveformCanvas({ audioBuffer }: { audioBuffer: ArrayBuffer | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Read raw bytes as Int16 (PCM approximation for display only)
    const bytes = new Uint8Array(audioBuffer.slice(44, Math.min(44 + W * 200, audioBuffer.byteLength)));
    const samples = bytes.length;
    const midY = H / 2;
    const step = Math.max(1, Math.floor(samples / W));

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#f59e0b40";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(W, midY);
    ctx.stroke();

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < W; x++) {
      const idx = x * step;
      const v = ((bytes[idx] ?? 128) - 128) / 128;
      const y = midY + v * (H * 0.45);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [audioBuffer]);

  if (!audioBuffer) return null;

  return (
    <div className="rounded-lg overflow-hidden border border-amber-500/20 bg-black/40">
      <p className="text-xs text-muted-foreground px-3 pt-2 pb-1">Signal Waveform</p>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "64px", display: "block" }}
      />
    </div>
  );
}

export default function VerifyPage() {
  const [pageState, setPageState] = useState<PageState>("idle");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [audioBuffer, setAudioBuffer] = useState<ArrayBuffer | null>(null);
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".wav")) {
      setErrorMsg("Only .wav files are supported for signal verification. Re-encoding to MP3/AAC destroys the LSB watermark.");
      setPageState("error");
      return;
    }

    setFileName(file.name);
    setResult(null);
    setErrorMsg("");
    setPageState("uploading");

    // Read for waveform display
    const ab = await file.arrayBuffer();
    setAudioBuffer(ab);

    setPageState("verifying");

    const fd = new FormData();
    fd.append("audio", file);

    try {
      const res = await fetch(`${BASE}/api/kernel/verify-signal`, { method: "POST", body: fd });
      const data = await res.json() as VerifyResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      setResult(data);
      setPageState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Verification failed");
      setPageState("error");
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  function reset() {
    setPageState("idle");
    setResult(null);
    setErrorMsg("");
    setFileName("");
    setAudioBuffer(null);
  }

  const verifyActivity = result ? {
    certId: result.certId,
    warrant: result.warrant,
    artist: result.artist,
    certifiedAt: result.certifiedAt,
  } : undefined;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-10 pb-16">

        {/* ── Hero ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4 pt-2">
          <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-xs gap-1.5 px-3 py-1">
            <Shield className="w-3.5 h-3.5" /> Public Signal Verification Lab
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight">
            Clean Room Audio Verification
          </h1>
          <p className="text-muted-foreground text-base max-w-lg mx-auto">
            Upload a <strong>.wav</strong> master to verify its MLK V3.5 dual-anchor cryptographic certificate.
            No account required — this is the public-facing B2B trust surface.
          </p>
        </motion.div>

        {/* ── Dropzone ── */}
        {(pageState === "idle" || pageState === "error") && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div
              ref={dropRef}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all
                ${dragOver
                  ? "border-amber-500 bg-amber-500/5"
                  : "border-border/40 hover:border-amber-500/50 hover:bg-muted/10"
                }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".wav,audio/wav,audio/x-wav"
                onChange={onInputChange}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <FileAudio className="w-8 h-8 text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Drop a .wav master here</p>
                  <p className="text-sm text-muted-foreground mt-1">or click to browse — WAV only, up to 200 MB</p>
                </div>
                {pageState === "error" && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 max-w-sm">
                    {errorMsg}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Verifying ── */}
        <AnimatePresence>
          {(pageState === "uploading" || pageState === "verifying") && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="border-border/40">
                <CardContent className="py-12 flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                  <div className="text-center">
                    <p className="font-semibold">
                      {pageState === "uploading" ? "Uploading…" : "Verifying signal anchors…"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">{fileName}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Results ── */}
        <AnimatePresence>
          {pageState === "done" && result && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

              {/* Waveform */}
              <WaveformCanvas audioBuffer={audioBuffer} />

              {/* Warrant status — headline */}
              <div className="flex flex-col items-center gap-3 py-4">
                <WarrantBadge warrant={result.warrant} />
                {result.certId && (
                  <p className="text-xs text-muted-foreground font-mono">
                    CertID: {result.certId}
                  </p>
                )}
                {result.certifiedAt && (
                  <p className="text-xs text-muted-foreground">
                    Certified {new Date(result.certifiedAt).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Anchor cards */}
              <div className="grid gap-4">
                {[
                  {
                    icon: <Fingerprint className="w-5 h-5 text-amber-400" />,
                    label: "Anchor A — LSB Steganographic Nominator",
                    sublabel: "Embedded in the audio's least-significant bits",
                    data: result.anchorA,
                  },
                  {
                    icon: <Lock className="w-5 h-5 text-amber-400" />,
                    label: "Anchor B — Server-Side Denominator",
                    sublabel: "Held exclusively on GravelKing servers",
                    data: result.anchorB,
                  },
                  {
                    icon: <Key className="w-5 h-5 text-amber-400" />,
                    label: "HMAC-SHA256 Cryptographic Hash",
                    sublabel: "Handshake binding nominator + denominator",
                    data: result.hmac,
                  },
                ].map(({ icon, label, sublabel, data }) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`rounded-xl border p-4 ${statusColor(data.status)}`}
                  >
                    <div className="flex items-start gap-3">
                      <StatusIcon status={data.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            {icon}
                            <span className="font-semibold text-sm">{label}</span>
                          </div>
                          {statusLabel(data.status)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
                        <p className="text-xs text-muted-foreground/70 mt-2 leading-relaxed">{data.detail}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Note */}
              <div className="bg-muted/20 border border-border/30 rounded-lg px-4 py-3 text-sm text-muted-foreground">
                {result.note}
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a
                  href={`${BASE}/api/whitepaper.pdf`}
                  download="GravelKingPro-MLKv35-Technical-Brief.pdf"
                  className="flex-1"
                >
                  <Button variant="outline" className="w-full gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                    <FileText className="w-4 h-4" />
                    Download Technical White Paper (PDF)
                  </Button>
                </a>
                <Button
                  onClick={() => setLeadModalOpen(true)}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2"
                >
                  <Building2 className="w-4 h-4" />
                  Request Enterprise Demo
                </Button>
              </div>

              <Button variant="ghost" size="sm" onClick={reset} className="w-full gap-2 text-muted-foreground">
                <RefreshCw className="w-3.5 h-3.5" /> Verify another file
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Idle CTAs ── */}
        {pageState === "idle" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.2 } }}
            className="flex flex-col sm:flex-row gap-3">
            <a
              href={`${BASE}/api/whitepaper.pdf`}
              download="GravelKingPro-MLKv35-Technical-Brief.pdf"
              className="flex-1"
            >
              <Button variant="outline" className="w-full gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                <FileText className="w-4 h-4" />
                Download Technical White Paper (PDF)
              </Button>
            </a>
            <Button
              onClick={() => setLeadModalOpen(true)}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2"
            >
              <Building2 className="w-4 h-4" />
              Request Enterprise Demo
            </Button>
          </motion.div>
        )}

        {/* ── How it works ── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.3 } }}
          className="border border-border/30 rounded-xl p-6 space-y-4">
          <h2 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wider text-muted-foreground">
            <Zap className="w-4 h-4 text-amber-400" /> How Dual-Anchor Verification Works
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            {[
              {
                icon: <Fingerprint className="w-4 h-4 text-amber-400" />,
                title: "Anchor A rides the track",
                body: "The SHA-256 nominator is embedded into the audio's least-significant bits at export. It travels with the file forever and survives lossless archival.",
              },
              {
                icon: <Lock className="w-4 h-4 text-amber-400" />,
                title: "Anchor B stays on our servers",
                body: "The denominator never leaves GravelKing servers. Verification requires both halves — a discovered nominator proves nothing without the server record.",
              },
              {
                icon: <Key className="w-4 h-4 text-amber-400" />,
                title: "HMAC-SHA256 binds both",
                body: "An HMAC signed with SESSION_SECRET links nominator + denominator. The handshake can only be regenerated by this server — making forgery computationally infeasible.",
              },
              {
                icon: <Shield className="w-4 h-4 text-amber-400" />,
                title: "Legally admissible evidence",
                body: "Dual-stored in Postgres + Firestore. The timestamped, server-authoritative record satisfies FRE Rule 901(b)(9) digital evidence authentication.",
              },
            ].map(({ icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <div className="mt-0.5 shrink-0">{icon}</div>
                <div>
                  <p className="font-medium text-foreground/90">{title}</p>
                  <p className="text-muted-foreground text-xs mt-1 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

      </div>

      <LeadCaptureModal
        open={leadModalOpen}
        onClose={() => setLeadModalOpen(false)}
        verificationActivity={verifyActivity}
      />
    </Layout>
  );
}
