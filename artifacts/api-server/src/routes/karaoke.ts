import { Router, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { db, artistProfilesTable, karaokeTracksTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { probeAudioDuration, sanitizeExt } from "../lib/audioGuards";
import { parsePastedLyrics } from "../lib/lyricTiming";

const router = Router();
const objectStorage = new ObjectStorageService();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

router.get("/karaoke/tracks", async (_req: Request, res: Response) => {
  const tracks = await db
    .select()
    .from(karaokeTracksTable)
    .orderBy(desc(karaokeTracksTable.createdAt));
  res.json({ tracks });
});

router.post(
  "/karaoke/tracks",
  upload.single("audio"),
  async (req: Request, res: Response) => {
    if (!req.dbUser) {
      res.status(401).json({ error: "Sign in to upload a community backing track." });
      return;
    }
    const file = req.file;
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
    const bpmValue = Number(req.body?.bpm);
    if (!file || !file.mimetype.startsWith("audio/") || !title) {
      res.status(400).json({ error: "title and an audio backing track are required." });
      return;
    }
    if (Number.isFinite(bpmValue) && (!Number.isInteger(bpmValue) || bpmValue < 20 || bpmValue > 300)) {
      res.status(400).json({ error: "bpm must be an integer from 20 to 300." });
      return;
    }

    const ext = sanitizeExt(file.originalname) || "audio";
    const duration = Math.round(await probeAudioDuration(file.buffer, ext));
    if (duration <= 0) {
      res.status(400).json({ error: "The uploaded file does not contain readable audio." });
      return;
    }
    const [profile] = await db
      .select({ artistName: artistProfilesTable.artistName })
      .from(artistProfilesTable)
      .where(eq(artistProfilesTable.userId, req.dbUser.id))
      .limit(1);
    const uploaderArtistName = profile?.artistName?.trim()
      || [req.dbUser.firstName, req.dbUser.lastName].filter(Boolean).join(" ").trim()
      || "GravelKing Artist";
    const id = randomUUID();
    const storageKey = `karaoke/${id}/backing.${ext}`;
    const assetUrl = `/api/storage/public-objects/${storageKey}`;

    await objectStorage.savePublicObject(storageKey, file.buffer, file.mimetype);
    const [track] = await db
      .insert(karaokeTracksTable)
      .values({
        id,
        uploaderUserId: req.dbUser.id,
        assetUrl,
        storageKey,
        title,
        bpm: Number.isFinite(bpmValue) ? bpmValue : null,
        duration,
        uploaderArtistName,
      })
      .returning();
    res.status(201).json({ track });
  },
);

router.post("/karaoke/transcribe", upload.single("audio"), async (req: Request, res: Response) => {
  const pastedLyrics = typeof req.body?.lyrics === "string" ? req.body.lyrics : "";
  if (!pastedLyrics.trim()) {
    res.status(400).json({ error: "Paste lyrics to use the deterministic karaoke fallback." });
    return;
  }
  const durationMs = Number(req.body?.durationMs);
  res.json({
    lines: parsePastedLyrics(pastedLyrics, Number.isFinite(durationMs) ? durationMs : 0),
    fullText: pastedLyrics.trim(),
    fallback: "pasted-lyrics",
  });
});

export default router;