import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Loader2, Lock, Mail, RefreshCw, AlertTriangle } from "lucide-react";

const KEY_STORAGE = "gkp_admin_key";

interface WaitlistEntry {
  id: number;
  email: string;
  createdAt: string;
}

interface WaitlistData {
  total: number;
  entries: WaitlistEntry[];
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

export default function AdminWaitlist() {
  const [adminKey, setAdminKey] = useState<string>(
    () => sessionStorage.getItem(KEY_STORAGE) ?? "",
  );
  const [keyInput, setKeyInput] = useState("");
  const [data, setData] = useState<WaitlistData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async (key: string) => {
    if (!key) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist/admin", {
        headers: { "x-admin-key": key },
        credentials: "include",
      });
      if (res.status === 403) {
        sessionStorage.removeItem(KEY_STORAGE);
        setAdminKey("");
        setData(null);
        setError("Invalid admin key.");
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
  }, []);

  useEffect(() => {
    if (adminKey) void load(adminKey);
  }, [adminKey, load]);

  const handleUnlock = () => {
    const k = keyInput.trim();
    if (!k) return;
    sessionStorage.setItem(KEY_STORAGE, k);
    setAdminKey(k);
  };

  const handleLock = () => {
    sessionStorage.removeItem(KEY_STORAGE);
    setAdminKey("");
    setData(null);
    setKeyInput("");
  };

  const handleExportCsv = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/waitlist/admin?format=csv", {
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "waitlist.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setDownloading(false);
    }
  };

  if (!adminKey) {
    return (
      <Layout>
        <div className="max-w-md mx-auto py-24 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-secondary/40 border border-border/40 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">Waitlist Dashboard</h2>
            <p className="text-muted-foreground text-sm">
              Enter your admin key to view signups.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUnlock();
              }}
              placeholder="Admin key"
              className="w-full px-4 py-2.5 rounded-md bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:border-amber-500/60"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button
              onClick={handleUnlock}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              Unlock Dashboard
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => load(adminKey)}
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
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={handleLock}
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
                  <div className="text-4xl font-bold text-amber-500">
                    {data.total.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {data.total === 1 ? "person" : "people"} on the waitlist
                  </div>
                </div>
              </CardContent>
            </Card>

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
                          <th className="text-left text-xs text-muted-foreground font-medium py-2 pr-4 w-12">
                            #
                          </th>
                          <th className="text-left text-xs text-muted-foreground font-medium py-2 pr-4">
                            Email
                          </th>
                          <th className="text-left text-xs text-muted-foreground font-medium py-2">
                            Signed up
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.entries.map((entry, i) => (
                          <tr
                            key={entry.id}
                            className="border-b border-border/20 last:border-0 hover:bg-secondary/20 transition-colors"
                          >
                            <td className="py-2.5 pr-4 text-muted-foreground tabular-nums">
                              {i + 1}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-xs text-foreground/90">
                              {entry.email}
                            </td>
                            <td className="py-2.5 text-muted-foreground text-xs whitespace-nowrap">
                              {fmt(entry.createdAt)}
                            </td>
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
