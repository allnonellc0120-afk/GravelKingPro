import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, Loader2 } from "lucide-react";

const FLAG = "gkp_email_captured";

/**
 * Free-tool email gate. Visitors must leave an email before using the free
 * tools; the server independently enforces this on the mastering route
 * (403 EMAIL_REQUIRED), at which point `forceGate()` re-shows the gate.
 */
export function useEmailGate() {
  const [gated, setGated] = useState<boolean>(() => {
    try { return localStorage.getItem(FLAG) !== "1"; } catch { return false; }
  });

  useEffect(() => {
    fetch("/api/email-capture/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { hasEmail: false }))
      .then((d: { hasEmail?: boolean }) => {
        if (d.hasEmail) {
          try { localStorage.setItem(FLAG, "1"); } catch { /* ignore */ }
          setGated(false);
        } else {
          try { localStorage.removeItem(FLAG); } catch { /* ignore */ }
          setGated(true);
        }
      })
      .catch(() => { /* keep the local decision on network errors */ });
  }, []);

  const unlock = useCallback(() => {
    try { localStorage.setItem(FLAG, "1"); } catch { /* ignore */ }
    setGated(false);
  }, []);

  const forceGate = useCallback(() => {
    try { localStorage.removeItem(FLAG); } catch { /* ignore */ }
    setGated(true);
  }, []);

  return { gated, unlock, forceGate };
}

export function EmailGate({ tool, onUnlocked }: { tool: string; onUnlocked: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const resp = await fetch("/api/email-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, source: tool }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) throw new Error(data.error ?? "Something went wrong — try again.");
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-20">
      <form
        onSubmit={submit}
        className="rounded-2xl border border-amber-500/30 bg-card/40 p-8 space-y-5 text-center"
      >
        <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto">
          <Mail className="w-6 h-6 text-amber-500" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold">Unlock the free tools</h2>
          <p className="text-sm text-muted-foreground">
            Drop your email once and every free tool is yours — mastering, karaoke, vocal booth preview.
          </p>
        </div>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full bg-secondary/40 border border-border/40 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-amber-500/60 transition-colors"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          disabled={busy || !email.trim()}
          className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
        </Button>
        <p className="text-[10px] text-muted-foreground/70">
          No spam — occasional product updates from GravelKing Pro only.
        </p>
      </form>
    </div>
  );
}
