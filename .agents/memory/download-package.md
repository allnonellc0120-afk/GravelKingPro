---
name: Download package architecture
description: Free downloadable version: what's local vs online, how the download endpoint works
---

## Architecture
- Free local features (ffmpeg on user's machine): Denoise, Voice Changer, 30s Mastering preview, 30s Beat Maker, Songwriter
- Paid online features (connect to gravelkingpro.it.com): Full mastering download, Voice Removal, Stem Splitting, full Beat Maker, Mix Studio, Kernel Dashboard
- Download endpoint: `GET /api/download/package` → returns a text README (Content-Disposition: attachment) with setup instructions
- The README explains: Node.js + ffmpeg setup, local server, .env for remote kernel URL

**Why:** User wants the product listed on gravelkingpro.it.com as a downloadable product. The free tier runs locally, paid routes to their hosted API. This is honest about the architecture — it's not a standalone offline app, it's a self-hosted version with upgrade path.

**Future:** Could become a proper ZIP or Electron app; currently the download is a README/setup guide.
