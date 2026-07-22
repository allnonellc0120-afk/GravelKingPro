import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { X, Building2, User, Mail, Briefcase, CheckCircle2, Loader2, Key, Send } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const ROLES = ["A&R", "Publisher", "Producer", "Platform Developer", "Other"] as const;

interface LeadCaptureModalProps {
  open: boolean;
  onClose: () => void;
  /** Optional pre-fill from a prior verify session */
  verificationActivity?: Record<string, unknown>;
}

interface FormState {
  name: string;
  email: string;
  organization: string;
  role: string;
}

type Stage = "form" | "sending" | "success" | "error";

export function LeadCaptureModal({ open, onClose, verificationActivity }: LeadCaptureModalProps) {
  const [form, setForm] = useState<FormState>({ name: "", email: "", organization: "", role: "" });
  const [stage, setStage] = useState<Stage>("form");
  const [demoKey, setDemoKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  function update(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.organization.trim() || !form.role) return;

    setStage("sending");
    setErrorMsg("");

    try {
      const res = await fetch(`${BASE}/api/v1/lead-capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, verification_activity: verificationActivity }),
      });
      const data = await res.json() as { success?: boolean; demoApiKey?: string; error?: string; errors?: string[] };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? data.errors?.join("; ") ?? "Submission failed");
      }

      setDemoKey(data.demoApiKey ?? null);
      setStage("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Submission failed. Please try again.");
      setStage("error");
    }
  }

  function reset() {
    setStage("form");
    setErrorMsg("");
    setForm({ name: "", email: "", organization: "", role: "" });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-full max-w-md bg-card border border-border/60 rounded-xl shadow-2xl relative"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-6">
              {stage === "success" ? (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-4 py-4">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold">Brief Sent</h3>
                  <p className="text-sm text-muted-foreground">
                    Check your inbox for the GravelKing Pro Technical Brief PDF and your demo API key.
                  </p>
                  {demoKey && (
                    <div className="bg-muted/30 border border-border/50 rounded-lg p-4 text-left">
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Key className="w-3 h-3" /> 7-Day Demo API Key
                      </p>
                      <code className="text-xs font-mono text-amber-400 break-all">{demoKey}</code>
                    </div>
                  )}
                  <Button onClick={onClose} className="bg-amber-500 hover:bg-amber-600 text-black font-semibold w-full">
                    Continue
                  </Button>
                </motion.div>
              ) : (
                <>
                  <div className="mb-5">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-amber-400" />
                      Request Enterprise Demo
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Get the GravelKing Pro MLK V3.5 Technical Brief PDF + a 7-day demo API key sent to your inbox.
                    </p>
                  </div>

                  <form onSubmit={submit} className="space-y-4">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                        <User className="w-3 h-3" /> Name
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={e => update("name", e.target.value)}
                        placeholder="Your full name"
                        required
                        className="w-full bg-muted/30 border border-border/60 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                        <Mail className="w-3 h-3" /> Work Email
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={e => update("email", e.target.value)}
                        placeholder="you@label.com"
                        required
                        className="w-full bg-muted/30 border border-border/60 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                        <Building2 className="w-3 h-3" /> Organization
                      </label>
                      <input
                        type="text"
                        value={form.organization}
                        onChange={e => update("organization", e.target.value)}
                        placeholder="Label, studio, or platform"
                        required
                        className="w-full bg-muted/30 border border-border/60 rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1.5">
                        <Briefcase className="w-3 h-3" /> Role
                      </label>
                      <select
                        value={form.role}
                        onChange={e => update("role", e.target.value)}
                        required
                        className="w-full bg-muted/30 border border-border/60 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                      >
                        <option value="">Select your role…</option>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    {stage === "error" && (
                      <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        {errorMsg}
                      </p>
                    )}

                    <div className="flex gap-3 pt-1">
                      {stage === "error" && (
                        <Button type="button" variant="outline" onClick={reset} className="flex-1">
                          Try Again
                        </Button>
                      )}
                      <Button
                        type="submit"
                        disabled={stage === "sending"}
                        className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold"
                      >
                        {stage === "sending" ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
                        ) : (
                          <><Send className="w-4 h-4 mr-2" /> Get the Brief</>
                        )}
                      </Button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
