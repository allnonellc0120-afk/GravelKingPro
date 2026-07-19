---
name: PWA service worker navigateFallback hijacks server routes
description: vite-plugin-pwa generateSW serves the SPA shell for ALL navigations (including /api/*) unless denylisted — breaks OIDC sign-in for returning visitors only.
---

# navigateFallback intercepts /api/login for anyone with the SW installed

vite-plugin-pwa (generateSW mode) defaults `navigateFallback` to the precached
`index.html`. A NavigationRoute matches **every** top-level navigation — so
clicking `<a href="/api/login">` never reaches the server for any visitor whose
browser already installed the service worker. The SPA boots at `/api/login`,
the client router finds no match, and the user sees the app's own 404 page
("Did you forget to add the page to the router?").

**Why:** this silently killed sign-in (and therefore checkout) in production.
It is invisible to curl/server-side testing — the server responds 302 correctly.
It only affects RETURNING visitors (first-time visitors have no SW yet), which
is exactly the "works for me, broken for customers" signature. Detection clue:
first-party analytics recorded SPA pageviews with `path=/api/login` — the shell
rendered on a server route.

**How to apply:** any SPA artifact with VitePWA must set
`workbox.navigateFallbackDenylist` covering every server-side or sibling-artifact
prefix on the same origin, e.g. `[/^\/api\//, /^\/mobile\//, ...]`. Remember
sibling artifacts share the production origin (path routing), so denylist their
previewPaths too. `runtimeCaching` for `/api/` does NOT help — NavigationRoute
wins for navigations. With `registerType: "autoUpdate"`, the fix self-heals on
each user's next visit after publish (SW updates, then controls the next load).
