import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AdminGate, useAdminAuth } from "@/components/admin-gate";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  CheckCircle, XCircle, Clock, Loader2, RefreshCw, ShieldAlert,
  Music, Upload, Trash2, RotateCcw, Star, AlertTriangle, Crown,
} from "lucide-react";

interface LabelTrack {
  id: string;
  title: string;
  artistName: string;
  status: "pending" | "accepted" | "rejected" | "private";
  price: number;
  adminOverride: boolean;
  overrideExpiresAt: string | null;
  takenDown: boolean;
  submittedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  overrideActive: boolean;
  subscriberCurrent: boolean;
  labelEligible: boolean;
  submitterIsPro: boolean | null;
  submitterTier: string | null;
}

function SubscriberBadge({ track }: { track: LabelTrack }) {
  if (track.submittedByUserId === null) {
    return (
      <Badge variant="outline" className="gap-1 bg-purple-500/10 text-purple-400 border-purple-500/20 text-[10px]">
        <Crown className="w-3 h-3" /> Admin Upload
      </Badge>
    );
  }
  if (track.overrideActive) {
    const exp = track.overrideExpiresAt ? new Date(track.overrideExpiresAt).toLocaleDateString() : "?";
    return (
      <Badge variant="outline" className="gap-1 bg-yellow-500/10 text-yellow-400 border-yellow-500/20 text-[10px]">
        <Star className="w-3 h-3" /> Override → {exp}
      </Badge>
    );
  }
  if (track.subscriberCurrent) {
    return (
      <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
        <CheckCircle className="w-3 h-3" /> Subscriber
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">
      <AlertTriangle className="w-3 h-3" /> {track.submitterIsPro ? "Lapsed" : "Free User"}
    </Badge>
  );
}

const FILE_INPUT_CLASS =
  "block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer";

function AdminLabelDashboard() {
  const { logout } = useAdminAuth();
  const { toast } = useToast();

  const [tracks, setTracks] = useState<LabelTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"queue" | "live" | "down" | "upload">("queue");
  const [overrideMonths, setOverrideMonths] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadArtist, setUploadArtist] = useState("");
  const [uploadFull, setUploadFull] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<File | null>(null);
  const [uploadCover, setUploadCover] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fullRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/label/tracks", { credentials: "include" });
      if (r.status === 401 || r.status === 403) { logout(); return; }
      const data = await r.json() as { tracks?: LabelTrack[]; error?: string };
      if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
      setTracks(data.tracks ?? []);
    } catch (e) {
      toast({ title: "Load failed", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [logout, toast]);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: string, body?: object) {
    setActing(id + action);
    try {
      const r = await fetch(`/api/admin/label/tracks/${id}/${action}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (r.status === 401 || r.status === 403) { logout(); return; }
      const data = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
      toast({ title: "Done", description: `Track ${action} successful.` });
      await load();
    } catch (e) {
      toast({ title: "Action failed", description: String(e), variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  /** One-click removal from the label page — track stays in the owner's library. */
  async function delist(id: string) {
    await act(id, "delist");
  }

  /** Permanent delete: gone from label AND every library, audio wiped from storage. */
  async function destroy(id: string, title: string) {
    if (!window.confirm(`Permanently delete "${title}"? This wipes the audio and removes it from every library. Cannot be undone.`)) return;
    setActing(id + "delete");
    try {
      const r = await fetch(`/api/admin/label/tracks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (r.status === 401 || r.status === 403) { logout(); return; }
      const data = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
      toast({ title: "Deleted", description: `"${title}" permanently removed.` });
      await load();
    } catch (e) {
      toast({ title: "Delete failed", description: String(e), variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  async function doUpload() {
    if (!uploadTitle.trim() || !uploadArtist.trim() || !uploadFull || !uploadPreview || !uploadCover) {
      toast({ title: "Missing fields", description: "Fill all fields and attach all three files.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("title", uploadTitle.trim());
      fd.append("artistName", uploadArtist.trim());
      fd.append("audio_full", uploadFull);
      fd.append("audio_preview", uploadPreview);
      fd.append("cover_art", uploadCover);
      const r = await fetch("/api/tracks/submit", { method: "POST", credentials: "include", body: fd });
      if (r.status === 401 || r.status === 403) { logout(); return; }
      const data = await r.json() as { error?: string; track?: { id?: string; status?: string } };
      if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
      toast({ title: "Uploaded", description: `"${uploadTitle.trim()}" added to the label.` });
      setUploadTitle(""); setUploadArtist("");
      setUploadFull(null); setUploadPreview(null); setUploadCover(null);
      if (fullRef.current) fullRef.current.value = "";
      if (previewRef.current) previewRef.current.value = "";
      if (coverRef.current) coverRef.current.value = "";
      await load();
      setTab("live");
    } catch (e) {
      toast({ title: "Upload failed", description: String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const pending = tracks.filter(t => t.status === "pending");
  const live = tracks.filter(t => t.status === "accepted" && !t.takenDown);
  const down = tracks.filter(t => t.takenDown || t.status === "rejected");

  const tabs = [
    { id: "queue" as const, label: `Queue (${pending.length})`, icon: <Clock className="w-4 h-4" /> },
    { id: "live" as const, label: `Live (${live.length})`, icon: <CheckCircle className="w-4 h-4" /> },
    { id: "down" as const, label: `Taken Down (${down.length})`, icon: <XCircle className="w-4 h-4" /> },
    { id: "upload" as const, label: "Admin Upload", icon: <Upload className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      {/* Admin nav */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/admin">
          <Button variant="ghost" size="sm">Analytics</Button>
        </Link>
        <Link href="/admin/tracks">
          <Button variant="ghost" size="sm">Track Submissions</Button>
        </Link>
        <Link href="/admin/label">
          <Button variant="secondary" size="sm">Label Admin</Button>
        </Link>
        <Link href="/admin/waitlist">
          <Button variant="ghost" size="sm">Waitlist</Button>
        </Link>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
        <Button variant="outline" size="sm" onClick={logout}>Lock</Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Music className="w-6 h-6 text-primary" /> Label Admin
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Approve, override, or take down tracks. Subscriber-based auto-takedown runs on every refresh.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border/50">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Queue ── */}
      {tab === "queue" && (
        <div className="space-y-3">
          {pending.length === 0 && (
            <p className="text-muted-foreground text-sm py-8 text-center">No pending tracks.</p>
          )}
          {pending.map(t => (
            <Card key={t.id} className="border-border/40 bg-card/40">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{t.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{t.artistName}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <SubscriberBadge track={t} />
                      <span className="text-xs text-muted-foreground">
                        ${t.price.toFixed(2)} · {new Date(t.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    {/* Override months selector */}
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        placeholder="mo"
                        value={overrideMonths[t.id] ?? "6"}
                        onChange={e => setOverrideMonths(m => ({ ...m, [t.id]: e.target.value }))}
                        className="w-16 h-8 text-sm text-center"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                        disabled={acting !== null}
                        onClick={() => void act(t.id, "override", { months: Number(overrideMonths[t.id] ?? 6) })}
                      >
                        {acting === t.id + "override" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                        Override
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                      disabled={acting !== null}
                      onClick={() => void act(t.id, "approve")}
                    >
                      {acting === t.id + "approve" ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-red-500/40 text-red-400 hover:bg-red-500/10"
                      disabled={acting !== null}
                      onClick={() => void act(t.id, "reject")}
                    >
                      {acting === t.id + "reject" ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8"
                      disabled={acting !== null}
                      onClick={() => void destroy(t.id, t.title)}
                    >
                      {acting === t.id + "delete" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Live ── */}
      {tab === "live" && (
        <div className="space-y-3">
          {live.length === 0 && (
            <p className="text-muted-foreground text-sm py-8 text-center">No live tracks.</p>
          )}
          {live.map(t => (
            <Card key={t.id} className={`border-border/40 bg-card/40 ${
              !t.labelEligible && t.submittedByUserId ? "border-red-500/30" : ""
            }`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{t.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{t.artistName}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <SubscriberBadge track={t} />
                      <span className="text-xs text-muted-foreground">
                        ${t.price.toFixed(2)} · live since {new Date(t.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        placeholder="mo"
                        value={overrideMonths[t.id] ?? "6"}
                        onChange={e => setOverrideMonths(m => ({ ...m, [t.id]: e.target.value }))}
                        className="w-16 h-8 text-sm text-center"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                        disabled={acting !== null}
                        onClick={() => void act(t.id, "override", { months: Number(overrideMonths[t.id] ?? 6) })}
                      >
                        {acting === t.id + "override" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                        Extend
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-red-500/40 text-red-400 hover:bg-red-500/10"
                      disabled={acting !== null}
                      onClick={() => void delist(t.id)}
                      title="Instantly removes it from the public label page. Stays in the owner's personal library."
                    >
                      {acting === t.id + "delist" ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                      Remove from Label
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-red-500/40 text-red-400 hover:bg-red-500/10"
                      disabled={acting !== null}
                      onClick={() => void act(t.id, "takedown")}
                    >
                      {acting === t.id + "takedown" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Take Down
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8"
                      disabled={acting !== null}
                      onClick={() => void destroy(t.id, t.title)}
                    >
                      {acting === t.id + "delete" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Taken Down / Rejected ── */}
      {tab === "down" && (
        <div className="space-y-3">
          {down.length === 0 && (
            <p className="text-muted-foreground text-sm py-8 text-center">Nothing here.</p>
          )}
          {down.map(t => (
            <Card key={t.id} className="border-border/40 bg-card/40 opacity-70">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{t.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{t.artistName}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                        {t.status === "rejected" ? <><XCircle className="w-3 h-3" /> Rejected</> : <><Trash2 className="w-3 h-3" /> Taken Down</>}
                      </Badge>
                      <SubscriberBadge track={t} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        placeholder="mo"
                        value={overrideMonths[t.id] ?? "6"}
                        onChange={e => setOverrideMonths(m => ({ ...m, [t.id]: e.target.value }))}
                        className="w-16 h-8 text-sm text-center"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
                        disabled={acting !== null}
                        onClick={() => void act(t.id, "override", { months: Number(overrideMonths[t.id] ?? 6) })}
                      >
                        {acting === t.id + "override" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                        Override & Restore
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={acting !== null}
                      onClick={() => void act(t.id, "restore")}
                    >
                      {acting === t.id + "restore" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8"
                      disabled={acting !== null}
                      onClick={() => void destroy(t.id, t.title)}
                    >
                      {acting === t.id + "delete" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Admin Upload ── */}
      {tab === "upload" && (
        <Card className="border-border/40 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-yellow-400" />
              Admin Direct Upload
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tracks you upload here bypass subscription checks and go straight to the label as accepted.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Track Title</label>
                <Input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="e.g. Midnight Drive" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Artist Name</label>
                <Input value={uploadArtist} onChange={e => setUploadArtist(e.target.value)} placeholder="e.g. DJ Nova" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Full Track (WAV / MP3)</label>
                <input
                  ref={fullRef}
                  type="file"
                  accept="audio/*"
                  className={FILE_INPUT_CLASS}
                  onChange={e => setUploadFull(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">30-sec Preview (WAV / MP3)</label>
                <input
                  ref={previewRef}
                  type="file"
                  accept="audio/*"
                  className={FILE_INPUT_CLASS}
                  onChange={e => setUploadPreview(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cover Art (JPG / PNG)</label>
                <input
                  ref={coverRef}
                  type="file"
                  accept="image/*"
                  className={FILE_INPUT_CLASS}
                  onChange={e => setUploadCover(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <Button onClick={() => void doUpload()} disabled={uploading} className="w-full">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading…</> : <><Upload className="w-4 h-4 mr-2" /> Publish to Label</>}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AdminLabelPage() {
  return (
    <Layout>
      <AdminGate>
        <AdminLabelDashboard />
      </AdminGate>
    </Layout>
  );
}
