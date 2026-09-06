import { Router, Request, Response } from "express";

const downloadRouter = Router();

const README_CONTENT = `# GravelKing Productions — Free Edition v1.0
# © ${new Date().getFullYear()} All N One LLC | kevm@gravelkingpro.com | gravelkingpro.com

## What This Is
GravelKing Productions Free Edition runs on your local machine using Node.js and ffmpeg.
Free features process audio locally. Paid features route to gravelkingpro.com automatically.

## Free Tier (limited, 100% local processing)
- Voice Removal — 3 free runs (downloadable WAV)
- Stem Splitting — 1 free run (5 stems: vocals, drums, bass, other, instrumental)
- Mastering — 1 full free download, then 30-second previews (all presets, denoise toggle)

## Paid Features (Connects to gravelkingpro.com)
- GravelKing Pro ($9.99/mo): unlimited voice removal + stem splitting, preset mastering with denoise
- GravelKing King Pro ($24.99/mo): everything in Pro plus fully adjustable mastering and the live DAW (multitrack mixing, recording, per-stem live metrics)
- Node Auditor ($249.50/mo): Kernel Dashboard, remote endpoint access, raw telemetry

## Setup Instructions

### Prerequisites
1. Node.js v20 or later — https://nodejs.org
2. pnpm — run: npm install -g pnpm
3. ffmpeg v6+ — https://ffmpeg.org/download.html
   - Windows: winget install ffmpeg
   - macOS:   brew install ffmpeg
   - Ubuntu:  sudo apt install ffmpeg

### Install & Run
1. Clone or download the GravelKing Productions repository
2. Navigate to the project root
3. Run: pnpm install
4. Run: pnpm --filter @workspace/api-server run dev
5. Open: http://localhost:5000

### Connecting to gravelkingpro.com (for upgrades)
The app automatically connects to https://gravelkingpro.com when you:
- Click any Pro/Splits feature
- Sign in via the auth flow
- Your local server proxies paid processing securely

### Environment (optional)
Create a .env file in artifacts/api-server/ with:
  REMOTE_KERNEL_URL=https://gravelkingpro.com/api/kernel
  REMOTE_KERNEL_API_KEY=your_key_here

## Architecture
  Free tier  →  Local ffmpeg processing  (your machine)
  Paid tier  →  gravelkingpro.com API  (GravelKing servers)
  Kernel     →  MLK v3 multi-band amplitude carving (local or remote)

## Support
Email:   kevm@gravelkingpro.com
Website: https://gravelkingpro.com

────────────────────────────────────────────
GravelKing Productions | All N One LLC
Powered by GravelKing Protocol + MLK v3 Kernel
`;

downloadRouter.get("/download/package", (_req: Request, res: Response) => {
  const buf = Buffer.from(README_CONTENT, "utf8");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="GravelKingProductions_Free_Setup.txt"');
  res.setHeader("Content-Length", String(buf.length));
  res.send(buf);
});

export default downloadRouter;
