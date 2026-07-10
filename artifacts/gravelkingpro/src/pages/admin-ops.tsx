import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, RefreshCw, AlertTriangle, ShieldAlert, Activity,
  Trash2, CheckCircle2, XCircle, HelpCircle,
} from "lucide-react";
import { AdminGate, useAdminAuth } from "@/components/admin-gate";
import { Link, useLocation } from "wouter";

interface ToolErrorRow {
  id: number;
  toolName: string;
  stage: string;
  message: string;
  createdAt: string;
}

interface ActivitySession {
  sessionId: string;
  tool: string;
  timestamp: number;
}

interface IntegrityResult {
  gcpServiceAccountConfigured: boolean;
  demucsUrlConfigured: boolean;
  demucsReachable: boolean | null;
  checkedAt: string;
}

function fmt(date: string | number): string {
  return new Date(date).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function StatusPill({ ok, label }: { ok: boolean | null; label: string }) {
  if (ok === null) {
    return (
      <Badge variant="outline" className="gap-1 bg-secondary/20 text-muted-foreground border-border/40">
        <HelpCircle className="w-3 h-3" /> {label}: not configured
      </Badge>
    );
  }
  return ok ? (
    <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
      <CheckCircle2 className="w-3 h-3" /> {label}: OK
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-400 border-red-500/20">
      <XCircle className="w-3 h-3" /> {label}: unreachable
    </Badge>
  );
}

function OpsDashboard() {
  const { logout } = useAdminAuth();
  const [location] = useLocation();

  const [maintenanceOn, setMaintenanceOn] = useState<boolean | null>(null);
  const [maintenanceBusy, setMaintenanceBusy] = useState(false);

  const [sessions, setSessions] = useState<ActivitySession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const [errors, setErrors] = useState<ToolErrorRow[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);

  const [integrity, setIntegrity] = useState<IntegrityResult | null>(null);
  const [integrityLoading, setIntegrityLoading] = useState(false);

  const [purgeResult, setPurgeResult] = useState<{ filesDeleted: number; bytesFreed: number } | null>(null);
  const [purgeBusy, setPurgeBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const authed = useCallback(async <T,>(url: string, init?: RequestInit): Promise<T | null> => {
    const res = await fetch(url, { credentials: "include", ...init });
    if (res.status === 401 || res.status === 403) {
      logout();
      return null;
    }
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return (await res.json()) as T;
  }, [logout]);

  const loadMaintenance = useCallback(async () => {
    try {
      const data = await authed<{ ok: boolean; on: boolean }>("/api/admin/maintenance");
      if (data) setMaintenanceOn(data.on);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load maintenance status.");
    }
  }, [authed]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await authed<{ ok: boolean; sessions: ActivitySession[] }>("/api/admin/activity");
      if (data) setSessions(data.sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load activity.");
    } finally {
      setSessionsLoading(false);
    }
  }, [authed]);

  const loadErrors = useCallback(async () => {
    setErrorsLoading(true);
    try {
      const data = await authed<{ ok: boolean; errors: ToolErrorRow[] }>("/api/admin/tool-errors");
      if (data) setErrors(data.errors);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load error log.");
    } finally {
      setErrorsLoading(false);
    }
  }, [authed]);

  const runIntegrityCheck = useCallback(async () => {
    setIntegrityLoading(true);
    try {
      const data = await authed<IntegrityResult & { ok: boolean }>("/api/admin/integrity-check");
      if (data) setIntegrity(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Integrity check failed.");
    } finally {
      setIntegrityLoading(false);
    }
  }, [authed]);

  useEffect(() => {
    void loadMaintenance();
    void loadSessions();
    void loadErrors();
    void runIntegrityCheck();
  }, [loadMaintenance, loadSessions, loadErrors, runIntegrityCheck]);

  const toggleMaintenance = useCallback(async () => {
    if (maintenanceOn === null) return;
    setMaintenanceBusy(true);
    setError(null);
    try {
      const data = await authed<{ ok: boolean; on: boolean }>("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: !maintenanceOn }),
      });
      if (data) setMaintenanceOn(data.on);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to toggle maintenance mode.");
    } finally {
      setMaintenanceBusy(false);
    }
  }, [authed, maintenanceOn]);

  const purgeCache = useCallback(async () => {
    setPurgeBusy(true);
    setError(null);
    setPurgeResult(null);
    try {
      const data = await authed<{ ok: boolean; filesDeleted: number; bytesFreed: number }>("/api/admin/cache-purge", {
        method: "POST",
      });
      if (data) setPurgeResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cache purge failed.");
    } finally {
      setPurgeBusy(false);
    }
  }, [authed]);

  const tabs = [
    { href: "/admin", label: "Analytics" },
    { href: "/admin/tracks", label: "Tracks" },
    { href: "/admin/waitlist", label: "Waitlist" },
    { href: "/admin/ops", label: "Ops" },
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto py-8 space-y-6">
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
              <ShieldAlert className="w-6 h-6 text-amber-500" />
              Operations & Diagnostics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Kill switch, live activity, error log, cache purge.</p>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void logout()}>
            Lock
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Kill switch */}
        <Card className="border-border/40 bg-card/40">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-500" /> Maintenance Mode
                </div>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  When ON, all public API requests receive a clean 503 maintenance response. Admin routes stay reachable so you can turn it back off.
                </p>
              </div>
              <Button
                variant={maintenanceOn ? "destructive" : "outline"}
                disabled={maintenanceOn === null || maintenanceBusy}
                onClick={() => void toggleMaintenance()}
                className="gap-1.5 min-w-[140px]"
              >
                {maintenanceBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {maintenanceOn === null ? "Loading…" : maintenanceOn ? "Turn OFF" : "Turn ON"}
              </Button>
            </div>
            {maintenanceOn !== null && (
              <div className="mt-3">
                <Badge variant="outline" className={maintenanceOn ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}>
                  {maintenanceOn ? "MAINTENANCE MODE ACTIVE" : "Live — serving normally"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integrity check */}
        <Card className="border-border/40 bg-card/40">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">System Integrity Check</div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void runIntegrityCheck()} disabled={integrityLoading}>
                {integrityLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Re-check
              </Button>
            </div>
            {integrity ? (
              <div className="flex flex-wrap gap-2 items-center">
                <StatusPill ok={integrity.gcpServiceAccountConfigured} label="Google Cloud service account" />
                <StatusPill ok={integrity.demucsUrlConfigured ? integrity.demucsReachable : null} label="Cloud Run Demucs" />
                <span className="text-xs text-muted-foreground ml-1">checked {fmt(integrity.checkedAt)}</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Running check…</div>
            )}
          </CardContent>
        </Card>

        {/* Cache purge */}
        <Card className="border-border/40 bg-card/40">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-amber-500" /> Cache Purge / Server Reset
                </div>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  Deletes this app's own temporary audio processing files from disk. Does not touch the database.
                </p>
              </div>
              <Button variant="outline" className="gap-1.5" onClick={() => void purgeCache()} disabled={purgeBusy}>
                {purgeBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Purge Now
              </Button>
            </div>
            {purgeResult && (
              <div className="mt-3 text-sm text-emerald-400">
                Deleted {purgeResult.filesDeleted} file(s), freed {(purgeResult.bytesFreed / (1024 * 1024)).toFixed(2)} MB.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live activity monitor */}
        <Card className="border-border/40 bg-card/40">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Live Activity Monitor
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void loadSessions()} disabled={sessionsLoading}>
                {sessionsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </Button>
            </div>
            {sessions.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No active sessions in the last 5 minutes.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border/30">
                      <th className="py-2 pr-4">Session</th>
                      <th className="py-2 pr-4">Tool</th>
                      <th className="py-2 pr-4">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.sessionId} className="border-b border-border/20">
                        <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{s.sessionId.slice(0, 12)}…</td>
                        <td className="py-2 pr-4">{s.tool}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{fmt(s.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Error log */}
        <Card className="border-border/40 bg-card/40">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pinpoint Error Log</div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void loadErrors()} disabled={errorsLoading}>
                {errorsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </Button>
            </div>
            {errors.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No tool errors recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border/30">
                      <th className="py-2 pr-4">Timestamp</th>
                      <th className="py-2 pr-4">Tool</th>
                      <th className="py-2 pr-4">Stage</th>
                      <th className="py-2 pr-4">Raw Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((e) => (
                      <tr key={e.id} className="border-b border-border/20 align-top">
                        <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{fmt(e.createdAt)}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{e.toolName}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20">{e.stage}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground max-w-md truncate" title={e.message}>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

export default function AdminOps() {
  return (
    <AdminGate title="Admin Operations" description="Enter your admin key to access operational controls.">
      <OpsDashboard />
    </AdminGate>
  );
}
