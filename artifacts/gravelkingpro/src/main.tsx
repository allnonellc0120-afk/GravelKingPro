import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    void registration?.update();
  },
});

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

let buildCheckInFlight = false;

async function checkForNewBuild(): Promise<void> {
  if (buildCheckInFlight || document.visibilityState === "hidden") return;
  buildCheckInFlight = true;
  try {
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
    const checkUrl = new URL("index.html", baseUrl);
    checkUrl.searchParams.set("gkp_build_check", __APP_BUILD__);
    const response = await fetch(checkUrl, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) return;

    const html = await response.text();
    const serverBuild = new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector('meta[name="gkp-build-version"]')
      ?.getAttribute("content");
    if (!serverBuild || serverBuild === __APP_BUILD__) return;

    const reloadKey = `gkp:build-reloaded:${serverBuild}`;
    if (sessionStorage.getItem(reloadKey)) return;
    sessionStorage.setItem(reloadKey, "1");
    await updateSW(true);
    window.location.reload();
  } catch {
    // A transient network failure must not interrupt the current session.
  } finally {
    buildCheckInFlight = false;
  }
}

void checkForNewBuild();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void checkForNewBuild();
});
window.addEventListener("focus", () => void checkForNewBuild());
window.setInterval(() => void checkForNewBuild(), 5 * 60 * 1000);

createRoot(document.getElementById("root")!).render(<App />);
