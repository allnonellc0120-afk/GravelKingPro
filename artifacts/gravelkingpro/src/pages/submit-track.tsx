import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAppState } from "@/lib/context";
import { Music, Upload, ArrowLeft, Loader2, Crown, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

export default function SubmitTrackPage() {
  const { isPro } = useAppState();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [audioFullKey, setAudioFullKey] = useState("");
  const [audioPreviewKey, setAudioPreviewKey] = useState("");
  const [coverArtKey, setCoverArtKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || !artistName.trim() || !audioFullKey.trim() || !audioPreviewKey.trim() || !coverArtKey.trim()) {
      toast({ title: "Missing fields", description: "Please fill all fields.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/tracks/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          artistName: artistName.trim(),
          audioFullKey,
          audioPreviewKey,
          coverArtKey,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        toast({ title: "Track submitted!", description: "Your track is pending admin approval." });
        setTitle(""); setArtistName(""); setAudioFullKey(""); setAudioPreviewKey(""); setCoverArtKey("");
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

  if (!isPro) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto py-8 text-center">
          <Crown className="w-12 h-12 text-amber-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold">Pro subscription required</h1>
          <p className="text-sm text-muted-foreground mt-1">Track submission is a Pro feature. Upgrade to submit your music.</p>
          <Link href="/pricing">
            <Button className="mt-4">Upgrade to Pro</Button>
          </Link>
        </div>
      </Layout>
    );
  }

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
        <p className="text-sm text-muted-foreground">Submit your track for the Gravel King Productions label. Admins will review and approve before it goes live.</p>

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
              <label className="text-sm font-medium">Full Audio Key</label>
              <Input placeholder="Object storage key for full track" value={audioFullKey} onChange={e => setAudioFullKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Preview Audio Key</label>
              <Input placeholder="Object storage key for 30s preview" value={audioPreviewKey} onChange={e => setAudioPreviewKey(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Cover Art Key</label>
              <Input placeholder="Object storage key for square cover image" value={coverArtKey} onChange={e => setCoverArtKey(e.target.value)} />
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              <span>Submissions are limited to once per 7 days. All tracks require admin approval before appearing in the store.</span>
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
