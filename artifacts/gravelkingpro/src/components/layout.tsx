import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/studio", label: "Studio" },
    { href: "/mix", label: "Mix Studio" },
    { href: "/pricing", label: "Pricing" },
    { href: "/report", label: "Report" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            <span className="font-bold text-lg tracking-tight uppercase">GravelKing Productions</span>
          </div>
          <nav className="flex items-center gap-5">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-amber-500 ${
                  location === link.href ? "text-amber-500" : "text-muted-foreground"
                }`}
                data-testid={`link-${link.label.toLowerCase().replace(" ", "-")}`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
