---
name: GravelKingPro product focus
description: The four-pillar product scope and the deprecation of all cloud-AI separation features
---
GravelKingPro is refocused to four pillars only: IP authorship certification, MLK v3 Mastering (local ffmpeg), the Vocal Booth (karaoke recording), and the karaoke-style DAW.

**Decision (refined 2026-07-31):** splitter features (voice removal / stem split) STAY live in the app for existing users — but are removed from all plan feature lists and marketing copy. Owner's framing: the product story is IP rights in songwriting, the mastering tool, and the Vocal Booth/DAW; the Label is a feature, not a tool. Whitepapers/pitch decks were verified already clean of splitter mentions; the only remaining marketing mention was the download-page plan list (removed).

**Why:** the owner repeatedly objected to cloud-AI cost and to features that silently faked success; wants an honest, local-first product. He has signalled he may leave the platform if the remaining tools don't actually work. Full removal was rejected because the weekly tier was sold on those features — don't pull working features from under existing users.

**How to apply:** do NOT reintroduce Replicate/Demucs/UVR separation or voice-removal as product features or in public copy (home, pricing, whitepaper.html, pitch-paper.html, index.html SEO, seo.config.json). Treat older memory notes about Replicate separation / voice removal as historical, not current direction. The Vocal Booth still calls a cloud transcription endpoint with a manual tap-to-time fallback — flagged for removal, not yet done. Mastering + Vocal Booth both POST to /api/kernel/master (local ffmpeg); that is the core pipeline to keep working.
