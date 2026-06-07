import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Zap, Menu, X } from "lucide-react";
import { useState } from "react";
import { useAppState } from "@/lib/context";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { isPro } = useAppState();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/studio", label: "Studio" },
    { href: "/mix", label: "Mix Studio" },
    { href: "/beatmaker", label: "Beat Maker" },
    { href: "/songbot", label: "Songwriter" },
    { href: "/beats", label: "Beats" },
    { href: "/pricing", label: "Pricing" },
    ...(isPro ? [{ href: "/kernel", label: "Kernel" }] : []),
  ];

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

      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>

      <footer className="border-t border-border/20 bg-card/30 py-4">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} GravelKing Productions · All N One LLC</span>
          <div className="flex items-center gap-4">
            <Link href="/contact" className="hover:text-amber-500 transition-colors">Contact</Link>
            <Link href="/download" className="hover:text-amber-500 transition-colors">Download</Link>
            <Link href="/pricing" className="hover:text-amber-500 transition-colors">Pricing</Link>
            <a href="https://gravelkingpro.it.com" target="_blank" rel="noopener noreferrer" className="hover:text-amber-500 transition-colors">gravelkingpro.it.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
