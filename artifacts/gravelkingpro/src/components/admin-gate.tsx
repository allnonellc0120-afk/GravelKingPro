import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";

// ── Context ───────────────────────────────────────────────────────────────────

interface AdminAuthCtx {
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthCtx | null>(null);

export function useAdminAuth(): AdminAuthCtx {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside <AdminGate>");
  return ctx;
}

// ── Gate component ────────────────────────────────────────────────────────────

type AuthState = "checking" | "locked" | "unlocked";

interface AdminGateProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

export function AdminGate({
  children,
  title = "Admin Area",
  description = "Enter your admin key to continue.",
}: AdminGateProps) {
  const [status, setStatus] = useState<AuthState>("checking");
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Check for an existing valid session on mount.
  useEffect(() => {
    fetch("/api/admin/check", { credentials: "include" })
      .then((r) => setStatus(r.ok ? "unlocked" : "locked"))
      .catch(() => setStatus("locked"));
  }, []);

  const handleLogin = useCallback(async () => {
    const k = keyInput.trim();
    if (!k) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: k }),
      });
      if (res.ok) {
        setStatus("unlocked");
        setKeyInput("");
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Invalid key.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }, [keyInput]);

  const logout = useCallback(async () => {
    await fetch("/api/admin/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    setStatus("locked");
    setKeyInput("");
    setError(null);
  }, []);

  // ── Checking ───────────────────────────────────────────────────────────────
  if (status === "checking") {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  // ── Locked ─────────────────────────────────────────────────────────────────
  if (status === "locked") {
    return (
      <Layout>
        <div className="max-w-md mx-auto py-24 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-secondary/40 border border-border/40 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">{title}</h2>
            <p className="text-muted-foreground text-sm">{description}</p>
          </div>
          <div className="flex flex-col gap-3">
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleLogin(); }}
              placeholder="Admin key"
              autoFocus
              className="w-full px-4 py-2.5 rounded-md bg-secondary/40 border border-border/40 text-sm focus:outline-none focus:border-amber-500/60"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button
              onClick={() => void handleLogin()}
              disabled={submitting || !keyInput.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Unlock Dashboard
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Unlocked ───────────────────────────────────────────────────────────────
  return (
    <AdminAuthContext.Provider value={{ logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}
