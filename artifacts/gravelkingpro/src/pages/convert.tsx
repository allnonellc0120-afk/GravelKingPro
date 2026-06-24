import { useState, useRef, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

type State = "idle" | "uploading" | "converting" | "done" | "error";
type Format = "mp3" | "wav" | "flac" | "m4a" | "ogg";

const FORMATS: { value: Format; label: string; desc: string }[] = [
  { value: "mp3",  label: "MP3",  desc: "Universal · 320k" },
  { value: "wav",  label: "WAV",  desc: "Lossless · studio" },
  { value: "flac", label: "FLAC", desc: "Lossless · compressed" },
  { value: "m4a",  label: "M4A",  desc: "AAC · Apple/mobile" },
  { value: "ogg",  label: "OGG",  desc: "Open · web-friendly" },
];

const ACCEPTS = ".mp3,.wav,.flac,.m4a,.mp4,.mov,.m4v,.avi,.mkv,.webm,.wmv,.flv,.ogg,.aiff,.aac";

export default function ConvertPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<State>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState<Format>("mp3");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const convert = useCallback(async (file: File) => {
    setFileName(file.name);
    setState("uploading");
    setProgress(15);
    setResultUrl(null);
    setErrorMsg("");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("format", format);

    try {
      setState("converting");
      setProgress(40);

      const resp = await fetch("/api/convert", {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      setProgress(85);

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Conversion failed");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const base = file.name.replace(/\.[^.]+$/, "");
      setResultUrl(url);
      setResultName(`${base}.${format}`);
      setState("done");
      setProgress(100);
    } catch (err: any) {
      setState("error");
      setErrorMsg(err.message ?? "Something went wrong.");
      toast({ title: "Conversion failed", description: err.message, variant: "destructive" });
    }
  }, [format, toast]);

  const handleFile = (files: FileList | null) => {
    if (!files?.length) return;
    convert(files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files);
  };

  const download = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = resultName;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
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
  };

  const busy = state === "uploading" || state === "converting";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-amber-400" />
            <h1 className="text-2xl font-bold tracking-tight">File Converter</h1>
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">Free</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Convert any audio or video file to MP3, WAV, FLAC, M4A, or OGG.
            Video files (MP4, MOV, screen recordings) are supported — audio is extracted automatically.
          </p>
        </div>

        {/* Format selector */}
        <div className="grid grid-cols-5 gap-2">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              onClick={() => !busy && setFormat(f.value)}
              disabled={busy}
              className={`p-2.5 rounded-lg border text-center transition-all ${
                format === f.value
                  ? "border-amber-500 bg-amber-500/10 text-amber-400"
                  : "border-border/30 bg-card/30 text-muted-foreground hover:border-border/60"
              }`}
            >
              <p className="font-bold text-sm">{f.label}</p>
              <p className="text-[10px] mt-0.5 leading-tight">{f.desc}</p>
            </button>
          ))}
        </div>

        {/* Upload zone */}
        {state === "idle" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              className="border-2 border-dashed border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10 transition-all cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <CardContent className="py-16 flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-amber-400" />
                </div>
                <div className="text-center">
                  <p className="font-medium">Drop any audio or video file here</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    MP3, WAV, FLAC, M4A, MP4, MOV, AVI, MKV, WebM · up to 200 MB
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  Choose File → Convert to {format.toUpperCase()}
                </Button>
              </CardContent>
            </Card>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTS}
              className="hidden"
              onChange={(e) => handleFile(e.target.files)}
            />
          </motion.div>
        )}

        {/* Converting */}
        <AnimatePresence>
          {busy && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="py-10 space-y-4 text-center">
                  <div className="text-sm text-muted-foreground">
                    {state === "uploading" ? "Uploading…" : `Converting to ${format.toUpperCase()}…`}
                  </div>
                  <div className="text-xs font-medium text-amber-400">{fileName}</div>
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">Processed on server — file stays private.</p>
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
                    <p className="font-semibold text-sm">Conversion complete</p>
                    <p className="text-xs text-muted-foreground">{resultName}</p>
                  </div>
                </div>

                {(format === "mp3" || format === "ogg" || format === "m4a") && (
                  <audio src={resultUrl} controls className="w-full h-10" />
                )}

                <div className="flex gap-3">
                  <Button onClick={download} className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                    <Download className="w-4 h-4 mr-2" /> Download {format.toUpperCase()}
                  </Button>
                  <Button variant="outline" onClick={reset} className="border-border/40">
                    Convert Another
                  </Button>
                </div>
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
                <Button variant="outline" onClick={reset} className="border-border/40">Try Again</Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Info */}
        <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
          {[
            { label: "Any source", desc: "Audio & video files" },
            { label: "5 formats", desc: "MP3 WAV FLAC M4A OGG" },
            { label: "Free tool", desc: "No account needed" },
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
