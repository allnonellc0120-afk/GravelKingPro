import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Zap, Menu, X, User, LogIn, Crown, ArrowRight, ChevronDown, BookOpen, Gavel, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAppState } from "@/lib/context";
import { useUser } from "@clerk/react";

const TIER_LABEL: Record<string, { label: string; className: string }> = {
  weekly:       { label: "Weekly",       className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  monthly:      { label: "Pro",          className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  node_auditor: { label: "Node Auditor", className: "bg-amber-500/20 text-amber-300 border-amber-400/40" },
};

export function Layout({
  children,
  noPadding,
  hideChrome = false,
}: {
  children: ReactNode;
  noPadding?: boolean;
  hideChrome?: boolean;
}) {
  const [location] = useLocation();
  const { isPro, isDeveloper, tier } = useAppState();
  const { user } = useUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const tierInfo = tier ? TIER_LABEL[tier] : null;
  const showUpgradeNudge = !tier || tier === "weekly";

  // Nav sign-in carries the pricing destination explicitly so the Clerk widget
  // honours it (redirect_url takes priority over the app-level fallback, and
  // plan-specific redirects set by the pricing page keep working unchanged).
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(`${base}/pricing?plan=monthly`)}`;

  const links = [
    { href: "/mastering", label: "Mastering" },
    { href: "/vocal-booth", label: "Vocal Booth" },
    { href: "/songwriting", label: "Lyrics Generator", icon: Sparkles },
    { href: "/convert", label: "Converter" },
    { href: "/label", label: "Label" },
    { href: "/pricing", label: "Pricing" },
    ...(isPro ? [{ href: "/kernel", label: "Kernel" }] : []),
    ...(isDeveloper ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  const email = user?.primaryEmailAddress?.emailAddress;
  const displayName = user
    ? ([user.firstName, user.lastName].filter(Boolean).join(" ") || email || "Account")
    : null;
  const initials = user
    ? ([user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "U")
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {!hideChrome && <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Zap className="w-6 h-6 text-amber-500" />
            <span className="font-bold text-base tracking-tight uppercase hidden sm:block">GravelKing Productions</span>
            <span className="font-bold text-base tracking-tight uppercase sm:hidden">GKP</span>
          </Link>

          {/* Desktop nav — shown only at lg (1024 px+); tablets get the hamburger */}
          <nav className="hidden lg:flex items-center gap-5">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-amber-500 ${
                  location === link.href ? "text-amber-500" : "text-muted-foreground"
                }`}
                data-testid={`link-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {link.label}
              </Link>
            ))}
            <div className="relative">
              <button
                type="button"
                onClick={() => setHelpOpen((open) => !open)}
                className={`flex items-center gap-1 text-sm font-medium transition-colors hover:text-amber-500 ${location.startsWith("/help") ? "text-amber-500" : "text-muted-foreground"}`}
                aria-expanded={helpOpen}
              >
                Help <ChevronDown className={`h-3.5 w-3.5 transition-transform ${helpOpen ? "rotate-180" : ""}`} />
              </button>
              {helpOpen && (
                <div className="absolute right-0 top-8 z-30 w-64 rounded-xl border border-border/60 bg-card p-2 shadow-2xl">
                  <Link href="/help" onClick={() => setHelpOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-amber-500/10">
                    <BookOpen className="h-4 w-4 text-amber-400" /><span><strong className="block">Tool guide</strong><small className="text-muted-foreground">Functions and how to use them</small></span>
                  </Link>
                  <Link href="/help/ip-rights" onClick={() => setHelpOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-amber-500/10">
                    <Gavel className="h-4 w-4 text-violet-300" /><span><strong className="block">IP rights</strong><small className="text-muted-foreground">Evidence and legal limits</small></span>
                  </Link>
                  <Link href="/help/user-rules" onClick={() => setHelpOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-amber-500/10">
                    <ShieldAlert className="h-4 w-4 text-rose-300" /><span><strong className="block">User rules</strong><small className="text-muted-foreground">Honest use and account review</small></span>
                  </Link>
                </div>
              )}
            </div>
            <Link
              href="/download"
              className="text-xs font-semibold text-black bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-md transition-colors"
            >
              Download
            </Link>

            {/* Upgrade nudge — only for free/weekly users */}
            {showUpgradeNudge && (
              <Link
                href="/pricing"
                className="flex items-center gap-1 text-xs font-semibold text-amber-400 border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1.5 rounded-md transition-colors"
              >
                <Crown className="w-3 h-3" />
                {!tier ? "Upgrade" : "Go Pro"}
                <ArrowRight className="w-3 h-3 ml-0.5" />
              </Link>
            )}

            {/* User avatar / sign in */}
    {user ? (
              <Link href="/account">
                <div className={`flex items-center gap-2 cursor-pointer group ${location === "/account" ? "opacity-100" : "opacity-80 hover:opacity-100"} transition-opacity`}>
                  {user.imageUrl ? (
                    <img
                      src={user.imageUrl}
                      alt={displayName ?? ""}
                      className="w-8 h-8 rounded-full object-cover border-2 border-border/40 group-hover:border-amber-500/60 transition-colors"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 border-2 border-amber-500/30 group-hover:border-amber-500/60 flex items-center justify-center text-amber-500 font-bold text-xs transition-colors">
                      {initials}
                    </div>
                  )}
                  <div className="hidden lg:flex flex-col items-start">
                    <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
                      {displayName}
                    </span>
                    {tierInfo && (
                      <span className={`text-[9px] font-bold border rounded px-1.5 leading-4 mt-0.5 ${tierInfo.className}`}>
                        {tierInfo.label}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ) : (
              <Link href={signInHref} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-amber-500 transition-colors">
                <LogIn className="w-4 h-4" />
                <span>Sign in</span>
              </Link>
            )}
          </nav>

          {/* Mobile / tablet hamburger */}
          <button
            className="lg:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-border/40 bg-card/95 backdrop-blur-sm">
            <nav className="container mx-auto px-4 py-3 flex flex-col gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`text-sm font-medium px-3 py-2 rounded-md transition-colors hover:bg-secondary/60 ${
                    location === link.href ? "text-amber-500 bg-secondary/40" : "text-muted-foreground"
                  }`}
                >
                  {link.icon && <link.icon className="w-4 h-4 text-amber-500" />}
                  {link.label}
                </Link>
              ))}
              <Link
                href="/help"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md transition-colors hover:bg-secondary/60 ${location.startsWith("/help") ? "text-amber-500 bg-secondary/40" : "text-muted-foreground"}`}
              >
                <BookOpen className="h-4 w-4" /> Help &amp; Rules
              </Link>
              <Link
                href="/download"
                onClick={() => setMobileOpen(false)}
                className="text-sm font-semibold text-black bg-amber-500 hover:bg-amber-600 px-3 py-2 rounded-md transition-colors mt-1"
              >
                Download Free
              </Link>

              {/* Mobile account / sign in */}
              {user ? (
                <Link
                  href="/account"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 text-sm font-medium px-3 py-2 rounded-md transition-colors hover:bg-secondary/60 mt-1 ${
                    location === "/account" ? "text-amber-500 bg-secondary/40" : "text-muted-foreground"
                  }`}
                >
                  {user.imageUrl ? (
                    <img src={user.imageUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-[10px]">
                      {initials}
                    </div>
                  )}
                  <span>My Account</span>
                </Link>
              ) : (
                <Link
                  href={signInHref}
                  className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md transition-colors hover:bg-secondary/60 text-muted-foreground mt-1"
                  onClick={() => setMobileOpen(false)}
                >
                  <LogIn className="w-4 h-4" />
                  Sign in
                </Link>
              )}

              <Link
                href="/contact"
                onClick={() => setMobileOpen(false)}
                className="text-sm text-muted-foreground px-3 py-2 rounded-md hover:bg-secondary/60 transition-colors"
              >
                Contact
              </Link>
            </nav>
          </div>
        )}
      </header>}

      <main className={noPadding ? "flex-1 flex flex-col overflow-hidden" : "flex-1 container mx-auto px-4 py-8"}>
        {children}
      </main>

      {!hideChrome && <footer className="border-t border-border/20 bg-card/30 py-4">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            © {new Date().getFullYear()} GravelKing Productions · All N One LLC
            <span className="ml-2 opacity-40 font-mono">
              v{new Date(__APP_BUILD__).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })}&nbsp;
              {new Date(__APP_BUILD__).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 justify-center sm:justify-end">
            <Link href="/label" className="hover:text-amber-500 transition-colors">Label</Link>
            <Link href="/library" className="hover:text-amber-500 transition-colors">Library</Link>
            <Link href="/protected-lyrics" className="hover:text-amber-500 transition-colors">My Lyrics</Link>
            <Link href="/contact" className="hover:text-amber-500 transition-colors">Contact</Link>
            <Link href="/download" className="hover:text-amber-500 transition-colors">Download</Link>
            <Link href="/pricing" className="hover:text-amber-500 transition-colors">Pricing</Link>
            <Link href="/privacy" className="hover:text-amber-500 transition-colors">Privacy</Link>
            <Link href="/data-deletion" className="hover:text-amber-500 transition-colors">Data deletion</Link>
            <Link href="/account" className="hover:text-amber-500 transition-colors">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />Account
              </span>
            </Link>
            <a href="https://gravelkingpro.com" target="_blank" rel="noopener noreferrer" className="hover:text-amber-500 transition-colors">gravelkingpro.com</a>
            <a
              href="https://www.f6s.com/member/kevin-mo?follow=1"
              target="_blank"
              rel="noopener noreferrer"
              title="Follow Kevin Morris on F6S"
              className="inline-flex items-center shrink-0"
            >
              <img
                src="https://www.f6s.com/images/f6s-follow-primary.png"
                width="78"
                height="22"
                alt="Follow Kevin Morris on F6S"
                className="block"
              />
            </a>
          </div>
        </div>
      </footer>}
    </div>
  );
}
