import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Zap, Menu, X, User, LogIn } from "lucide-react";
import { useState } from "react";
import { useAppState } from "@/lib/context";
import { useAuth } from "@workspace/replit-auth-web";

export function Layout({ children, noPadding }: { children: ReactNode; noPadding?: boolean }) {
  const [location] = useLocation();
  const { isPro } = useAppState();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/studio", label: "Studio" },
    { href: "/voice-removal", label: "Voice Removal" },
    { href: "/mastering", label: "Mastering" },
    { href: "/pricing", label: "Pricing" },
    ...(isPro ? [{ href: "/kernel", label: "Kernel" }] : []),
  ];

  const displayName = user
    ? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Account")
    : null;
  const initials = user
    ? ([user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "U")
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Zap className="w-6 h-6 text-amber-500" />
            <span className="font-bold text-base tracking-tight uppercase hidden sm:block">GravelKing Productions</span>
            <span className="font-bold text-base tracking-tight uppercase sm:hidden">GKP</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-5">
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
            <Link
              href="/download"
              className="text-xs font-semibold text-black bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-md transition-colors"
            >
              Download
            </Link>

            {/* User avatar / sign in */}
            {user ? (
              <Link href="/account">
                <div className={`flex items-center gap-2 cursor-pointer group ${location === "/account" ? "opacity-100" : "opacity-80 hover:opacity-100"} transition-opacity`}>
                  {user.profileImageUrl ? (
                    <img
                      src={user.profileImageUrl}
                      alt={displayName ?? ""}
                      className="w-8 h-8 rounded-full object-cover border-2 border-border/40 group-hover:border-amber-500/60 transition-colors"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 border-2 border-amber-500/30 group-hover:border-amber-500/60 flex items-center justify-center text-amber-500 font-bold text-xs transition-colors">
                      {initials}
                    </div>
                  )}
                  <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors hidden lg:block">
                    {displayName}
                  </span>
                </div>
              </Link>
            ) : (
              <a href="/api/login" className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-amber-500 transition-colors">
                <LogIn className="w-4 h-4" />
                <span>Sign in</span>
              </a>
            )}
          </nav>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border/40 bg-card/95 backdrop-blur-sm">
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
                  {link.label}
                </Link>
              ))}
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
                  {user.profileImageUrl ? (
                    <img src={user.profileImageUrl} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-[10px]">
                      {initials}
                    </div>
                  )}
                  <span>My Account</span>
                </Link>
              ) : (
                <a
                  href="/api/login"
                  className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-md transition-colors hover:bg-secondary/60 text-muted-foreground mt-1"
                  onClick={() => setMobileOpen(false)}
                >
                  <LogIn className="w-4 h-4" />
                  Sign in
                </a>
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
      </header>

      <main className={noPadding ? "flex-1 flex flex-col overflow-hidden" : "flex-1 container mx-auto px-4 py-8"}>
        {children}
      </main>

      <footer className="border-t border-border/20 bg-card/30 py-4">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} GravelKing Productions · All N One LLC</span>
          <div className="flex items-center gap-4">
            <Link href="/contact" className="hover:text-amber-500 transition-colors">Contact</Link>
            <Link href="/download" className="hover:text-amber-500 transition-colors">Download</Link>
            <Link href="/pricing" className="hover:text-amber-500 transition-colors">Pricing</Link>
            <Link href="/account" className="hover:text-amber-500 transition-colors">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />Account
              </span>
            </Link>
            <a href="https://gravelkingpro.it.com" target="_blank" rel="noopener noreferrer" className="hover:text-amber-500 transition-colors">gravelkingpro.it.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
