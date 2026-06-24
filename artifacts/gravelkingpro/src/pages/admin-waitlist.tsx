import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { AdminGate, useAdminAuth } from "@/components/admin-gate";
import { downloadBlob } from "@/lib/download";

interface WaitlistEntry {
  id: number;
  email: string;
  createdAt: string;
}

interface WaitlistData {
  total: number;
  entries: WaitlistEntry[];
}

interface AnnounceResult {
  sent: number;
  failed: number;
}

function fmt(date: string): string {
  return new Date(date).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Dashboard (rendered only when AdminGate is unlocked) ──────────────────────

function WaitlistDashboard() {
  const { logout } = useAdminAuth();
  const [data, setData] = useState<WaitlistData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [showCompose, setShowCompose] = useState(false);
  const [subject, setSubject] = useState("GravelKing Pro payments are now live 🎉");
  const [body, setBody] = useState(
    "Hey!\n\nWe're excited to let you know that GravelKing Pro subscription plans are now live. Head over to the site to grab your plan and unlock real-time metrics, PDF reports, WAV downloads, and more.\n\nhttps://gravelkingpro.com\n\n— The GravelKing Pro team",
  );
  const [fromName, setFromName] = useState("GravelKing Pro");
  const [fromEmail, setFromEmail] = useState("noreply@gravelkingpro.com");
  const [sending, setSending] = useState(false);
  const [announceResult, setAnnounceResult] = useState<AnnounceResult | null>(null);
  const [announceError, setAnnounceError] = useState<string | null>(null);
  const composeRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist/admin", { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        logout();
        return;
      }
      if (res.status === 503) {
        setError("Admin key is not configured on the server.");
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData((await res.json()) as WaitlistData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load waitlist.");
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => { void load(); }, [load]);

  const handleExportCsv = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/waitlist/admin?format=csv", { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      downloadBlob(blob, "waitlist.csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenCompose = () => {
    setAnnounceResult(null);
    setAnnounceError(null);
    setShowCompose(true);
    setTimeout(() => {
      composeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleSendAnnouncement = async () => {
    setAnnounceResult(null);
    setAnnounceError(null);
    setSending(true);
    try {
      const res = await fetch("/api/waitlist/admin/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject, body, fromName, fromEmail }),
      });
      const json = (await res.json()) as { sent?: number; failed?: number; error?: string };
      if (!res.ok) {
        setAnnounceError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setAnnounceResult({ sent: json.sent ?? 0, failed: json.failed ?? 0 });
      setShowCompose(false);
    } catch (e) {
      setAnnounceError(e instanceof Error ? e.message : "Failed to send announcement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Mail className="w-6 h-6 text-amber-500" />
              Waitlist
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Everyone who asked to be notified when payments go live
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              onClick={() => void handleExportCsv()}
              disabled={downloading || !data}
            >
              {downloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Export CSV
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold"
              onClick={handleOpenCompose}
              disabled={!data || data.total === 0}
            >
              <Send className="w-3.5 h-3.5" />
              Send announcement
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void logout()}
            >
              Lock
            </Button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {announceResult && (
          <div className="flex items-start gap-3 text-sm bg-green-500/10 border border-green-500/30 rounded-md px-4 py-3">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-green-400">Announcement sent!</span>{" "}
              <span className="text-muted-foreground">
                {announceResult.sent.toLocaleString()} email
                {announceResult.sent !== 1 ? "s" : ""} delivered
                {announceResult.failed > 0 ? `, ${announceResult.failed.toLocaleString()} failed` : ""}.
              </span>
            </div>
          </div>
        )}

        {!data && loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && (
          <>
            {/* Total count */}
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="pt-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <Mail className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <div className="text-4xl font-bold text-amber-500">{data.total.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {data.total === 1 ? "person" : "people"} on the waitlist
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compose panel */}
            {showCompose && (
              <Card ref={composeRef} className="border-green-500/30 bg-green-500/5">
                <CardContent className="pt-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold flex items-center gap-2">
                      <Send className="w-4 h-4 text-green-400" />
                      Compose announcement
                    </h2>
                    <button
                      onClick={() => setShowCompose(false)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Close compose"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    This will send a plain-text email to all{" "}
                    <span className="text-amber-400 font-medium">{data.total.toLocaleString()}</span>{" "}
                    waitlist recipients via Resend. Make sure{" "}
                    <code className="bg-secondary/60 px-1 rounded text-xs">RESEND_API_KEY</code>{" "}
                    is configured and your sender domain is verified in Resend.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground font-medium">From name</label>
                      <input
                        type="text"
                        value={fromName}
                        onChange={(e) => setFromName(e.target.value)}
                        className="px-3 py-2 rounded-md bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:border-green-500/60"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground font-medium">From email</label>
                      <input
                        type="email"
                        value={fromEmail}
                        onChange={(e) => setFromEmail(e.target.value)}
                        className="px-3 py-2 rounded-md bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:border-green-500/60"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground font-medium">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="px-3 py-2 rounded-md bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:border-green-500/60 w-full"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground font-medium">Body (plain text)</label>
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={9}
                      className="px-3 py-2 rounded-md bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:border-green-500/60 w-full resize-y font-mono"
                    />
                  </div>

                  {announceError && (
                    <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {announceError}
                    </div>
                  )}

                  <div className="flex items-center gap-3 justify-end pt-1">
                    <Button variant="outline" size="sm" onClick={() => setShowCompose(false)} disabled={sending}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold"
                      onClick={() => void handleSendAnnouncement()}
                      disabled={sending || !subject.trim() || !body.trim()}
                    >
                      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      {sending
                        ? "Sending…"
                        : `Send to ${data.total.toLocaleString()} recipient${data.total !== 1 ? "s" : ""}`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Table */}
            <Card className="border-border/40 bg-card/40">
              <CardContent className="pt-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-4">
                  All signups · oldest first
                </div>
                {data.entries.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    No signups yet. Share the site to start collecting emails.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/40">
                          <th className="text-left text-xs text-muted-foreground font-medium py-2 pr-4 w-12">#</th>
                          <th className="text-left text-xs text-muted-foreground font-medium py-2 pr-4">Email</th>
                          <th className="text-left text-xs text-muted-foreground font-medium py-2">Signed up</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.entries.map((entry, i) => (
                          <tr
                            key={entry.id}
                            className="border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors"
                          >
                            <td className="py-2.5 pr-4 text-muted-foreground tabular-nums">{i + 1}</td>
                            <td className="py-2.5 pr-4 font-mono text-xs text-foreground/90">{entry.email}</td>
                            <td className="py-2.5 text-muted-foreground text-xs whitespace-nowrap">{fmt(entry.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function AdminWaitlist() {
  return (
    <AdminGate title="Waitlist Dashboard" description="Enter your admin key to view signups.">
      <WaitlistDashboard />
    </AdminGate>
  );
}
