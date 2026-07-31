import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { AdminGate } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";
import { AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw, Send } from "lucide-react";

interface CapturedEmail {
  id: number;
  email: string;
  source: string;
  createdAt: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmailDashboard() {
  const [rows, setRows] = useState<CapturedEmail[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/email-list", { credentials: "include" });
      const json = (await res.json()) as { emails?: CapturedEmail[]; total?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setRows(json.emails ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const blast = async () => {
    setSending(true);
    setSendResult(null);
    setSendError(null);
    try {
      const res = await fetch("/api/admin/email-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject, body }),
      });
      const json = (await res.json()) as {
        sent?: number; failed?: number; batches?: number; total?: number; error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      setSendResult(
        `Sent to ${json.sent} of ${json.total} address(es) in ${json.batches} batch(es)` +
        (json.failed ? ` — ${json.failed} failed.` : "."),
      );
      if (!json.failed) {
        setSubject("");
        setBody("");
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold">Visitor Emails</h1>
            <span className="text-xs text-muted-foreground">
              {loading ? "…" : `${total} captured`}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <AdminNav />

        {/* Bulk composer */}
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5 space-y-3">
          <p className="text-sm font-semibold">Send to everyone</p>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full bg-secondary/40 border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message body — goes to every captured address via your Gmail (BCC, so addresses stay private)."
            rows={5}
            className="w-full bg-secondary/40 border border-border/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500/60 resize-y"
          />
          {sendResult && (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />{sendResult}
            </p>
          )}
          {sendError && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />{sendError}
            </p>
          )}
          {!confirming ? (
            <Button
              disabled={sending || !subject.trim() || !body.trim() || total === 0}
              onClick={() => setConfirming(true)}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              <Send className="w-4 h-4 mr-2" />
              Send to {total} address{total === 1 ? "" : "es"}
            </Button>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs text-amber-400">
                Really send to all {total} address{total === 1 ? "" : "es"}?
              </p>
              <Button
                size="sm"
                disabled={sending}
                onClick={() => void blast()}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Yes, send now"}
              </Button>
              <Button size="sm" variant="outline" disabled={sending} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          )}
        </div>

        {/* List */}
        {loadError && <p className="text-sm text-red-400">{loadError}</p>}
        {!rows && loading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {rows && rows.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground border border-border/30 bg-card/20">
            No visitor emails captured yet. They appear here the first time someone unlocks a free tool.
          </div>
        )}
        {rows && rows.length > 0 && (
          <div className="border border-border/30 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium">Source</th>
                  <th className="text-left px-4 py-2.5 font-medium">Captured</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/20">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.email}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.source}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

export default function AdminEmails() {
  return (
    <AdminGate title="Visitor Emails" description="Enter your admin key to view captured emails and send bulk messages.">
      <EmailDashboard />
    </AdminGate>
  );
}
