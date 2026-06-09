import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Fires a fire-and-forget pageview beacon on every route change.
 * Failures are swallowed — analytics must never break the app.
 */
export function usePageTracking(): void {
  const [location] = useLocation();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    // Don't track the admin dashboard itself.
    if (location.startsWith("/admin")) return;
    if (lastTracked.current === location) return;
    lastTracked.current = location;

    void fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({
        path: location,
        referrer: document.referrer || null,
      }),
    }).catch(() => {
      /* ignore */
    });
  }, [location]);
}

/** Mountable no-render component that wires up page tracking inside the router. */
export function PageTracker(): null {
  usePageTracking();
  return null;
}
