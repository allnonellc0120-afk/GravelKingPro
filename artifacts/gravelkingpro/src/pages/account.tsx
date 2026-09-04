import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAppState } from "@/lib/context";
import { useClerk, useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  User, CreditCard, Crown, Zap, Scissors, ShieldCheck,
  LogOut, ExternalLink, Loader2, Check, Lock,
} from "lucide-react";
import { motion } from "framer-motion";

const TIER_META = {
  null: {
    label: "Starter",
    color: "text-muted-foreground",
    border: "border-border/40",
    icon: <Zap className="w-4 h-4 text-muted-foreground" />,
    description: "Free plan — limited access",
  },
  weekly: {
    label: "GravelKing Weekly",
    color: "text-emerald-400",
    border: "border-emerald-500/30",
    icon: <Scissors className="w-4 h-4 text-emerald-400" />,
    description: "Full MLK v3 mastering suite + Vocal Booth + WAV exports",
  },
  monthly: {
    label: "GravelKing Studio",
    color: "text-amber-500",
    border: "border-amber-500/30",
    icon: <Crown className="w-4 h-4 text-amber-500" />,
    description: "Adjustable mastering kernel + live DAW unlocked",
  },
  node_auditor: {
    label: "Node Auditor",
    color: "text-violet-400",
    border: "border-violet-500/30",
    icon: <ShieldCheck className="w-4 h-4 text-violet-400" />,
    description: "Enterprise benchmarking + dedicated support",
  },
  developer: {
    label: "Developer",
    color: "text-sky-400",
    border: "border-sky-500/30",
    icon: <ShieldCheck className="w-4 h-4 text-sky-400" />,
    description: "Full admin access + all tools",
  },
} as const;

const TIER_FEATURES: Record<string, string[]> = {
  null:         ["Mastering 30s preview", "Vocal Booth access", "Songwriting Studio (basic)", "Live vocal monitoring"],
  weekly:       ["Everything in Starter", "Full MLK v3 mastering suite", "Unlimited WAV exports", "IP Embed Code + authorship cert", "Vocal Booth + karaoke DAW"],
  monthly:      ["Everything in Weekly", "Adjustable mastering kernel", "Live DAW + recording", "Waveform + plugin chain", "PDF reports"],
  node_auditor: ["Everything in Studio", "Enterprise benchmarking", "Custom reports", "SLA guarantee", "Dedicated support"],
  developer:    ["Everything in Node Auditor", "Admin dashboard access", "Analytics & waitlist", "Full admin controls", "Developer tools"],
};

export default function Account() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { tier, isDeveloper, activePromo } = useAppState();
  const [portalLoading, setPortalLoading] = useState(false);

  const tierKey = (isDeveloper ? "developer" : tier) ?? "null";
  const meta = TIER_META[tierKey as keyof typeof TIER_META] ?? TIER_META["null"];
  const features = TIER_FEATURES[tierKey] ?? TIER_FEATURES["null"];

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
      });
      const { url, error } = await res.json() as { url?: string; error?: string };
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch {
      alert("Could not open billing portal. Make sure you have an active subscription.");
    } finally {
      setPortalLoading(false);
    }
  };

  if (!isLoaded) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="max-w-md mx-auto py-24 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-secondary/40 border border-border/40 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold mb-2">Sign in to view your account</h2>
            <p className="text-muted-foreground text-sm">Create an account or sign in to track your subscription, manage billing, and access all your tools.</p>
          </div>
          <a href="/sign-in">
            <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold px-8">
              Sign In
            </Button>
          </a>
        </div>
      </Layout>
    );
  }

  const email = user.primaryEmailAddress?.emailAddress;
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || email || "User";
  const initials = [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "U";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-10 space-y-6">

        {/* Profile card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-border/40 bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              {user.imageUrl ? (
                <img src={user.imageUrl} alt={displayName} className="w-14 h-14 rounded-full object-cover border border-border/40" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold text-lg">
                  {initials}
                </div>
              )}
              <div>
                <p className="font-semibold text-base">{displayName}</p>
                {email && <p className="text-sm text-muted-foreground mt-0.5">{email}</p>}
                <p className="text-xs text-muted-foreground mt-1 font-mono opacity-60">{user.externalId ?? user.id}</p>
              </div>
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={() => void signOut({ redirectUrl: import.meta.env.BASE_URL })}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Subscription card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <Card className={`border bg-card/40 ${meta.border}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                Subscription
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current tier */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 border border-border/30">
                {meta.icon}
                <div className="flex-1">
                  <p className={`font-semibold text-sm ${meta.color}`}>{meta.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                </div>
                {activePromo && (
                  <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-500 px-2">
                    Promo
                  </Badge>
                )}
              </div>

              {/* Feature list */}
              <ul className="space-y-2">
                {features.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                {tier !== null && !activePromo ? (
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                  >
                    {portalLoading
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Opening…</>
                      : <><ExternalLink className="w-4 h-4" />Manage Billing</>}
                  </Button>
                ) : null}
                {tier === null && (
                  <Link href="/pricing" className="flex-1">
                    <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2">
                      <Crown className="w-4 h-4" />
                      Upgrade Plan
                    </Button>
                  </Link>
                )}
                {tier === "weekly" && (
                  <Link href="/pricing" className="flex-1">
                    <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-2">
                      <Crown className="w-4 h-4" />
                      Upgrade to Studio
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick links */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card className="border-border/40 bg-card/20">
            <CardContent className="pt-5 grid grid-cols-2 gap-2">
              {[
                { href: "/mastering", label: "The Foundry" },
                { href: "/vocal-booth", label: "Vocal Booth" },
                { href: "/pricing", label: "View Plans" },
              ].map(({ href, label }) => (
                <Link key={href} href={href}>
                  <Button variant="outline" className="w-full text-sm justify-start gap-2 border-border/30">
                    {label}
                  </Button>
                </Link>
              ))}
            </CardContent>
          </Card>
        </motion.div>

      </div>
    </Layout>
  );
}
