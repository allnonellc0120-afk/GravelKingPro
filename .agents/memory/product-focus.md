---
name: GravelKingPro product focus
description: The four-pillar product scope and the deprecation of all cloud-AI separation features
---
GravelKingPro is refocused to four pillars only: IP authorship certification, MLK v3 Mastering (local ffmpeg), the Vocal Booth (karaoke recording), and the karaoke-style DAW.

**Decision:** all cloud-AI / Replicate features — stem splitting, voice removal, voice changer, and (pending) auto-lyric transcription — are being removed from the product and all public marketing.

**Why:** the owner repeatedly objected to cloud-AI cost and to features that silently faked success; wants an honest, local-first product. He has signalled he may leave the platform if the remaining tools don't actually work.

**How to apply:** do NOT reintroduce Replicate/Demucs/UVR separation or voice-removal as product features or in public copy (home, pricing, whitepaper.html, pitch-paper.html, index.html SEO, seo.config.json). Treat older memory notes about Replicate separation / voice removal as historical, not current direction. The Vocal Booth still calls a cloud transcription endpoint with a manual tap-to-time fallback — flagged for removal, not yet done. Mastering + Vocal Booth both POST to /api/kernel/master (local ffmpeg); that is the core pipeline to keep working.
