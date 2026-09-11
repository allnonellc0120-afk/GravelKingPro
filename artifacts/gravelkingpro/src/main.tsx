import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * Recover Android installs that are still controlled by an older PWA build.
 * Reset once per browser session on either supported public host; the current
 * build's PWA registration can then install normally on the next load.
 */
if (
  ["gravelkingpro.com", "gravelkingpro.it.com"].includes(window.location.hostname) &&
  "serviceWorker" in navigator &&
  !sessionStorage.getItem("gkp:stale-pwa-reset:v2")
) {
  sessionStorage.setItem("gkp:stale-pwa-reset:v2", "1");
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    const sameSite = registrations.filter((registration) =>
      registration.scope.startsWith(window.location.origin),
    );
    if (sameSite.length === 0) return;
    await Promise.all(sameSite.map((registration) => registration.unregister()));
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    window.location.reload();
  }).catch(() => {
    // A browser that blocks service-worker inspection can still use the app.
  });
}

createRoot(document.getElementById("root")!).render(<App />);
