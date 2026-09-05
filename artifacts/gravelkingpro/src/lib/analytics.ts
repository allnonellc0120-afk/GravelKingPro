type AnalyticsData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

/** Safe wrapper around the Replit-injected Umami tracker. No-op in dev or before the script loads. */
export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;
  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never break the app.
  }
}
