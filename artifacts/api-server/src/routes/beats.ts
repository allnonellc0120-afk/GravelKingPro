/**
 * GravelKing Beats — Sample Library & Beat of the Month
 * GravelKing Protocol — All N One LLC
 *
 * Admin upload:  POST /api/beats/upload       (X-Admin-Key header required)
 * Feature BOTM:  PATCH /api/beats/:id/feature (X-Admin-Key header required)
 * Delete:        DELETE /api/beats/:id        (X-Admin-Key header required)
 *
 * Public:
 *   GET  /api/beats           — list active beats (metadata)
 *   GET  /api/beats/featured  — current Beat of the Month
 *   GET  /api/beats/:id/audio — stream audio (increments download count)
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { db, beatsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { unlink } from "fs/promises";
import crypto from "crypto";

const beatsRouter = Router();
const upload = multer({
  storage: multer.diskStorage({
    destination: "/tmp",
    filename: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop() ?? "bin";
      cb(null, `gk_beats_${crypto.randomUUID()}.${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function getAdminKey(): string {
  return process.env.ADMIN_KEY?.trim() ?? "";
}

function requireAdmin(req: Request, res: Response): boolean {
  const key = getAdminKey();
  if (!key) {
    res.status(503).json({ success: false, error: "Admin key not configured." });
    return false;
  }
  if (req.headers["x-admin-key"] !== key) {
    res.status(403).json({ success: false, error: "Invalid admin key." });
    return false;
  }
  return true;
}

// ── Public: list all active beats ────────────────────────────────────────────
beatsRouter.get("/beats", async (_req, res: Response) => {
  const beats = await db
    .select({
      id:            beatsTable.id,
      title:         beatsTable.title,
      artist:        beatsTable.artist,
      genre:         beatsTable.genre,
      bpm:           beatsTable.bpm,
      description:   beatsTable.description,
      tags:          beatsTable.tags,
      isFeatured:    beatsTable.isFeatured,
      monthYear:     beatsTable.monthYear,
      downloadCount: beatsTable.downloadCount,
      mimeType:      beatsTable.mimeType,
      fileName:      beatsTable.fileName,
      createdAt:     beatsTable.createdAt,
    })
    .from(beatsTable)
    .where(eq(beatsTable.isActive, true))
    .orderBy(desc(beatsTable.isFeatured), desc(beatsTable.createdAt));

  res.json({ success: true, beats });
});

// ── Public: current Beat of the Month ────────────────────────────────────────
beatsRouter.get("/beats/featured", async (_req, res: Response) => {
  const [beat] = await db
    .select({
      id:            beatsTable.id,
      title:         beatsTable.title,
      artist:        beatsTable.artist,
      genre:         beatsTable.genre,
      bpm:           beatsTable.bpm,
      description:   beatsTable.description,
      tags:          beatsTable.tags,
      monthYear:     beatsTable.monthYear,
      downloadCount: beatsTable.downloadCount,
      mimeType:      beatsTable.mimeType,
      fileName:      beatsTable.fileName,
      createdAt:     beatsTable.createdAt,
    })
    .from(beatsTable)
    .where(and(eq(beatsTable.isActive, true), eq(beatsTable.isFeatured, true)))
    .orderBy(desc(beatsTable.createdAt))
    .limit(1);

  if (!beat) {
    res.status(404).json({ success: false, error: "No featured beat found." });
    return;
  }
  res.json({ success: true, beat });
});

// ── Public: stream audio (proxy from audio_url or return 404) ────────────────
beatsRouter.get("/beats/:id/audio", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ success: false, error: "Invalid beat id." }); return; }

  const [beat] = await db
    .select()
    .from(beatsTable)
    .where(and(eq(beatsTable.id, id), eq(beatsTable.isActive, true)))
    .limit(1);

  if (!beat) { res.status(404).json({ success: false, error: "Beat not found." }); return; }

  // Increment download count (fire-and-forget)
  db.update(beatsTable)
    .set({ downloadCount: beat.downloadCount + 1 })
    .where(eq(beatsTable.id, id))
    .catch(() => {});

  if (!beat.audioUrl) {
    res.status(404).json({ success: false, error: "No audio available for this beat." });
    return;
  }

  try {
    const upstream = await fetch(beat.audioUrl);
    if (!upstream.ok) { res.status(502).json({ success: false, error: "Failed to fetch audio." }); return; }

    const ct = upstream.headers.get("content-type") ?? beat.mimeType ?? "audio/mpeg";
    res.setHeader("Content-Type", ct);
    res.setHeader("Content-Disposition", `inline; filename="${beat.fileName ?? "beat.mp3"}"`);
    res.setHeader("X-GK-Beat-ID", String(beat.id));
    res.setHeader("X-GK-Protocol", "GravelKing_Beats_v1");
    res.setHeader("Cache-Control", "public, max-age=3600");

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Admin: upload / register a beat ──────────────────────────────────────────
beatsRouter.post("/beats/upload", upload.none(), async (req: Request, res: Response) => {
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!await requireAdmin(req, res)) return;

  const { title, artist, genre, bpm, description, tags, audio_url, file_name, mime_type } = req.body as Record<string, string>;
  if (!title || !audio_url) {
    res.status(400).json({ success: false, error: "title and audio_url are required." });
    return;
  }

  const [beat] = await db.insert(beatsTable).values({
    title,
    artist:   artist   ?? "GravelKing",
    genre:    genre    ?? null,
    bpm:      bpm      ? parseInt(bpm) : null,
    description: description ?? null,
    tags:     tags     ?? null,
    audioUrl: audio_url,
    fileName: file_name ?? null,
    mimeType: mime_type ?? "audio/mpeg",
  }).returning();

  res.json({ success: true, beat });
});

// ── Admin: set Beat of the Month ─────────────────────────────────────────────
beatsRouter.patch("/beats/:id/feature", async (req: Request, res: Response) => {
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!await requireAdmin(req, res)) return;

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ success: false, error: "Invalid id." }); return; }

  const { month_year } = req.body as Record<string, string>;

  // Unfeature all current
  await db.update(beatsTable).set({ isFeatured: false });

  // Feature the selected one
  const [beat] = await db.update(beatsTable)
    .set({ isFeatured: true, monthYear: month_year ?? null })
    .where(eq(beatsTable.id, id))
    .returning();

  if (!beat) { res.status(404).json({ success: false, error: "Beat not found." }); return; }
  res.json({ success: true, beat });
});

// ── Admin: deactivate a beat ──────────────────────────────────────────────────
beatsRouter.delete("/beats/:id", async (req: Request, res: Response) => {
  const { requireAdmin } = await import("../lib/adminAuth");
  if (!await requireAdmin(req, res)) return;

  const id = parseInt(req.params.id as string);
  if (isNaN(id)) { res.status(400).json({ success: false, error: "Invalid id." }); return; }

  await db.update(beatsTable).set({ isActive: false }).where(eq(beatsTable.id, id));
  res.json({ success: true });
});

export default beatsRouter;
