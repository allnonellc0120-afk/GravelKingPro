import { useState, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, Mic2, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import { Link } from "wouter";

type State = "idle" | "uploading" | "processing" | "done" | "error";

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

  const processFile = useCallback(async (file: File) => {
    setFileName(file.name);
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
    a.click();
  };

  const reset = () => {
    setState("idle");
    setProgress(0);
    setFileName("");
    setResultUrl(null);
    setErrorMsg("");
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
            Removes lead vocals using center-channel cancellation — extracts the full instrumental track.
            Stereo files recommended.
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
                  <p className="text-xs text-muted-foreground mt-1">MP3, WAV, FLAC, M4A · up to 100 MB</p>
                </div>
                <Button variant="outline" className="border-purple-500/40 text-purple-400 hover:bg-purple-500/10" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  Choose File
                </Button>
              </CardContent>
            </Card>
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={(e) => handleFile(e.target.files)} />
          </motion.div>
        )}

        {/* Processing */}
        <AnimatePresence>
          {busy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="border-purple-500/20 bg-purple-500/5">
                <CardContent className="py-10 space-y-4 text-center">
                  <div className="text-sm text-muted-foreground">
                    {state === "uploading" ? "Uploading…" : "Removing vocals with MLK v3…"}
                  </div>
                  <div className="text-xs font-medium text-purple-400">{fileName}</div>
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">Processing locally — your audio never leaves the server.</p>
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

                {!hasSplits && (
                  <p className="text-xs text-muted-foreground text-center">
                    Free tier outputs MP3. <Link href="/pricing" className="text-purple-400 hover:underline">Upgrade</Link> for WAV + unlimited runs.
                  </p>
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
                    <Link href="/pricing">
                      <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">Upgrade</Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Info */}
        <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
          {[
            { label: "Center-channel cancel", desc: "MLK v3 separation" },
            { label: "100% local", desc: "Runs on your server" },
            { label: "Stereo output", desc: "Full instrumental" },
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
