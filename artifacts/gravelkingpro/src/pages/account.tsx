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
  LogOut, ExternalLink, Loader2, Check, Lock, Trash2,
} from "lucide-react";
import { motion } from "framer-motion";

const TIER_META = {
  null: {
    label: "Free",
    color: "text-muted-foreground",
    border: "border-border/40",
    icon: <Zap className="w-4 h-4 text-muted-foreground" />,
    description: "Free plan — limited access",
  },
  weekly: {
    label: "Pro",
    color: "text-emerald-400",
    border: "border-emerald-500/30",
    icon: <Scissors className="w-4 h-4 text-emerald-400" />,
    description: "Full MLK v3 mastering suite + Vocal Booth + WAV exports",
  },
  monthly: {
    label: "King",
    color: "text-amber-500",
    border: "border-amber-500/30",
    icon: <Crown className="w-4 h-4 text-amber-500" />,
    description: "Advanced JAX, Vocal Booth, Foundry, and Converter access",
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
  null:         ["JAX songwriting companion", "Vocal Booth access", "The Foundry 30s preview", "Converter access"],
  weekly:       ["Everything in Free", "JAX provenance certificates", "Vocal Booth recording and editing", "Full Foundry WAV exports", "Audio format conversion"],
  monthly:      ["Everything in Pro", "Advanced Foundry controls", "Vocal Booth clip, splice, and layer tools", "JAX creative timeline", "PDF reports"],
  node_auditor: ["Everything in King", "Enterprise benchmarking", "Custom reports", "SLA guarantee", "Dedicated support"],
  developer:    ["Everything in Node Auditor", "Admin dashboard access", "Analytics & waitlist", "Full admin controls", "Developer tools"],
};

export default function Account() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { tier, isDeveloper, activePromo } = useAppState();
  const [portalLoading, setPortalLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);

  useEffect(() => {
    if (user) setProfileName([user.firstName, user.lastName].filter(Boolean).join(" "));
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setProfileSaving(true);
    try {
      const [firstName, ...rest] = profileName.trim().split(/\s+/);
      await user.update({ firstName: firstName || "", lastName: rest.join(" ") || "" });
      setProfileEditing(false);
    } finally { setProfileSaving(false); }
  };

  const changeAvatar = async (file: File) => {
    if (!user) return;
    setAvatarSaving(true);
    try {
      await user.setProfileImage({ file });
    } finally {
      setAvatarSaving(false);
    }
  };

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
              <label className="relative group shrink-0 cursor-pointer" title="Change profile picture">
                {user.imageUrl ? (
                  <img src={user.imageUrl} alt={displayName} className="w-14 h-14 rounded-full object-cover border border-border/40" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 font-bold text-lg">
                    {initials}
                  </div>
                )}
                <span className="absolute inset-0 rounded-full bg-black/60 text-[9px] text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {avatarSaving ? "Saving…" : "Change"}
                </span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={avatarSaving} onChange={(e) => { const file = e.target.files?.[0]; if (file) void changeAvatar(file); e.currentTarget.value = ""; }} />
              </label>
              <div className="flex-1">
                <p className="font-semibold text-base">{displayName}</p>
                {email && <p className="text-sm text-muted-foreground mt-0.5">{email}</p>}
                <p className="text-xs text-muted-foreground mt-1 font-mono opacity-60">{user.externalId ?? user.id}</p>
                {profileEditing && (
                  <div className="mt-3 space-y-2">
                    <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Display name" className="w-full rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm" />
                    <textarea value={profileBio} onChange={(e) => setProfileBio(e.target.value)} placeholder="Short artist bio (optional)" className="w-full rounded-md border border-border/50 bg-background/50 px-3 py-2 text-sm min-h-20" />
                    <div className="flex gap-2"><Button size="sm" onClick={() => void saveProfile()} disabled={profileSaving}>{profileSaving ? "Saving…" : "Save profile"}</Button><Button size="sm" variant="ghost" onClick={() => setProfileEditing(false)}>Cancel</Button></div>
                  </div>
                )}
              </div>
              <div className="ml-auto">
                <Button variant="outline" size="sm" className="text-xs mr-2" onClick={() => setProfileEditing((v) => !v)}>
                  Edit profile
                </Button>
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
                      Upgrade to King
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Privacy and account deletion */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-400" />
                Account and data deletion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Request deletion of your GravelKing Pro account and associated personal data.
                The deletion page explains what is removed, what may need to be retained, and how long the request takes.
              </p>
              <Link href="/data-deletion">
                <Button variant="outline" className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Request account deletion
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick links */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
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
