import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireLabelCatalogOwner } from "../lib/adminAuth";
import {
  getAdminRuntimeConfig, getAudioPresets, loadAdminRuntimeConfig,
  persistAdminRuntimeConfig, saveAudioPreset, setAudioDefault, validateAudioPreset,
} from "../lib/adminRuntimeConfig";
import { getObjectFileWithFallback } from "../lib/objectStorage";
import { tryGravelKingVoiceSwap } from "../services/mlkOrchestrator";
import { buildSignedRvcModelStreamUrl, resolveRvcModelOrigin } from "../services/rvcModelAccess";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const storageKey = /^models\/[A-Za-z0-9_-]+[.]((?:pth)|(?:index))$/;

router.get("/admin/audio", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  try {
    const [presets, runtime] = await Promise.all([getAudioPresets(), loadAdminRuntimeConfig()]);
    res.json({ ...presets, rvc: runtime.rvc, persona: runtime.jax.persona });
  } catch (err) {
    res.status(503).json({ error: String(err) });
  }
});

router.put("/admin/audio/presets", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  try {
    const preset = validateAudioPreset(req.body?.preset);
    const oldName = req.body?.oldName;
    if (oldName !== undefined && (typeof oldName !== "string" || !/^[\w -]{1,64}$/.test(oldName)))
      throw new Error("Invalid previous preset name");
    await saveAudioPreset(preset, oldName);
    res.json({ ok: true, ...(await getAudioPresets()) });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

router.put("/admin/audio/default", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  try {
    if (typeof req.body?.name !== "string") throw new Error("Preset name is required");
    await setAudioDefault(req.body.name);
    res.json({ ok: true, ...(await getAudioPresets()) });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

router.patch("/admin/audio/voice", async (req: Request, res: Response) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  try {
    const v = req.body as Record<string, unknown>;
    if (!v || typeof v !== "object") throw new Error("Voice settings are required");
    const number = (key: string, min: number, max: number) => {
      const value = v[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
        throw new Error(`${key} must be between ${min} and ${max}`);
      return value;
    };
    const modelKey = v.modelKey;
    const indexKey = v.indexKey;
    if (typeof modelKey !== "string" || !storageKey.test(modelKey) || !modelKey.endsWith(".pth") ||
        typeof indexKey !== "string" || !storageKey.test(indexKey) || !indexKey.endsWith(".index"))
      throw new Error("Choose valid models/*.pth and models/*.index bucket keys");
    const bucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
    const files = await Promise.all([getObjectFileWithFallback(bucket, modelKey), getObjectFileWithFallback(bucket, indexKey)]);
    if (files.some(file => !file)) throw new Error("Selected checkpoint or index does not exist in object storage");
    const pitchShift = number("pitchShift", -24, 24);
    const indexRate = number("indexRate", 0, 1);
    const protect = number("protect", 0, 1);
    if (typeof v.persona !== "string" || v.persona.length > 4000) throw new Error("Persona must be at most 4000 characters");
    const runtime = await persistAdminRuntimeConfig({
      rvc: { modelKey, indexKey, pitchShift, indexRate, protect },
      jax: { persona: v.persona },
    });
    res.json({ ok: true, rvc: runtime.rvc, persona: runtime.jax.persona });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

router.post("/admin/audio/preview", (req: Request, res: Response, next) => {
  if (!requireLabelCatalogOwner(req, res)) return;
  next();
}, upload.single("audio"), async (req: Request, res: Response) => {
  try {
    if (!req.file || !["audio/mpeg", "audio/mp3"].includes(req.file.mimetype))
      throw new Error("Upload an MP3 audio file for a real voice conversion preview");
    const url = buildSignedRvcModelStreamUrl(resolveRvcModelOrigin(), 3600);
    const result = await tryGravelKingVoiceSwap(req.file.buffer, url);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    res.end(result.audio);
  } catch (err) {
    res.status(503).json({ error: `Voice preview unavailable: ${String(err)}` });
  }
});

export default router;