import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

function campaignMetadata(): Record<string, string> | undefined {
  const params = new URLSearchParams(window.location.search);
  const metadata = Object.fromEntries(
    ["utm_source", "utm_medium", "utm_campaign", "utm_content"]
      .map((key) => [key, params.get(key)])
      .filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/** Records a privacy-safe conversion milestone. */
export function trackFunnelEvent(
  type:
    | "landing_cta_clicked"
    | "plan_selected"
    | "signin_required"
    | "checkout_returned"
    | "signup_completed"
    | "checkout_error",
  metadata?: Record<string, string>,
): void {
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    keepalive: true,
    body: JSON.stringify({ type, path: window.location.pathname, metadata: { ...campaignMetadata(), ...metadata } }),
  }).catch(() => {});
}

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
        metadata: campaignMetadata(),
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
