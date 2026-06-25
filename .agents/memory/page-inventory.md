---
name: GravelKing page inventory
description: All pages, routes, access tiers, and nav structure for GravelKing Productions
---

## Routes
- `/` — Home (all users) — hero + 6 feature cards + pricing strip + bottom CTAs
- `/studio` — Audio Studio (all, free trial gating inside)
- `/mix` — Mix Studio (Pro gate inside)
- `/pricing` — Pricing (all)
- `/report` — Report (all)
- `/kernel` — Kernel Dashboard (hard gate: `isPro` = pro or node_auditor tier)
- `/contact` — Contact (all) — public business contact email + All N One LLC (shown on the page itself)
- `/songbot` — Songwriter (all, free) — template lyric generator, 8 genres
- `/beatmaker` — Beat Maker (all, 30s free; Pro: up to 120s) — MLK v3 kernel
- `/download` — Download page (all) — free local version description + download

## Nav (layout.tsx)
Desktop: Dashboard | Studio | Mix Studio | Beat Maker | Songwriter | Pricing | [Kernel if isPro] | Download (amber button)
Mobile: hamburger with all links + Contact in footer

## Subscription tiers
- `null` = free, `"splits"` = Splits ($9.99), `"pro"` = Pro ($39.99), `"node_auditor"` = Node Auditor ($499)
- `hasSplits`: any paid tier — voice removal + stem splitting downloads
- `isPro`: pro or node_auditor — Mix Studio, full Beat Maker, Kernel Dashboard

## API routes (api-server)
- `POST /api/beatmaker/generate` — ffmpeg lavfi synthesis + MLK v3 kernel → WAV
- `GET /api/download/package` — returns setup README as text file download
