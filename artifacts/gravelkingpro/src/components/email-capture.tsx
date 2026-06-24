import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function EmailCapture({ source }: { source: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setState("loading");
    try {
      const res = await fetch("/api/capture-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (res.ok) setState("done");
      else setState("idle");
    } catch {
      setState("idle");
    }
  };

  return (
    <AnimatePresence mode="wait">
      {state === "done" ? (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-emerald-400"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>You're on the list — we'll notify you when you upgrade.</span>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="flex flex-col gap-2 p-4 rounded-lg border border-amber-500/20 bg-amber-500/5"
        >
          <p className="text-sm text-amber-400 font-medium">
            Want high-quality WAV output?
          </p>
          <p className="text-xs text-muted-foreground">
            Leave your email and we'll send you a reminder to upgrade + a 20% discount code.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 px-3 py-2 rounded-md bg-background/60 border border-amber-500/20 text-sm focus:outline-none focus:border-amber-500/40"
            />
            <Button
              type="submit"
              size="sm"
              disabled={state === "loading" || !email.trim()}
              className="bg-amber-500 hover:bg-amber-600 text-black font-semibold shrink-0"
            >
              {state === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
            </Button>
          </div>
        </motion.form>
      )}
    </AnimatePresence>
  );
}
