# GravelKing Pro — White Paper

**Write. Compose. Record. Master. Release with Proof.**
gravelkingpro.it.com · September 2026

---

## 1. The Problem

Independent artists face three structural disadvantages:

1. **No proof of authorship.** When a song blows up, the first question is "prove you wrote it." Screenshots of a notes app and a voice memo are not evidence. Disputes over AI-assisted work are rising, and platforms, sync agents, and courts increasingly demand credible provenance.
2. **Studio costs are a gate.** Professional mastering runs $50–$150 per track. A DAW workflow demands a laptop, plug-ins, and months of learning. Most working-class artists quit before release.
3. **Tool fragmentation.** Writing happens in one app, recording in another, mastering in a third, and "proof" nowhere. Every handoff loses metadata, momentum, and money.

## 2. The Product

GravelKing Pro is a four-tool web platform (with an Android app via Google Play) that takes a song from first line to mastered, certified release — in a browser, on a phone, with no studio.

### 2.1 JAX — Songwriting Companion & Provenance
A conversational AI songwriting partner (Google Gemini 2.5 Flash, running on dedicated Vertex AI infrastructure) with persistent artist memory. Every drafting session is captured in an **edit ledger**: keystroke-level contribution scoring (0–100 authorship score) that distinguishes human-written, AI-assisted, and AI-generated content. Delete-and-retype games score zero — the ledger records account activity, not just final text.

### 2.2 Vocal Booth
A focused recording workspace: record vocals over the generated backing track, then clip, splice, duplicate, layer, and pan stems. It is deliberately not a DAW — four operations, zero learning curve, built for phones and iPads.

### 2.3 The Foundry — Morris Law Kernel v3.5 Mastering
A proprietary multi-band mastering kernel (Python DSP worker) that masters the track to streaming targets (−14 LUFS reference). No plug-ins, no presets to learn — one pass, broadcast-ready output.

### 2.4 Converter
Lossless audio container/format conversion (WAV ↔ MP3 and more) — the unglamorous utility every release actually needs.

### 2.5 IP Provenance Certificates
The differentiator. Every certified track receives a **court-ready PDF certificate** with:
- HMAC-SHA256 split-key signature — the nominator is embedded in the track audio itself (LSB watermark); the denominator + HMAC key exist only on the server, so certificates cannot be forged client-side.
- Authorship score (0–100) with the ≥25 human-authorship threshold enforced server-side.
- AI model identification and copyright-clearance check result.
- Dual-recorded in PostgreSQL + Firestore for redundancy.

Certificates are **free to stamp**; the official document is unlocked per-track ($1.99) or included with the King tier — an impulse purchase made at the exact moment of emotional investment (finished song in hand).

## 3. Why Now

- **AI music litigation is mainstream.** Platforms and collecting societies are moving toward provenance requirements. First mover with credible, verifiable certificates owns the category.
- **The creator economy is mobile-first.** 70%+ of independent artists under 30 write and record on phones. Incumbent tools (Pro Tools, LANDR, BandLab) are either desktop-bound, mastering-only, or proof-free.
- **LLM cost curves collapsed.** A JAX session costs fractions of a cent; ElevenLabs voice and Vertex inference make a "studio in a browser" economically viable at $9.99/month.

## 4. Architecture (Summary)

- **Web:** React + Vite PWA; Express API server; PostgreSQL (Drizzle); Stripe Payment Element (embedded, Apple Pay / Google Pay, zero redirects).
- **Mobile:** Android via Play Billing TWA; subscriptions verified server-side (subscriptionsv2).
- **AI:** Vertex AI Gemini (lyrics/JAX), ElevenLabs (voice + music generation), Lyria on Vertex (composition).
- **DSP:** Morris Law Kernel v3.5 Python worker — the sole mastering path; no fallback compromises.
- **Trust:** split-key HMAC certificates, server-side payment verification before any byte is processed, atomic quota accounting.

## 5. Market

- **TAM:** ~70M self-releasing artists globally; DIY distribution grew 17% YoY.
- **SAM:** English-language mobile-first indie artists using at least one paid music tool: ~8M.
- **SOM (24 months):** 25,000 paying subscribers across Pro and King — under 0.4% of SAM.

## 6. Business Model

| Tier | Price | Unlocks |
|---|---|---|
| Free | $0 | JAX lyric drafting, Vocal Booth recording, in-app playback |
| Pro | $9.99/mo | Foundry mastering, Converter, song generation, 20 hi-res WAV downloads/mo |
| King | $24.99/mo | Unlimited downloads, unlimited IP certificates, forensic signal verification |
| À la carte | $1.99/track | Official IP certificate document (all tiers) |

## 7. Moat

1. **The certificate is the moat.** Watermark + HMAC split-key + authorship ledger is genuinely hard to replicate and becomes more valuable with every dispute it survives.
2. **Workflow lock-in.** Songs, drafts, ledgers, and certificates live in one vault; leaving means abandoning your proof trail.
3. **Proprietary DSP.** The Morris Law Kernel is owned IP, not a wrapper around a rented API.

## 8. Status

Live at gravelkingpro.it.com (custom domain, production deployment). Android app in Play review track. Stripe live. JAX, Vocal Booth, Foundry, and certificate pipeline all in production.

---

*GravelKing Pro — All None LLC. Confidential; for prospective partners and advisors.*
