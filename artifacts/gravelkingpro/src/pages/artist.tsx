import { useEffect, useMemo, useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { CreditCard, Loader2, LogOut, Save, UserRound } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppState } from "@/lib/context";

type ArtistProfileData = {
  artistName: string;
  hometown: string;
  bio: string;
  avatarUrl: string | null;
};

function artistId(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 1_000_000;
  }
  return `#GK-${String(Math.abs(hash)).padStart(6, "0")}`;
}

function passLabel(tier: string | null, isDeveloper: boolean): string {
  if (isDeveloper) return "Studio Pass · Owner";
  if (tier === "monthly") return "Studio Pass · Active";
  if (tier === "weekly") return "Pro Pass · Active";
  if (tier === "node_auditor") return "Studio Pass · Auditor";
  return "No active pass";
}

export default function ArtistPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const { tier, isDeveloper } = useAppState();
  const [profile, setProfile] = useState<ArtistProfileData>({
    artistName: "",
    hometown: "",
    bio: "",
    avatarUrl: null,
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [billing, setBilling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetch("/api/user/profile", { credentials: "include" })
      .then((response) => response.ok ? response.json() as Promise<{ profile?: ArtistProfileData }> : null)
      .then((data) => {
        if (active && data?.profile) setProfile(data.profile);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [user]);

  const id = useMemo(() => artistId(user?.id ?? "guest"), [user?.id]);
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ")
    || user?.primaryEmailAddress?.emailAddress
    || "Artist";
  const initials = (profile.artistName || displayName)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hasPass = Boolean(tier || isDeveloper);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      const [firstName, ...lastNameParts] = displayName.trim().split(/\s+/);
      await user.update({ firstName: firstName || "", lastName: lastNameParts.join(" ") });
      const response = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(profile),
      });
      if (!response.ok) throw new Error("Profile could not be saved.");
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const manageBilling = async () => {
    setBilling(true);
    setError("");
    try {
      const response = await fetch("/api/stripe/portal", { method: "POST", credentials: "include" });
      const data = await response.json() as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Billing portal unavailable.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Billing portal unavailable.");
    } finally {
      setBilling(false);
    }
  };

  if (!isLoaded) {
    return <Layout><div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-amber-300" /></div></Layout>;
  }

  if (!user) {
    return (
      <Layout>
        <section className="mx-auto max-w-md py-24 text-center">
          <UserRound className="mx-auto h-8 w-8 text-amber-300" />
          <h1 className="mt-5 text-2xl font-bold text-zinc-100">Artist profile</h1>
          <p className="mt-2 text-sm text-zinc-500">Sign in to view your profile and Studio Pass.</p>
          <Link href="/sign-in"><Button className="mt-6 bg-amber-400 text-zinc-950 hover:bg-amber-300">Sign in</Button></Link>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="mx-auto max-w-3xl space-y-5 pb-24 pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-amber-300/80">Artist console</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-100">Artist profile</h1>
          </div>
          <span className="font-mono text-sm tracking-[0.18em] text-amber-200">{id}</span>
        </div>

        {user.primaryEmailAddress?.emailAddress?.trim().toLowerCase() === "allnonellc0120@gmail.com" && (
          <Card className="studio-card border-amber-400/30 bg-black/20">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <h2 className="font-semibold text-zinc-100">Owner administration</h2>
                <p className="mt-1 text-sm text-zinc-400">Audio, accounts, label and automation controls.</p>
              </div>
              <Link href="/admin/control" className="inline-flex min-h-11 items-center rounded-lg bg-amber-400 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-300">
                Open Admin Control
              </Link>
            </CardContent>
          </Card>
        )}

        <Card className="studio-card border-white/10 bg-black/20">
          <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-2xl font-black text-amber-200">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full rounded-2xl object-cover" /> : initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold text-zinc-100">{profile.artistName || displayName}</p>
              <p className="mt-1 text-sm text-zinc-500">{user.primaryEmailAddress?.emailAddress}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-amber-400/30 text-amber-200">{id}</Badge>
                {profile.hometown && <Badge variant="outline" className="border-white/15 text-zinc-400">{profile.hometown}</Badge>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing((value) => !value)}>
                {editing ? "Close" : "Edit"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => void signOut({ redirectUrl: import.meta.env.BASE_URL })} aria-label="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
          {editing && (
            <CardContent className="grid gap-3 border-t border-white/10 p-5 sm:grid-cols-2">
              <label className="text-xs text-zinc-500">Artist name<input value={profile.artistName} onChange={(event) => setProfile((current) => ({ ...current, artistName: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100" /></label>
              <label className="text-xs text-zinc-500">Hometown<input value={profile.hometown} onChange={(event) => setProfile((current) => ({ ...current, hometown: event.target.value }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100" /></label>
              <label className="text-xs text-zinc-500 sm:col-span-2">Bio<textarea value={profile.bio} onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value.slice(0, 4000) }))} rows={3} className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100" /></label>
              <div className="sm:col-span-2"><Button type="button" size="sm" onClick={() => void saveProfile()} disabled={saving} className="bg-amber-400 text-zinc-950 hover:bg-amber-300"><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save profile"}</Button></div>
            </CardContent>
          )}
        </Card>

        <Card className="studio-card border-amber-400/20 bg-black/20">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base text-zinc-100"><CreditCard className="h-4 w-4 text-amber-300" />Studio Pass</CardTitle>
            <Badge variant="outline" className={hasPass ? "border-emerald-400/30 text-emerald-300" : "border-white/15 text-zinc-500"}>{passLabel(tier, isDeveloper)}</Badge>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-300">{hasPass ? "Billing is active for this artist." : "Choose a pass to unlock the full studio."}</p>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600">Account · {id}</p>
            </div>
            <div className="flex gap-2">
              {hasPass && <Button type="button" size="sm" variant="outline" onClick={() => void manageBilling()} disabled={billing}>{billing ? "Opening…" : "Manage billing"}</Button>}
              <Link href="/pricing"><Button type="button" size="sm" className="bg-amber-400 text-zinc-950 hover:bg-amber-300">{hasPass ? "Change pass" : "View passes"}</Button></Link>
            </div>
          </CardContent>
        </Card>

        {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">{error}</p>}
      </main>
    </Layout>
  );
}