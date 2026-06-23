import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AdminGate, useAdminAuth } from "@/components/admin-gate";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { Music, CheckCircle, XCircle, Loader2, RefreshCw, User, Clock, Disc3, Upload } from "lucide-react";

interface Track {
  id: string;
  title: string;
  artistName: string;
  status: "pending" | "accepted" | "rejected";
  price: number;
  createdAt: string;
  submittedByUserId: string | null;
}

function TrackStatus({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: ReactNode }> = {
    pending: { color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: <Clock className="w-3 h-3" /> },
    accepted: { color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20", icon: <CheckCircle className="w-3 h-3" /> },
    rejected: { color: "bg-red-500/10 text-red-500 border-red-500/20", icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] || map.pending;
  return (
    <Badge variant="outline" className={`gap-1 ${s.color}`}>
      {s.icon} {status}
    </Badge>
  );
}

const FILE_INPUT_CLASS =
  "block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer";

/** Admin-only direct upload — publishes a track straight to the label store, no moderation. */
function DirectUpload({ onUploaded }: { onUploaded: () => void }) {
  const { logout } = useAdminAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const [audioFull, setAudioFull] = useState<File | null>(null);
  const [audioPreview, setAudioPreview] = useState<File | null>(null);
  const [coverArt, setCoverArt] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fullRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const upload = async () => {
    if (!title.trim() || !artistName.trim() || !audioFull || !audioPreview || !coverArt) {
      toast({ title: "Missing fields", description: "Fill all fields and attach all three files.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("artistName", artistName.trim());
      fd.append("audio_full", audioFull);
      fd.append("audio_preview", audioPreview);
      fd.append("cover_art", coverArt);
      const r = await fetch("/api/tracks/submit", { method: "POST", credentials: "include", body: fd });
      if (r.status === 401 || r.status === 403) {
        toast({ title: "Admin session expired", description: "Unlock the dashboard again to upload.", variant: "destructive" });
        logout();
        return;
      }
      const data = (await r.json()) as { error?: string; track?: { status?: string } };
      if (!r.ok) throw new Error(data.error || `Failed (${r.status})`);
      const live = data.track?.status === "accepted";
      toast({
        title: live ? "Published live" : "Saved as pending",
        description: live
          ? `"${title.trim()}" is now in the label store.`
          : "Track saved but not auto-published — your admin session may have lapsed.",
      });
      setTitle(""); setArtistName(""); setAudioFull(null); setAudioPreview(null); setCoverArt(null);
      if (fullRef.current) fullRef.current.value = "";
      if (previewRef.current) previewRef.current.value = "";
      if (coverRef.current) coverRef.current.value = "";
      onUploaded();
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-emerald-500" />
          <div>
            <h2 className="text-base font-semibold">Direct Upload — Publishes Live Instantly</h2>
            <p className="text-xs text-muted-foreground">Dev privilege: your uploads skip moderation and appear in the store immediately.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Input placeholder="Track title" value={title} onChange={e => setTitle(e.target.value)} />
          <Input placeholder="Artist name" value={artistName} onChange={e => setArtistName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Full audio (private — sold to buyers)</label>
          <input ref={fullRef} type="file" accept="audio/*" className={FILE_INPUT_CLASS} onChange={e => setAudioFull(e.target.files?.[0] ?? null)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Preview clip (public — 30s max)</label>
          <input ref={previewRef} type="file" accept="audio/*" className={FILE_INPUT_CLASS} onChange={e => setAudioPreview(e.target.files?.[0] ?? null)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Cover art</label>
          <input ref={coverRef} type="file" accept="image/*" className={FILE_INPUT_CLASS} onChange={e => setCoverArt(e.target.files?.[0] ?? null)} />
        </div>
        <Button className="w-full gap-1 bg-emerald-500 hover:bg-emerald-600 text-black" disabled={uploading} onClick={() => void upload()}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Publish to Label
        </Button>
      </CardContent>
    </Card>
  );
}

function TracksDashboard() {
  const { logout } = useAdminAuth();
  const { toast } = useToast();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/tracks", { credentials: "include" });
      if (r.status === 401 || r.status === 403) { logout(); return; }
      if (!r.ok) throw new Error(`Failed (${r.status})`);
      const data = await r.json();
      setTracks(data.tracks || []);
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to load tracks", variant: "destructive" });
    } finally { setLoading(false); }
  }, [logout, toast]);

  useEffect(() => { void load(); }, [load]);

  const moderate = async (id: string, action: "approve" | "reject") => {
    setActionId(id);
    try {
      const r = await fetch(`/api/admin/tracks/${id}/${action}`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      toast({ title: `Track ${action}d`, description: "Status updated." });
      void load();
    } catch {
      toast({ title: "Error", description: "Could not update track.", variant: "destructive" });
    } finally { setActionId(null); }
  };

  const pending = tracks.filter(t => t.status === "pending");
  const accepted = tracks.filter(t => t.status === "accepted");
  const rejected = tracks.filter(t => t.status === "rejected");

  const [location] = useLocation();
  const tabs = [
    { href: "/admin", label: "Analytics" },
    { href: "/admin/tracks", label: "Tracks" },
    { href: "/admin/waitlist", label: "Waitlist" },
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8 space-y-6">
        {/* Admin tab navigation */}
        <div className="flex gap-0 border-b border-border/40">
          {tabs.map(t => (
            <Link key={t.href} href={t.href}>
              <button className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${location === t.href ? "border-amber-500 text-amber-500" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Disc3 className="w-6 h-6 text-amber-500" />
              Track Moderation
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Approve or reject artist submissions</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Refresh
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void logout()}>
              Lock
            </Button>
          </div>
        </div>

        <DirectUpload onUploaded={() => void load()} />

        <div className="grid grid-cols-3 gap-3">
          <Card className="border-border/40 bg-card/40">
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-yellow-500">{pending.length}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/40">
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-emerald-500">{accepted.length}</div>
              <div className="text-xs text-muted-foreground">Accepted</div>
            </CardContent>
          </Card>
          <Card className="border-border/40 bg-card/40">
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-red-500">{rejected.length}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </CardContent>
          </Card>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Pending Section */}
        {pending.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-500" /> Pending Review
            </h2>
            <div className="space-y-2">
              {pending.map(t => (
                <Card key={t.id} className="border-border/40 bg-card/40">
                  <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm">{t.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <User className="w-3 h-3" /> {t.artistName}
                        <span>·</span>
                        <TrackStatus status={t.status} />
                        <span>·</span>
                        <span>${t.price.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-1 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10" disabled={actionId === t.id} onClick={() => moderate(t.id, "approve")}>
                        {actionId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10" disabled={actionId === t.id} onClick={() => moderate(t.id, "reject")}>
                        {actionId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                        Reject
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* All Tracks */}
        {tracks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Music className="w-4 h-4 text-amber-500" /> All Tracks
            </h2>
            <div className="space-y-2">
              {tracks.map(t => (
                <Card key={t.id} className="border-border/40 bg-card/40">
                  <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-sm">{t.title}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <User className="w-3 h-3" /> {t.artistName}
                        <span>·</span>
                        <TrackStatus status={t.status} />
                        <span>·</span>
                        <span>${t.price.toFixed(2)}</span>
                        <span>·</span>
                        <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    {t.status === "pending" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="gap-1 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10" disabled={actionId === t.id} onClick={() => moderate(t.id, "approve")}>
                          {actionId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-red-500 border-red-500/30 hover:bg-red-500/10" disabled={actionId === t.id} onClick={() => moderate(t.id, "reject")}>
                          {actionId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                          Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {!loading && tracks.length === 0 && (
          <div className="text-center py-16">
            <Music className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tracks submitted yet.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default function AdminTracks() {
  return (
    <AdminGate title="Track Moderation" description="Enter your admin key to review and approve tracks.">
      <TracksDashboard />
    </AdminGate>
  );
}
