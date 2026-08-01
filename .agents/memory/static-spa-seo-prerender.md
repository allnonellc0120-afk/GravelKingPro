---
name: Per-route SEO for a static Vite SPA on Replit
description: How to give a client-rendered Vite+Wouter SPA real per-route metadata that non-JS crawlers see, when deployed as Replit static files
---

A Vite SPA deploys as static files (`publicDir = dist/public`) with an SPA fallback rewrite `/* -> /index.html`. Every route ships the same shell, so social/AI crawlers (which don't run JS) see one shared `<title>`/description/OG set. Client-side head libraries DON'T fix this for non-JS crawlers.

**Durable approach (works in production):**
- Keep one source of truth for route metadata (a `seo.config.json`: siteUrl, per-route title/description/ogType, plus site-wide og:image/locale/site_name).
- In `index.html`, wrap the per-route-replaceable head tags in a comment-delimited block: `<!-- SEO:START --> ... <!-- SEO:END -->`. Keep site-wide tags + JSON-LD outside it. Vite preserves these comments through `vite build`.
- Add a post-build `prerender.mjs` (`"build": "vite build && node prerender.mjs"`) that reads the BUILT `dist/public/index.html` (so Vite's hashed asset `<script>`/`<link>` are already injected and preserved), replaces the SEO block per route, and writes `dist/public/<route>.html`. Also emit `sitemap.xml`; reference it from `robots.txt`. Make the script throw if the markers are missing (fail-fast prevents silently shipping shared metadata).
- **Serving the clean canonical URL is the crux.** Canonical URLs are slashless (`/pricing`). Do NOT rely on the host's clean-URL/directory-index behavior — add EXACT rewrites BEFORE the `/*` catch-all: `from="/pricing" to="/pricing.html"`. Static file lookup runs before rewrites (assets still load), and the catch-all still serves all client-only routes. Edit artifact.toml only via `verifyAndReplaceArtifactToml`.
- **Never emit `<route>/index.html` directories from the prerender.** A real directory makes the static host 301 `/pricing` → `/pricing/`, and the trailing-slash request bypasses the exact rewrite and hits the `/*` fallback — every page serves the ROOT SEO block and Google reads the whole site as duplicate homepages. Flat `<route>.html` files + exact rewrites ONLY. Verify live with `curl -s https://domain/<route> | grep '<title>'` per route (status 200 + route-specific title = good; 301 or shared title = broken).
- Add a small client `RouteSeo` hook (updates title/description/canonical/OG on wouter location change) for SPA navigation + JS-rendering crawlers. It complements, not replaces, the prerendered HTML.

**Why:** non-JS crawlers read only the first HTML response; the `/*` fallback would otherwise hand them the homepage shell for every route. Exact rewrites make slashless canonical URLs deterministic regardless of the host's directory-index support.

**Scope tip:** prerender only genuinely public/indexable marketing routes; leave app/admin/account routes on the fallback shell.
