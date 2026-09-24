import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AdminGate, useAdminAuth } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, XCircle, Clock, Loader2, RefreshCw, ShieldAlert,
  Music, Upload, Trash2, RotateCcw, Star, AlertTriangle, Crown, Trophy, Send,
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

interface ContestEntry {
  id: string;
  title: string;
  artistName: string;
  status: "submitted" | "selected" | "not_selected" | "withdrawn";
  slotNumber: number | null;
  outreachConsentAt: string | null;
  submittedAt: string;
  masterStatus?: string;
  masterCompletedAt?: string | null;
  certificateEligible?: boolean;
  isActive?: boolean;
}

interface OutreachCatalog {
  id: string;
  entryId: string;
  originalTitle: string;
  originalFilename: string;
  status: "draft" | "approved" | "sent" | "failed" | "cancelled";
  lastError: string | null;
}

interface ContestAdminData {
  contest: { id: string; name: string; status: "open" | "closed" | "archived"; maxSlots: number } | null;
  entries: ContestEntry[];
  catalogs: OutreachCatalog[];
  storefrontBlank?: boolean;
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
  const [tab, setTab] = useState<"queue" | "live" | "down" | "contest" | "upload">("queue");
  const [overrideMonths, setOverrideMonths] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadArtist, setUploadArtist] = useState("");
  const [uploadFull, setUploadFull] = useState<File | null>(null);
  const [uploadCover, setUploadCover] = useState<File | null>(null);
  const [uploadVisibility, setUploadVisibility] = useState<"draft" | "live">("live");
  const [uploading, setUploading] = useState(false);
  const [contestData, setContestData] = useState<ContestAdminData>({ contest: null, entries: [], catalogs: [], storefrontBlank: false });
  const [contestLoading, setContestLoading] = useState(false);
  const [contestFiles, setContestFiles] = useState<Record<string, File | null>>({});
  const [catalogTitles, setCatalogTitles] = useState<Record<string, string>>({});
  const [deliveryFields, setDeliveryFields] = useState<Record<string, { labelName: string; recipientEmail: string }>>({});
  const fullRef = useRef<HTMLInputElement>(null);
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

  const loadContest = useCallback(async () => {
    setContestLoading(true);
    try {
      const response = await fetch("/api/admin/featured-contest", { credentials: "include" });
      if (response.status === 401 || response.status === 403) { logout(); return; }
      const data = await response.json() as ContestAdminData & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Error ${response.status}`);
      setContestData(data);
    } catch (error) {
      toast({ title: "Contest load failed", description: String(error), variant: "destructive" });
    } finally {
      setContestLoading(false);
    }
  }, [logout, toast]);

  useEffect(() => { void loadContest(); }, [loadContest]);

  async function contestRequest(path: string, init: RequestInit, success: string) {
    setActing(path);
    try {
      const response = await fetch(path, { credentials: "include", ...init });
      if (response.status === 401 || response.status === 403) { logout(); return; }
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Error ${response.status}`);
      toast({ title: success });
      await loadContest();
    } catch (error) {
      toast({ title: "Contest action failed", description: String(error), variant: "destructive" });
    } finally {
      setActing(null);
    }
  }

  async function uploadOutreachCatalog(entry: ContestEntry) {
    const audio = contestFiles[entry.id];
    const originalTitle = catalogTitles[entry.id]?.trim();
    if (!audio || !originalTitle) {
      toast({ title: "Original title and audio are required", variant: "destructive" });
      return;
    }
    const body = new FormData();
    body.append("originalTitle", originalTitle);
    body.append("audio", audio);
    await contestRequest(`/api/admin/featured-contest/entries/${entry.id}/catalog`, { method: "POST", body }, "Private catalog item stored");
  }

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
    if (!uploadTitle.trim() || !uploadArtist.trim() || !uploadFull || !uploadCover) {
      toast({ title: "Missing fields", description: "Fill the title, artist, master, and cover artwork.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("title", uploadTitle.trim());
      fd.append("artistName", uploadArtist.trim());
      fd.append("audio_master", uploadFull);
      fd.append("cover_art", uploadCover);
      fd.append("visibility", uploadVisibility);
      const r = await fetch("/api/admin/label/publish", { method: "POST", credentials: "include", body: fd });
      if (r.status === 401 || r.status === 403) { logout(); return; }
      const data = await r.json() as { error?: string; track?: { id?: string; status?: string } };
      if (!r.ok) throw new Error(data.error ?? `Error ${r.status}`);
      toast({
        title: uploadVisibility === "live" ? "Published" : "Draft saved",
        description: uploadVisibility === "live"
          ? `"${uploadTitle.trim()}" is live on the label.`
          : `"${uploadTitle.trim()}" is saved as a draft and is not public.`,
      });
      setUploadTitle(""); setUploadArtist("");
      setUploadFull(null); setUploadCover(null);
      setUploadVisibility("live");
      if (fullRef.current) fullRef.current.value = "";
      if (coverRef.current) coverRef.current.value = "";
      await load();
      setTab(uploadVisibility === "live" ? "live" : "queue");
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
    { id: "contest" as const, label: `Featured Contest (${contestData.entries.length})`, icon: <Trophy className="w-4 h-4" /> },
    { id: "upload" as const, label: "Admin Upload", icon: <Upload className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <AdminNav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={logout}>Lock</Button>
        </div>
      </AdminNav>

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

      {/* ── Featured Artist Contest ── */}
      {tab === "contest" && (
        <div className="space-y-5">
          <Card className="border-amber-500/25 bg-amber-500/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Ten-slot selection</p>
                <h2 className="font-bold">{contestData.contest?.name ?? "No contest round yet"}</h2>
                <p className="text-xs text-muted-foreground">
                  {contestData.entries.filter(entry => entry.status === "selected").length} / {contestData.contest?.maxSlots ?? 10} featured artists selected
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void contestRequest("/api/admin/control/storefront", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ storefrontBlank: !contestData.storefrontBlank }),
                  }, contestData.storefrontBlank ? "Storefront releases restored" : "Storefront blank mode enabled")}
                >
                  {contestData.storefrontBlank ? "Restore storefront" : "Blank storefront"}
                </Button>
                {contestData.contest && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void contestRequest(
                      `/api/admin/featured-contest/${contestData.contest!.id}/status`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: contestData.contest?.status === "open" ? "closed" : "open" }),
                      },
                      contestData.contest?.status === "open" ? "Contest closed" : "Contest opened",
                    )}
                  >
                    {contestData.contest.status === "open" ? "Close auditions" : "Open auditions"}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void loadContest()} disabled={contestLoading}>
                  {contestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>

          {contestData.entries.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No Main Stage auditions yet.</p>}
          {contestData.entries.map(entry => {
            const catalog = contestData.catalogs.find(item => item.entryId === entry.id);
            const delivery = deliveryFields[catalog?.id ?? ""] ?? { labelName: "", recipientEmail: "" };
            return (
              <Card key={entry.id} className={entry.status === "selected" ? "border-amber-500/35 bg-amber-500/5" : "border-border/40 bg-card/40"}>
                <CardContent className="space-y-4 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold">{entry.artistName}</h3>
                        {entry.slotNumber && <Badge className="bg-amber-500 text-black">Spot #{entry.slotNumber}</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{entry.title}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Submitted {new Date(entry.submittedAt).toLocaleString()} · Outreach consent {entry.outreachConsentAt ? "granted" : "not granted"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge variant="outline" className={entry.masterStatus === "completed" ? "text-emerald-400" : "text-amber-400"}>
                          Master {entry.masterStatus === "completed" ? "eligible" : entry.masterStatus ?? "pending"}
                        </Badge>
                        <Badge variant="outline" className={entry.certificateEligible ? "text-emerald-400" : "text-muted-foreground"}>
                          IP certificate {entry.certificateEligible ? "eligible" : "not recorded"}
                        </Badge>
                        <Badge variant="outline" className={entry.isActive === false ? "text-muted-foreground" : "text-emerald-400"}>
                          Artist {entry.isActive === false ? "inactive" : "active"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <a href={`/api/featured-contest/entries/${entry.id}/audio`} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline">Review audio</Button>
                      </a>
                      <Button
                        size="sm"
                        className={entry.status === "selected" ? "" : "bg-amber-500 text-black hover:bg-amber-600"}
                        variant={entry.status === "selected" ? "outline" : "default"}
                        disabled={acting !== null}
                        onClick={() => void contestRequest(
                          `/api/admin/featured-contest/entries/${entry.id}/selection`,
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ selected: entry.status !== "selected" }),
                          },
                          entry.status === "selected" ? "Artist removed from featured spots" : "Artist selected",
                        )}
                      >
                        {entry.status === "selected" ? "Remove selection" : "Select artist"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={acting !== null}
                        onClick={() => void contestRequest(
                          `/api/admin/featured-contest/entries/${entry.id}/active`,
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ active: entry.isActive === false }),
                          },
                          entry.isActive === false ? "Artist profile activated" : "Artist profile deactivated",
                        )}
                      >
                        {entry.isActive === false ? "Activate artist" : "Deactivate artist"}
                      </Button>
                    </div>
                  </div>

                  {entry.status === "selected" && entry.outreachConsentAt && !catalog && (
                    <div className="grid gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-[1fr_1fr_auto]">
                      <Input placeholder="Original catalog title" value={catalogTitles[entry.id] ?? ""} onChange={event => setCatalogTitles(value => ({ ...value, [entry.id]: event.target.value }))} />
                      <input type="file" accept="audio/*" className={FILE_INPUT_CLASS} onChange={event => setContestFiles(value => ({ ...value, [entry.id]: event.target.files?.[0] ?? null }))} />
                      <Button onClick={() => void uploadOutreachCatalog(entry)} disabled={acting !== null}><Upload className="mr-2 h-4 w-4" /> Store privately</Button>
                    </div>
                  )}

                  {catalog && (
                    <div className="space-y-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{catalog.originalTitle}</p>
                          <p className="text-xs text-muted-foreground">{catalog.originalFilename} · {catalog.status}</p>
                        </div>
                        <div className="flex gap-2">
                          <a href={`/api/admin/featured-contest/catalogs/${catalog.id}/audio`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Review original</Button></a>
                          {catalog.status === "draft" && (
                            <Button size="sm" onClick={() => void contestRequest(`/api/admin/featured-contest/catalogs/${catalog.id}/approve`, { method: "PATCH" }, "Catalog approved")}>Approve catalog</Button>
                          )}
                        </div>
                      </div>
                      {(catalog.status === "approved" || catalog.status === "failed") && (
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <Input placeholder="Label or sync contact" value={delivery.labelName} onChange={event => setDeliveryFields(value => ({ ...value, [catalog.id]: { ...delivery, labelName: event.target.value } }))} />
                          <Input type="email" placeholder="recipient@example.com" value={delivery.recipientEmail} onChange={event => setDeliveryFields(value => ({ ...value, [catalog.id]: { ...delivery, recipientEmail: event.target.value } }))} />
                          <Button
                            disabled={!delivery.labelName.trim() || !delivery.recipientEmail.trim() || acting !== null}
                            onClick={() => void contestRequest(
                              `/api/admin/featured-contest/catalogs/${catalog.id}/send`,
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(delivery),
                              },
                              "Private catalog delivered",
                            )}
                          ><Send className="mr-2 h-4 w-4" /> Send</Button>
                        </div>
                      )}
                      {catalog.lastError && <p className="text-xs text-red-400">{catalog.lastError}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
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
              Upload a master directly to the label. The server derives the preview and commits the release at the fixed $9.99 price.
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
                <label className="text-xs text-muted-foreground">Audio Master (WAV / MP3)</label>
                <input
                  ref={fullRef}
                  type="file"
                  accept="audio/*"
                  className={FILE_INPUT_CLASS}
                  onChange={e => setUploadFull(e.target.files?.[0] ?? null)}
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
            <div className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Release price</span>
              <span className="font-bold text-amber-400">$9.99 fixed</span>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground">Release visibility</legend>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={uploadVisibility === "draft" ? "default" : "outline"}
                  aria-pressed={uploadVisibility === "draft"}
                  onClick={() => setUploadVisibility("draft")}
                >
                  Save as Draft
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={uploadVisibility === "live" ? "default" : "outline"}
                  aria-pressed={uploadVisibility === "live"}
                  onClick={() => setUploadVisibility("live")}
                >
                  Publish Live
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {uploadVisibility === "draft"
                  ? "Drafts remain out of the public catalog."
                  : "Live releases appear in the public catalog after upload."}
              </p>
            </fieldset>
            <Button onClick={() => void doUpload()} disabled={uploading} className="w-full">
              {uploading
                ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {uploadVisibility === "live" ? "Publishing…" : "Saving draft…"}</>
                : <><Upload className="w-4 h-4 mr-2" /> {uploadVisibility === "live" ? "Publish to Label" : "Save Draft"}</>}
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
      <AdminGate ownerOnly>
        <AdminLabelDashboard />
      </AdminGate>
    </Layout>
  );
}
