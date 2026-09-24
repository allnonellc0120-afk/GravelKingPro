import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { AdminGate } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, Mail, RefreshCw, Send } from "lucide-react";

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
  const [failedRecipients, setFailedRecipients] = useState<string[]>([]);
  const [retrying, setRetrying] = useState(false);
  const [provider, setProvider] = useState<"sendgrid" | "gmail">("sendgrid");
  const [providerStatus, setProviderStatus] = useState<{ sendgrid?: { ok: boolean; detail?: string }; gmail?: boolean } | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    provider: "sendgrid" | "gmail";
    total: number;
    batches: number;
    emails: string[];
  } | null>(null);
  const [showPreviewAddresses, setShowPreviewAddresses] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const previewVersion = useRef(0);

  const invalidatePreview = useCallback(() => {
    previewVersion.current += 1;
    setPreview(null);
    setShowPreviewAddresses(false);
    setPreviewing(false);
    setConfirming(false);
  }, []);

  const load = useCallback(async () => {
    invalidatePreview();
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
  }, [invalidatePreview]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch("/api/admin/email-provider", { credentials: "include" })
      .then(async (res) => res.ok ? await res.json() as typeof providerStatus : null)
      .then((status) => { if (status) setProviderStatus(status); })
      .catch(() => {});
  }, []);

  const previewRecipients = async () => {
    const requestVersion = previewVersion.current;
    setPreviewing(true);
    setSendError(null);
    try {
      const res = await fetch("/api/admin/email-blast/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider }),
      });
      const json = (await res.json()) as {
        previewId?: string;
        provider?: "sendgrid" | "gmail";
        total?: number;
        batches?: number;
        emails?: string[];
        error?: string;
      };
      if (
        !res.ok
        || !json.previewId
        || !json.provider
        || json.total === undefined
        || json.batches === undefined
        || !Array.isArray(json.emails)
        || json.emails.some((email) => typeof email !== "string")
      ) {
        throw new Error(json.error ?? "Could not preview recipients");
      }
      if (requestVersion === previewVersion.current) {
        setPreview({
          id: json.previewId,
          provider: json.provider,
          total: json.total,
          batches: json.batches,
          emails: json.emails,
        });
        setShowPreviewAddresses(false);
        setConfirming(true);
      }
    } catch (e) {
      if (requestVersion === previewVersion.current) {
        setSendError(e instanceof Error ? e.message : "Could not preview recipients");
      }
    } finally {
      if (requestVersion === previewVersion.current) setPreviewing(false);
    }
  };

  const blast = async (retryRecipients?: string[]) => {
    const isRetry = Array.isArray(retryRecipients);
    const activePreview = preview;
    if (!isRetry && !activePreview) {
      setSendError("Preview the recipient list before sending.");
      return;
    }
    setSending(true);
    if (isRetry) setRetrying(true);
    setSendResult(null);
    setSendError(null);
    try {
      const res = await fetch("/api/admin/email-blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          subject,
          body,
          provider,
          ...(isRetry ? { recipients: retryRecipients } : { previewId: activePreview?.id }),
        }),
      });
      const json = (await res.json()) as {
        sent?: number;
        failed?: number;
        failedRecipients?: string[];
        batches?: number;
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      const nextFailedRecipients = json.failedRecipients ?? [];
      setFailedRecipients(nextFailedRecipients);
      setSendResult(
        `${isRetry ? "Retried" : "Sent"} via ${provider === "sendgrid" ? "SendGrid" : "Gmail"} to ${json.sent} of ${json.total} address(es) in ${json.batches} batch(es)` +
          (json.failed ? ` — ${json.failed} failed.` : "."),
      );
      if (!nextFailedRecipients.length) {
        setSubject("");
        setBody("");
      }
      if (!isRetry) invalidatePreview();
    } catch (e) {
      if (!isRetry) invalidatePreview();
      setSendError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
      setRetrying(false);
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
           <div className="flex items-center justify-between gap-3 flex-wrap">
             <p className="text-sm font-semibold">Staged outreach</p>
             <div className="flex items-center gap-2">
               <label className="text-xs text-muted-foreground">Provider</label>
                <select value={provider} onChange={(e) => {
                  setProvider(e.target.value as "sendgrid" | "gmail");
                  invalidatePreview();
                }} className="bg-secondary/40 border border-border/40 rounded px-2 py-1.5 text-xs">
                 <option value="sendgrid">SendGrid {providerStatus?.sendgrid?.ok ? "· ready" : ""}</option>
                 <option value="gmail">Gmail {providerStatus?.gmail ? "· ready" : ""}</option>
               </select>
             </div>
           </div>
           <p className="text-xs text-muted-foreground">Review the copy, choose the sender, then confirm. The send is never triggered by opening this page.</p>
           {preview && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span>
                    Recipient preview: <strong>{preview.total} deduplicated address{preview.total === 1 ? "" : "es"}</strong>
                    {" · "}
                    <strong>{preview.batches} {preview.batches === 1 ? "provider batch" : "provider batches"}</strong>
                    {" · "}
                    {preview.provider === "sendgrid" ? "SendGrid" : "Gmail"} will process this snapshot.
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPreviewAddresses((visible) => !visible)}
                    aria-expanded={showPreviewAddresses}
                    className="inline-flex items-center gap-1 rounded border border-amber-400/40 px-2 py-1 font-medium text-amber-100 hover:bg-amber-500/15"
                  >
                    {showPreviewAddresses ? "Hide addresses" : "Show addresses"}
                    {showPreviewAddresses
                      ? <ChevronUp className="w-3.5 h-3.5" />
                      : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {showPreviewAddresses && (
                  <div className="max-h-48 overflow-y-auto rounded border border-amber-500/20 bg-black/10 p-2 font-mono text-[11px] leading-5 text-amber-100/90">
                    {preview.emails.length > 0 ? (
                      <ul className="space-y-0.5">
                        {preview.emails.map((email) => (
                          <li key={email} className="break-all">{email}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-amber-100/70">No recipients in this snapshot.</p>
                    )}
                  </div>
                )}
             </div>
           )}
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
          {failedRecipients.length > 0 && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 space-y-2">
              <p className="text-xs text-red-300">
                {failedRecipients.length} recipient{failedRecipients.length === 1 ? "" : "s"} failed.
                Successful recipients are excluded from this retry.
              </p>
              <p className="text-xs text-muted-foreground break-words">
                {failedRecipients.join(", ")}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={sending || !subject.trim() || !body.trim()}
                onClick={() => void blast(failedRecipients)}
              >
                {retrying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Retry failed recipient{failedRecipients.length === 1 ? "" : "s"}
              </Button>
            </div>
          )}
           {!preview ? (
             <Button
               disabled={previewing || sending || !subject.trim() || !body.trim() || total === 0}
               onClick={() => void previewRecipients()}
               className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
             >
               {previewing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
               Preview recipient list
             </Button>
           ) : !confirming ? (
            <Button
              disabled={sending || !subject.trim() || !body.trim() || total === 0}
              onClick={() => setConfirming(true)}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              <Send className="w-4 h-4 mr-2" />
               Send to {preview.total} address{preview.total === 1 ? "" : "es"}
            </Button>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-xs text-amber-400">
                 Really send to all {preview.total} deduplicated address{preview.total === 1 ? "" : "es"} in {preview.batches} {preview.batches === 1 ? "batch" : "batches"}?
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
