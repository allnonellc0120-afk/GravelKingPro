---
name: Custom domain + GoDaddy DNS
description: gravelkingpro.com attachment state and how to change its DNS via the GoDaddy API
---

# Custom domain + GoDaddy DNS

**State (as of 2026-07-17):** `gravelkingpro.com` is attached to THIS repl's deployment (`gravelking-acquisition-1.replit.app`). A duplicate older project ("Gravelking Acquisition", Jul 14) previously held the domain; user was told to unpublish/delete it.

**Rules:**
- A custom domain attaches to exactly ONE deployment. Relinking to a different deployment issues a NEW `replit-verify=` TXT token — the old token at the registrar must be replaced or verification hangs on "This app isn't live yet" (404 placeholder).
- Replit queries TXT at `gravelkingpro.com` apex — in GoDaddy's zone that is name `@` (Replit's panel shows host "gravelkingpro" because it treats it.com as the parent zone; ignore that in GoDaddy). A leftover doubled record at GoDaddy-name `gravelkingpro` (= gravelkingpro.gravelkingpro.com) is inert cruft.
- `GODADDY_API_KEY` / `GODADDY_API_SECRET` secrets exist in this workspace. API works on this account (no small-account 403). Auth header: `sso-key KEY:SECRET`; GET/PUT `https://api.godaddy.com/v1/domains/gravelkingpro.com/records/TXT[/%40]`.

**Why:** PUT to `/records/TXT/@` REPLACES all apex TXT records — Microsoft 365 verification (`NETORGFT...onmicrosoft.com`) and SPF (`v=spf1 include:secureserver.net -all`) share that slot and MUST be included in the payload or the user's email breaks.

**How to apply:** any future domain/DNS change → read current records first, filter+append, PUT the full set back. Verify with authoritative NS (ns61/ns62.domaincontrol.com) then confirm the domain serves the current build's asset hash.
