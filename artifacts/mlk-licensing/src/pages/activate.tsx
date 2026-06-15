import { Layout } from "@/components/layout";
import { useState } from "react";
import { useActivateMlkLicense, getGetMlkLicenseStatusQueryKey, getGetMlkDashboardQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function Activate() {
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const { mutate: activate, isPending } = useActivateMlkLicense();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key || !email) return;

    activate({
      data: {
        licenseKey: key,
        email: email
      }
    }, {
      onSuccess: () => {
        toast({
          title: "License Activated",
          description: "Your session has been securely authenticated.",
        });
        queryClient.invalidateQueries({ queryKey: getGetMlkLicenseStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMlkDashboardQueryKey() });
        setLocation("/dashboard");
      },
      onError: (err: any) => {
        toast({
          title: "Activation Failed",
          description: err.message || "Invalid key or email combination. Access denied.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto py-20">
        <div className="border bg-card p-8 shadow-xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
          </div>
          <h1 className="text-2xl font-bold uppercase text-center mb-2">System Authentication</h1>
          <p className="text-muted-foreground text-center text-sm mb-8">
            Enter your enterprise license key to unlock the kernel and dashboard telemetry.
          </p>

          <form onSubmit={handleActivate} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="email" className="font-mono text-xs uppercase text-muted-foreground">Corporate Email</label>
              <input
                id="email"
                type="email"
                required
                className="flex h-12 w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono rounded-none"
                placeholder="admin@hpc-corp.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="key" className="font-mono text-xs uppercase text-muted-foreground">License Key</label>
              <input
                id="key"
                type="text"
                required
                className="flex h-12 w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono rounded-none uppercase tracking-widest"
                placeholder="MLK-XXXX-XXXX-XXXX"
                value={key}
                onChange={e => setKey(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full h-12 bg-primary text-primary-foreground font-bold uppercase tracking-wider hover:bg-primary/90 transition-colors flex items-center justify-center disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <KeyRound className="w-5 h-5 mr-2" />
              )}
              {isPending ? "Verifying..." : "Authenticate"}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t text-center text-xs text-muted-foreground font-mono">
            Unlicensed instances run in degraded mode. <br />
            <a href="/pricing" className="underline text-primary hover:text-primary/80">Request an evaluation key</a>.
          </div>
        </div>
      </div>
    </Layout>
  );
}
