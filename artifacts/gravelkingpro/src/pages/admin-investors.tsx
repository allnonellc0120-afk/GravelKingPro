import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, RefreshCw, CheckCircle2, Clock, AlertCircle, Circle, Download, BellRing, Mail, MailX } from "lucide-react";
import { AdminGate } from "@/components/admin-gate";
import { AdminNav } from "@/components/admin-nav";

// ── Types ────────────────────────────────────────────────────────────────────

interface TouchRow {
  id: string;
  prospectId: string;
  touchNumber: number;
  sentAt: string | null;
  response: string | null;
  notes: string | null;
}

interface ProspectRow {
  id: string;
  sortOrder: number;
  name: string;
  route: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  touches: TouchRow[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  touch_1_sent: "Touch 1 sent",
  touch_2_sent: "Touch 2 sent",
  touch_3_sent: "Touch 3 sent",
  responded: "Responded",
  meeting_booked: "Meeting booked",
  passed: "Passed",
  closed: "Closed",
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Days since a date string (YYYY-MM-DD), or null if not sent. */
function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

/** Terminal statuses where outreach is complete — suppress overdue flags. */
const TERMINAL_STATUSES = new Set(["responded", "meeting_booked", "passed", "closed"]);

/**
 * Determine overdue state for a touch slot.
 * T2 is due at day 5 after T1. T3 is due at day 12 after T1.
 * Returns null for terminal statuses where the cadence is complete.
 */
function overdueLabel(
  touchNum: number,
  t1SentAt: string | null,
  thisSentAt: string | null,
  prospectStatus: string,
): string | null {
  if (thisSentAt) return null; // already sent
  if (TERMINAL_STATUSES.has(prospectStatus)) return null; // outreach concluded
  const age = daysSince(t1SentAt);
  if (age === null) return null; // T1 not sent yet
  if (touchNum === 2 && age >= 5) return `T1 was ${age}d ago — T2 due`;
  if (touchNum === 3 && age >= 12) return `T1 was ${age}d ago — T3 due`;
  return null;
}

function statusColor(status: string): string {
  switch (status) {
    case "meeting_booked": return "text-green-400";
    case "responded": return "text-blue-400";
    case "touch_3_sent": return "text-amber-400";
    case "touch_2_sent": return "text-amber-300";
    case "touch_1_sent": return "text-zinc-300";
    case "passed":
    case "closed": return "text-muted-foreground";
    default: return "text-zinc-500";
  }
}

// ── Touch chip component ─────────────────────────────────────────────────────

interface TouchChipProps {
  prospectId: string;
  prospectStatus: string;
  touchNum: number;
  touch: TouchRow | undefined;
  t1SentAt: string | null;
  busy: boolean;
  onMarkSent: (prospectId: string, touchNum: number) => void;
  onClear: (prospectId: string, touchNum: number) => void;
  onUpdateResponse: (prospectId: string, touchNum: number, response: string) => void;
}

function TouchChip({
  prospectId,
  prospectStatus,
  touchNum,
  touch,
  t1SentAt,
  busy,
  onMarkSent,
  onClear,
  onUpdateResponse,
}: TouchChipProps) {
  const [editingResponse, setEditingResponse] = useState(false);
  const [responseText, setResponseText] = useState(touch?.response ?? "");

  // Sync response text if touch changes from outside
  useEffect(() => {
    if (!editingResponse) setResponseText(touch?.response ?? "");
  }, [touch?.response, editingResponse]);

  const overdue = overdueLabel(touchNum, t1SentAt, touch?.sentAt ?? null, prospectStatus);
  const isSent = !!touch?.sentAt;

  const label = touchNum === 1 ? "T1" : touchNum === 2 ? "T2" : "T3";
  const dueHint =
    touchNum === 2 ? "day 5" : touchNum === 3 ? "day 12" : "day 1";

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 text-sm flex-1 min-w-[140px] ${
        overdue
          ? "border-amber-500/60 bg-amber-950/20"
          : isSent
          ? "border-green-800/40 bg-green-950/10"
          : "border-border/40"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-xs uppercase tracking-wide text-muted-foreground">
          {label}
          <span className="ml-1 font-normal normal-case">({dueHint})</span>
        </span>
        {isSent ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
        ) : overdue ? (
          <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        ) : (
          <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        )}
      </div>

      {isSent ? (
        <div className="text-xs text-muted-foreground">
          Sent <span className="text-foreground">{touch!.sentAt}</span>
        </div>
      ) : overdue ? (
        <div className="text-xs text-amber-400">{overdue}</div>
      ) : (
        <div className="text-xs text-muted-foreground/60">Not sent</div>
      )}

      {/* Response text */}
      {isSent && (
        <div>
          {editingResponse ? (
            <div className="space-y-1">
              <textarea
                className="w-full text-xs bg-muted/30 border border-border/40 rounded px-2 py-1 resize-none"
                rows={2}
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Their reply…"
              />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  disabled={busy}
                  onClick={() => {
                    onUpdateResponse(prospectId, touchNum, responseText);
                    setEditingResponse(false);
                  }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] px-2"
                  onClick={() => {
                    setResponseText(touch?.response ?? "");
                    setEditingResponse(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : touch?.response ? (
            <button
              className="text-xs text-blue-400 hover:text-blue-300 text-left block w-full truncate"
              onClick={() => setEditingResponse(true)}
              title={touch.response}
            >
              "{touch.response}"
            </button>
          ) : (
            <button
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground"
              onClick={() => setEditingResponse(true)}
            >
              + add response
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-1 flex-wrap">
        {!isSent && (touchNum === 1 || t1SentAt) && (
          <Button
            size="sm"
            className="h-6 text-[10px] px-2"
            disabled={busy}
            onClick={() => onMarkSent(prospectId, touchNum)}
          >
            Mark sent today
          </Button>
        )}
        {isSent && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] px-2 text-muted-foreground"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Clear this touch? The date and response will be deleted.")) {
                onClear(prospectId, touchNum);
              }
            }}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Types for alert panel ────────────────────────────────────────────────────

interface OverdueEntry {
  prospectName: string;
  daysSinceT1: number;
  overdueTouch: 2 | 3;
  t1SentAt: string;
}

interface AlertCheckResult {
  overdueCount: number;
  emailSent: boolean;
  skippedRecentSend: boolean;
  overdue: OverdueEntry[];
}

// ── Main dashboard component ─────────────────────────────────────────────────

function InvestorsDashboard() {
  const [prospects, setProspects] = useState<ProspectRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // prospectId currently mutating
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // prospectId being edited
  const [editBuf, setEditBuf] = useState<Partial<ProspectRow>>({});

  // Alert panel state
  const [lastAlertSentAt, setLastAlertSentAt] = useState<string | null | undefined>(undefined);
  const [alertChecking, setAlertChecking] = useState(false);
  const [alertResult, setAlertResult] = useState<AlertCheckResult | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);

  const loadAlertStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/investors/alert-status", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as { lastAlertSentAt: string | null };
      setLastAlertSentAt(json.lastAlertSentAt);
    } catch {
      setLastAlertSentAt(null);
    }
  }, []);

  const runAlertCheck = useCallback(async (force = false) => {
    setAlertChecking(true);
    setAlertResult(null);
    setAlertError(null);
    try {
      const url = force
        ? "/api/admin/investors/check-overdue?force=1"
        : "/api/admin/investors/check-overdue";
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const json = (await res.json()) as AlertCheckResult & { ok?: boolean; error?: string };
      if (!res.ok || json.error) {
        setAlertError(json.error ?? `HTTP ${res.status}`);
      } else {
        setAlertResult(json);
        if (json.emailSent) await loadAlertStatus();
      }
    } catch (e) {
      setAlertError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setAlertChecking(false);
    }
  }, [loadAlertStatus]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/investors", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { prospects: ProspectRow[] };
      setProspects(json.prospects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void loadAlertStatus();
  }, [refresh, loadAlertStatus]);

  const markSent = useCallback(
    async (prospectId: string, touchNum: number) => {
      setBusy(prospectId);
      try {
        await fetch(`/api/admin/investors/${prospectId}/touches/${touchNum}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sentAt: today() }),
        });
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const clearTouch = useCallback(
    async (prospectId: string, touchNum: number) => {
      setBusy(prospectId);
      try {
        await fetch(`/api/admin/investors/${prospectId}/touches/${touchNum}`, {
          method: "DELETE",
          credentials: "include",
        });
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const updateResponse = useCallback(
    async (prospectId: string, touchNum: number, response: string) => {
      setBusy(prospectId);
      try {
        await fetch(`/api/admin/investors/${prospectId}/touches/${touchNum}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ response }),
        });
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const saveEdit = useCallback(
    async (prospectId: string) => {
      setBusy(prospectId);
      try {
        await fetch(`/api/admin/investors/${prospectId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editBuf),
        });
        setEditing(null);
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [editBuf, refresh],
  );

  const updateStatus = useCallback(
    async (prospectId: string, status: string) => {
      setBusy(prospectId);
      try {
        await fetch(`/api/admin/investors/${prospectId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const downloadCSV = useCallback(() => {
    if (!prospects) return;

    /**
     * RFC 4180-compliant CSV cell encoder with spreadsheet formula injection
     * protection. Values that start with a formula trigger character (=, +, -,
     * @, TAB, CR) — including after leading whitespace or control characters —
     * are prefixed with a literal apostrophe so spreadsheet apps treat them as
     * text. Then the cell is double-quote escaped per RFC 4180.
     */
    const escape = (val: string | null | undefined): string => {
      // Normalise to string, strip control chars except \t (tab is a formula trigger too)
      let s = (val ?? "").replace(/\r/g, "");

      // Neutralise formula injection: if the value (after stripping leading
      // whitespace/zero-width chars) begins with a spreadsheet formula trigger,
      // prepend a literal apostrophe to force text interpretation.
      const FORMULA_PREFIXES = /^[\s\u200B\u00A0]*[=+\-@\t]/;
      if (FORMULA_PREFIXES.test(s)) {
        s = "'" + s;
      }

      // RFC 4180: wrap in double-quotes if the value contains comma, double-
      // quote, or newline; escape interior double-quotes by doubling them.
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = [
      "#",
      "Name",
      "Route",
      "Status",
      "T1 Sent Date",
      "T1 Response",
      "T2 Sent Date",
      "T2 Response",
      "T3 Sent Date",
      "T3 Response",
    ].join(",");

    const rows = prospects.map((p) => {
      const t1 = p.touches.find((t) => t.touchNumber === 1);
      const t2 = p.touches.find((t) => t.touchNumber === 2);
      const t3 = p.touches.find((t) => t.touchNumber === 3);
      return [
        p.sortOrder,
        escape(p.name),
        escape(p.route),
        escape(STATUS_LABELS[p.status] ?? p.status),
        escape(t1?.sentAt),
        escape(t1?.response),
        escape(t2?.sentAt),
        escape(t2?.response),
        escape(t3?.sentAt),
        escape(t3?.response),
      ].join(",");
    });

    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `investor-touches-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [prospects]);

  // Summary counts
  const summary = prospects
    ? {
        total: prospects.length,
        t1Sent: prospects.filter((p) =>
          p.touches.some((t) => t.touchNumber === 1 && t.sentAt),
        ).length,
        overdueT2: prospects.filter((p) => {
          const t1 = p.touches.find((t) => t.touchNumber === 1);
          const t2 = p.touches.find((t) => t.touchNumber === 2);
          return overdueLabel(2, t1?.sentAt ?? null, t2?.sentAt ?? null, p.status) !== null;
        }).length,
        overdueT3: prospects.filter((p) => {
          const t1 = p.touches.find((t) => t.touchNumber === 1);
          const t3 = p.touches.find((t) => t.touchNumber === 3);
          return overdueLabel(3, t1?.sentAt ?? null, t3?.sentAt ?? null, p.status) !== null;
        }).length,
        responded: prospects.filter((p) =>
          ["responded", "meeting_booked"].includes(p.status),
        ).length,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Investor Touches</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            30-day outreach tracker · T1 → T2 at day 5 · T3 at day 12 · then stop
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadCSV}
            disabled={!prospects || prospects.length === 0}
            title="Download CSV"
          >
            <Download className="h-4 w-4 mr-1.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "T1 sent", value: `${summary.t1Sent} / ${summary.total}`, icon: <CheckCircle2 className="h-4 w-4 text-green-400" /> },
            { label: "T2 overdue", value: summary.overdueT2, icon: <AlertCircle className={`h-4 w-4 ${summary.overdueT2 > 0 ? "text-amber-400" : "text-muted-foreground/40"}`} /> },
            { label: "T3 overdue", value: summary.overdueT3, icon: <AlertCircle className={`h-4 w-4 ${summary.overdueT3 > 0 ? "text-amber-400" : "text-muted-foreground/40"}`} /> },
            { label: "Responded", value: summary.responded, icon: <Clock className="h-4 w-4 text-blue-400" /> },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3 flex items-center gap-3">
                {s.icon}
                <div>
                  <div className="text-lg font-bold leading-none">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Overdue alert panel */}
      <Card className="border-border/60">
        <CardContent className="p-4 space-y-3">
          {/* Panel header row */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-amber-400 shrink-0" />
              <span className="font-semibold text-sm">Overdue Alert</span>
              <span className="text-xs text-muted-foreground">
                {lastAlertSentAt === undefined
                  ? "Loading…"
                  : lastAlertSentAt
                  ? `Last email: ${new Date(lastAlertSentAt).toLocaleString()}`
                  : "No alert email sent yet"}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={alertChecking}
                onClick={() => void runAlertCheck(false)}
                title="Check overdue and send email if needed (23-hour dedup applies)"
              >
                {alertChecking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <BellRing className="h-3.5 w-3.5 mr-1.5" />
                )}
                Check now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={alertChecking}
                onClick={() => void runAlertCheck(true)}
                title="Force check — bypasses 23-hour dedup and sends email regardless"
                className="text-amber-400 hover:text-amber-300"
              >
                Force send
              </Button>
            </div>
          </div>

          {/* Result */}
          {alertError && (
            <p className="text-xs text-destructive">{alertError}</p>
          )}
          {alertResult && (
            <div className="space-y-2">
              {/* Summary line */}
              <div className="flex items-center gap-2 text-sm flex-wrap">
                {alertResult.overdueCount === 0 ? (
                  <span className="flex items-center gap-1 text-green-400">
                    <CheckCircle2 className="h-4 w-4" /> No overdue touches — all good
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertCircle className="h-4 w-4" />
                    {alertResult.overdueCount} overdue touch{alertResult.overdueCount !== 1 ? "es" : ""}
                  </span>
                )}
                {alertResult.emailSent && (
                  <span className="flex items-center gap-1 text-blue-400 text-xs ml-2">
                    <Mail className="h-3.5 w-3.5" /> Alert email sent
                  </span>
                )}
                {alertResult.skippedRecentSend && (
                  <span className="flex items-center gap-1 text-muted-foreground text-xs ml-2">
                    <MailX className="h-3.5 w-3.5" /> Email skipped — sent within 23 h (use Force send to override)
                  </span>
                )}
                {alertResult.overdueCount > 0 && !alertResult.emailSent && !alertResult.skippedRecentSend && (
                  <span className="flex items-center gap-1 text-muted-foreground text-xs ml-2">
                    <MailX className="h-3.5 w-3.5" /> Email not sent (Gmail unavailable)
                  </span>
                )}
              </div>

              {/* Overdue list */}
              {alertResult.overdue.length > 0 && (
                <div className="rounded-md border border-amber-500/30 bg-amber-950/20 divide-y divide-amber-500/20">
                  {alertResult.overdue.map((entry, i) => (
                    <div key={i} className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-foreground">{entry.prospectName}</span>
                      <span className="text-amber-400">
                        Touch {entry.overdueTouch} overdue · T1 was {entry.daysSinceT1}d ago (sent {entry.t1SentAt})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prospect list */}
      {prospects === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {prospects.map((p) => {
            const t1 = p.touches.find((t) => t.touchNumber === 1);
            const t2 = p.touches.find((t) => t.touchNumber === 2);
            const t3 = p.touches.find((t) => t.touchNumber === 3);
            const isEditing = editing === p.id;
            const isBusy = busy === p.id;

            return (
              <Card key={p.id} className="overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  {/* Row 1: name + status */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground shrink-0">
                        #{p.sortOrder}
                      </span>
                      {isEditing ? (
                        <input
                          className="font-semibold bg-muted/30 border border-border/40 rounded px-2 py-0.5 text-sm w-48"
                          value={editBuf.name ?? p.name}
                          onChange={(e) => setEditBuf((b) => ({ ...b, name: e.target.value }))}
                        />
                      ) : (
                        <span className="font-semibold truncate">{p.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        className="text-xs bg-muted/30 border border-border/40 rounded px-2 py-1"
                        value={p.status}
                        disabled={isBusy}
                        onChange={(e) => updateStatus(p.id, e.target.value)}
                      >
                        {STATUS_OPTIONS.map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      <span className={`text-xs font-medium ${statusColor(p.status)}`}>
                        {/* colour dot only */}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs px-2"
                        onClick={() => {
                          if (isEditing) {
                            setEditing(null);
                            setEditBuf({});
                          } else {
                            setEditing(p.id);
                            setEditBuf({});
                          }
                        }}
                      >
                        {isEditing ? "Cancel" : "Edit"}
                      </Button>
                      {isEditing && (
                        <Button
                          size="sm"
                          className="h-7 text-xs px-2"
                          disabled={isBusy}
                          onClick={() => saveEdit(p.id)}
                        >
                          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Row 2: route + notes (editable) */}
                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Route: </span>
                      {isEditing ? (
                        <input
                          className="bg-muted/30 border border-border/40 rounded px-2 py-0.5 w-full mt-0.5"
                          value={editBuf.route ?? p.route ?? ""}
                          onChange={(e) => setEditBuf((b) => ({ ...b, route: e.target.value }))}
                          placeholder="email / form URL / LinkedIn…"
                        />
                      ) : p.route ? (
                        <span className="text-foreground">{p.route}</span>
                      ) : (
                        <span className="text-muted-foreground/50 italic">not set</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Angle: </span>
                      {isEditing ? (
                        <textarea
                          className="bg-muted/30 border border-border/40 rounded px-2 py-0.5 w-full mt-0.5 resize-none"
                          rows={2}
                          value={editBuf.notes ?? p.notes ?? ""}
                          onChange={(e) => setEditBuf((b) => ({ ...b, notes: e.target.value }))}
                          placeholder="why them / angle…"
                        />
                      ) : p.notes ? (
                        <span className="text-foreground">{p.notes}</span>
                      ) : (
                        <span className="text-muted-foreground/50 italic">not set</span>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Touch chips */}
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3].map((n) => (
                      <TouchChip
                        key={n}
                        prospectId={p.id}
                        prospectStatus={p.status}
                        touchNum={n}
                        touch={n === 1 ? t1 : n === 2 ? t2 : t3}
                        t1SentAt={t1?.sentAt ?? null}
                        busy={isBusy}
                        onMarkSent={markSent}
                        onClear={clearTouch}
                        onUpdateResponse={updateResponse}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page export ──────────────────────────────────────────────────────────────

export default function AdminInvestorsPage() {
  return (
    <Layout>
      <AdminGate title="Investor Touches">
        <AdminNav>
          <InvestorsDashboard />
        </AdminNav>
      </AdminGate>
    </Layout>
  );
}
