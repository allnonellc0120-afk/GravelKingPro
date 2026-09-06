import { FormEvent, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";

export default function DemoLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("play-reviewer@gravelkingpro.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/demo/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Sign-in failed.");
      }
      navigate("/");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto py-16 px-4">
        <Card className="border-amber-500/30 bg-card/60">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <LockKeyhole className="w-5 h-5 text-amber-400" />
            </div>
            <CardTitle>Reviewer demo sign-in</CardTitle>
            <CardDescription>
              Full customer access for evaluating GravelKing Pro. Admin tools remain restricted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="username"
                  className="mt-1 w-full rounded-md border border-border/50 bg-secondary/30 px-3 py-2.5"
                  required
                />
              </label>
              <label className="block text-sm">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  className="mt-1 w-full rounded-md border border-border/50 bg-secondary/30 px-3 py-2.5"
                  required
                />
              </label>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Sign in to demo
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}