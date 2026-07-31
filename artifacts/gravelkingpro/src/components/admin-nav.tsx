import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

const TABS = [
  { href: "/admin", label: "Analytics" },
  { href: "/admin/tracks", label: "Tracks" },
  { href: "/admin/waitlist", label: "Waitlist" },
  { href: "/admin/ops", label: "Ops" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/emails", label: "Emails" },
];

/**
 * Shared admin tab navigation. The Orders tab shows a badge with the number
 * of weekend-special orders that are ready to master (files submitted but
 * not yet delivered).
 */
export function AdminNav({ children }: { children?: React.ReactNode }) {
  const [location] = useLocation();
  const [readyCount, setReadyCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/weekend-special/admin/orders", {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          orders?: Array<{ status: string }>;
        };
        if (cancelled || !json.orders) return;
        setReadyCount(json.orders.filter((o) => o.status === "files_submitted").length);
      } catch {
        // Badge is best-effort; ignore failures silently.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex gap-0 border-b border-border/40 flex-wrap">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href}>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 ${
              location === t.href
                ? "border-amber-500 text-amber-500"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.href === "/admin/orders" && readyCount > 0 && (
              <span className="min-w-4 h-4 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold inline-flex items-center justify-center leading-none">
                {readyCount}
              </span>
            )}
          </button>
        </Link>
      ))}
      {children}
    </div>
  );
}
