import { useState, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, Mic2, CheckCircle2, AlertCircle, FileVideo } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import { Link } from "wouter";
import { EmailCapture } from "@/components/email-capture";

type State = "idle" | "uploading" | "processing" | "done" | "error";

const VIDEO_EXTS = ["mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv", "flv"];
function isVideoFile(name: string) {
  return VIDEO_EXTS.some((e) => name.toLowerCase().endsWith(`.${e}`));
}

export default function VoiceRemoval() {
  const { hasSplits } = useAppState();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultFormat, setResultFormat] = useState<"wav" | "mp3">("wav");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isVideo, setIsVideo] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setIsVideo(isVideoFile(file.name));
    setState("uploading");
    setProgress(10);
    setResultUrl(null);
    setErrorMsg("");

    const fd = new FormData();
    fd.append("audio", file);
    fd.append("mode", "voice_remove");
    fd.append("multiplier", "0.75");

    try {
      setProgress(30);
      setState("processing");

      const resp = await fetch("/api/kernel/process-audio", {
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

      const ct = resp.headers.get("Content-Type") ?? "";
      const fmt: "wav" | "mp3" = ct.includes("mpeg") ? "mp3" : "wav";
      setResultFormat(fmt);

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
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
    processFile(files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files);
  };

  const download = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `gravelking_instrumental.${resultFormat}`;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      // iOS Safari can't save blob URLs via download attr; open in new tab so user can Share → Save
      window.open(resultUrl, "_blank");
      return;
    }
    a.click();
  };

  const reset = () => {
    setState("idle");
    setProgress(0);
    setFileName("");
    setResultUrl(null);
    setErrorMsg("");
    setIsVideo(false);
  };

  const busy = state === "uploading" || state === "processing";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Mic2 className="w-5 h-5 text-purple-400" />
            <h1 className="text-2xl font-bold tracking-tight">Voice Removal</h1>
            {!hasSplits && (
              <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">
                3 free
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Instant vocal removal — extracts the instrumental by cancelling center-panned vocals.
            Works best on stereo tracks. Audio and video files supported.
          </p>
        </div>

        {/* Upload zone */}
        {state === "idle" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              className="border-2 border-dashed border-purple-500/30 bg-purple-500/5 hover:border-purple-500/60 hover:bg-purple-500/10 transition-all cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <CardContent className="py-16 flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-purple-400" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Drop your track here</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    MP3, WAV, FLAC, M4A, MP4, MOV · up to 100 MB
                  </p>
                </div>
                <Button variant="outline" className="border-purple-500/40 text-purple-400 hover:bg-purple-500/10" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
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

        {/* Processing */}
        <AnimatePresence>
          {busy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="border-purple-500/20 bg-purple-500/5">
                <CardContent className="py-10 space-y-4 text-center">
                  <div className="text-sm text-muted-foreground flex items-center justify-center gap-2">
                    {isVideo && <FileVideo className="w-4 h-4 text-purple-400" />}
                    {state === "uploading"
                      ? "Uploading…"
                      : isVideo
                        ? "Extracting audio from video, then removing vocals…"
                        : "Removing vocals…"}
                  </div>
                  <div className="text-xs font-medium text-purple-400">{fileName}</div>
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">Processing on server — your file never leaves.</p>
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
                    <p className="font-semibold text-sm">Instrumental ready</p>
                    <p className="text-xs text-muted-foreground">{fileName} · {resultFormat.toUpperCase()}</p>
                  </div>
                  {!hasSplits && remaining !== null && (
                    <Badge variant="outline" className="ml-auto text-[10px] border-purple-500/30 text-purple-400">
                      {remaining} free left
                    </Badge>
                  )}
                </div>

                <audio src={resultUrl} controls className="w-full h-10" />

                <div className="flex gap-3">
                  <Button onClick={download} className="flex-1 bg-purple-600 hover:bg-purple-700">
                    <Download className="w-4 h-4 mr-2" /> Download {resultFormat.toUpperCase()}
                  </Button>
                  <Button variant="outline" onClick={reset} className="border-border/40">
                    New File
                  </Button>
                </div>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("Just removed the vocals from my track in seconds using GravelKing Pro 🔥 No plugins, no installs — free to try → gravelkingpro.it.com #MusicProduction #VocalRemoval #BeatMaker")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-md border border-border/40 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  Post your result to X
                </a>

                {!hasSplits && (
                  <>
                    <p className="text-xs text-muted-foreground text-center">
                      Free tier outputs MP3. <Link href="/pricing" className="text-purple-400 hover:underline">Upgrade</Link> for WAV + unlimited runs.
                    </p>
                    <EmailCapture source="voice_removal_result" />
                  </>
                )}
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
                    <>
                      <Link href="/pricing">
                        <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">Upgrade</Button>
                      </Link>
                      <EmailCapture source="voice_removal_limit_hit" />
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Info */}
        <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
          {[
            { label: "Instant", desc: "Results in seconds" },
            { label: "100% on-server", desc: "File stays private" },
            { label: "Any format", desc: "Audio & video" },
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
