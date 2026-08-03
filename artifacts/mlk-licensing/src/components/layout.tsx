import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Cpu, CreditCard, Key, Shield, Menu, X } from "lucide-react";
import { useGetMlkLicenseStatus } from "@workspace/api-client-react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: licenseStatus } = useGetMlkLicenseStatus({ query: { enabled: true, queryKey: ["license-status"] } });

  const isActive = (path: string) => location === path;

  return (
    <div className="min-h-screen flex flex-col w-full font-sans bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 max-w-screen-2xl items-center">
          <div className="mr-4 hidden md:flex">
            <Link href="/" className="mr-6 flex items-center space-x-2 font-mono font-bold tracking-tighter">
              <Cpu className="h-5 w-5" />
              <span>MLK_V3.5</span>
            </Link>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <Link href="/pricing" className={`transition-colors hover:text-foreground/80 ${isActive("/pricing") ? "text-foreground" : "text-foreground/60"}`}>
                Pricing
              </Link>
              <Link href="/benchmark" className={`transition-colors hover:text-foreground/80 ${isActive("/benchmark") ? "text-foreground" : "text-foreground/60"}`}>
                Benchmark
              </Link>
              <Link href="/buyers" className={`transition-colors hover:text-foreground/80 ${isActive("/buyers") ? "text-foreground" : "text-foreground/60"}`}>
                Buyers
              </Link>
            </nav>
          </div>
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <div className="w-full flex-1 md:w-auto md:flex-none">
            </div>
            <nav className="flex items-center space-x-2">
              {licenseStatus?.active ? (
                <Link href="/dashboard" className="inline-flex h-9 items-center justify-center border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                  <Activity className="mr-2 h-4 w-4" />
                  Dashboard
                </Link>
              ) : (
                <Link href="/activate" className="inline-flex h-9 items-center justify-center border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
                  <Key className="mr-2 h-4 w-4" />
                  Activate License
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-screen-2xl mx-auto px-4 md:px-8 py-8">
        {children}
      </main>
      <footer className="border-t py-6 md:py-0 w-full mt-auto">
        <div className="container max-w-screen-2xl flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row mx-auto px-4">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left font-mono">
            Morris Law Kernel V3.5. RESTRICTED DISTRIBUTION.
          </p>
        </div>
      </footer>
    </div>
  );
}
