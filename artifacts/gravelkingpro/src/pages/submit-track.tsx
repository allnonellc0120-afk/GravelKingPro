import { useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Music, Upload, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

export default function SubmitTrackPage() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [audioFullFile, setAudioFullFile] = useState<File | null>(null);
  const [audioPreviewFile, setAudioPreviewFile] = useState<File | null>(null);
  const [coverArtFile, setCoverArtFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const audioFullRef = useRef<HTMLInputElement>(null);
  const audioPreviewRef = useRef<HTMLInputElement>(null);
  const coverArtRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!title.trim() || !artistName.trim() || !audioFullFile || !audioPreviewFile || !coverArtFile) {
      toast({ title: "Missing fields", description: "Please fill all fields and attach all files.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("artistName", artistName.trim());
      fd.append("audio_full", audioFullFile);
      fd.append("audio_preview", audioPreviewFile);
      fd.append("cover_art", coverArtFile);

      const r = await fetch("/api/tracks/submit", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await r.json();
      if (r.ok) {
        toast({ title: "Track submitted!", description: "Your track is pending admin approval." });
        setTitle(""); setArtistName(""); setAudioFullFile(null); setAudioPreviewFile(null); setCoverArtFile(null);
        if (audioFullRef.current) audioFullRef.current.value = "";
        if (audioPreviewRef.current) audioPreviewRef.current.value = "";
        if (coverArtRef.current) coverArtRef.current.value = "";
      } else if (r.status === 429) {
        toast({ title: "Cooldown active", description: data.error, variant: "destructive" });
      } else if (r.status === 403) {
        toast({ title: "Subscription required", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Submission failed", description: data.error || "Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not submit track.", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-8 space-y-6">
        <Link href="/label">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to Label
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Upload className="w-6 h-6 text-amber-500" />
          <h1 className="text-2xl font-bold">Submit a Track</h1>
        </div>
        <p className="text-sm text-muted-foreground">Submit your track for the Gravel King Productions label. Requires a Pro subscription. Admins will review and approve before it goes live.</p>

        <Card className="border-border/40 bg-card/40">
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Track Title</label>
              <Input placeholder="Enter track title" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Artist Name</label>
              <Input placeholder="Enter artist name" value={artistName} onChange={e => setArtistName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Audio File</label>
              <input
                ref={audioFullRef}
                type="file"
                accept="audio/*"
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer"
                onChange={e => setAudioFullFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">Full-length track (WAV, MP3, FLAC — up to 150 MB)</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Preview Clip</label>
              <input
                ref={audioPreviewRef}
                type="file"
                accept="audio/*"
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer"
                onChange={e => setAudioPreviewFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">Short preview clip (30–60 seconds)</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cover Art</label>
              <input
                ref={coverArtRef}
                type="file"
                accept="image/*"
                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer"
                onChange={e => setCoverArtFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">Square image (JPEG or PNG)</p>
            </div>

            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
              <span>Pro subscribers may submit once per 7 days. Node Auditor subscribers have unlimited submissions. All tracks require admin approval before appearing in the store.</span>
            </div>

            <Button className="w-full gap-1" disabled={submitting} onClick={submit}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Music className="w-4 h-4" />}
              Submit Track
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
