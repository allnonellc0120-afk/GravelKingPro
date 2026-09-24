import { useUser } from "@clerk/react";
import { Archive, AudioLines, Mic2, Newspaper, Sparkles, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";

const TABS = [
  { href: "/mastering", label: "Studio", icon: AudioLines },
  { href: "/main-stage", label: "Main Stage", icon: Mic2 },
  { href: "/songwriting", label: "Jax", icon: Sparkles },
  { href: "/library", label: "Vault", icon: Archive },
  { href: "/artist", label: "Artist", icon: UserRound },
] as const;

function isActive(location: string, href: string): boolean {
  return location === href || location.startsWith(`${href}/`);
}

export function Navigation() {
  const [location] = useLocation();
  const { user } = useUser();
  const isAuthRoute = location.startsWith("/sign-in") || location.startsWith("/sign-up") || location === "/login";
  const isPerformanceStage = location === "/main-stage" || location.startsWith("/stage/duet/");

  if (isAuthRoute || isPerformanceStage) return null;

  const initials = user
    ? ([user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "U")
    : null;

  return (
    <>
      <header className="phase-one-topbar fixed inset-x-0 top-0 z-40 border-b border-white/10">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/mastering" className="flex items-center gap-2.5" data-testid="link-brand">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-amber-400/50 bg-amber-400/10 text-xs font-black text-amber-300">
              GK
            </span>
            <span className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-100">
              GravelKing
            </span>
          </Link>
          <Link
            href={user ? "/artist" : "/sign-in"}
            className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:text-amber-300"
            data-testid="link-top-account"
          >
            <span className="hidden sm:inline">{user ? "Artist profile" : "Sign in"}</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-[10px] text-amber-200">
              {initials ?? <UserRound className="h-3.5 w-3.5" />}
            </span>
          </Link>
        </div>
      </header>

      <nav
        className="phase-one-dock fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-white/15 px-2 py-2 shadow-2xl"
        aria-label="Core navigation"
      >
        <div className="grid grid-cols-6 gap-1">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(location, href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                  active
                    ? "bg-amber-400/15 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.32)]"
                    : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                }`}
                data-testid={`nav-tab-${label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Icon className={`h-4 w-4 ${active ? "text-amber-300" : "text-zinc-500"}`} />
                <span>{label}</span>
              </Link>
            );
          })}
          <a
            href="/news"
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            data-testid="nav-tab-news"
          >
            <Newspaper className="h-4 w-4 text-zinc-500" />
            <span>News</span>
          </a>
        </div>
      </nav>
    </>
  );
}

export default Navigation;