/**
 * POST /api/mlk/v35/generate-master — Task #73 orchestration endpoint.
 *
 * Thin controller over services/mlkOrchestrator.generateAndMasterTrack:
 * lyric hash → Vertex AI Lyria → REAL MLK v3.5 kernel → Dual-Anchor cert →
 * user vault. Reuses existing session auth patterns; no new global config.
 */
import { Router, Request, Response } from "express";
import { rateLimit } from "../lib/rateLimiter";
import { concurrencyLimit } from "../lib/concurrencyLimit";
import { getUsageUser } from "../lib/usage";
import { isVertexConfigured } from "../geminiVertex";
import { generateAndMasterTrack } from "../services/mlkOrchestrator";

const mlkGenerateRouter = Router();

// Generation is expensive (Lyria + kernel) — tight per-IP quota plus a global
// concurrency cap so parallel requests can't stack kernel subprocesses.
const generateRateLimit = rateLimit({ windowMs: 10 * 60_000, max: 3 });
const generateConcurrency = concurrencyLimit(2);

mlkGenerateRouter.post(
  "/mlk/v35/generate-master",
  generateRateLimit,
  generateConcurrency,
  async (req: Request, res: Response) => {
    // Shared identity resolver: OIDC first, else gk_session — ISSUING the
    // cookie when absent so the same session can later fetch the track from
    // the gated /api/tracks/:id/download route.
    const user = await getUsageUser(req, res);
    const userId = user.id;

    if (!isVertexConfigured()) {
      res.status(503).json({ error: "Vertex AI is not configured on this server." });
      return;
    }

    const body = req.body as {
      lyricId?: string;
      text?: string;
      title?: string;
      artistName?: string;
      stylePrompt?: string;
    };
    const text = (body.text ?? "").toString();
    if (text.replace(/\s/g, "").length < 5) {
      res.status(400).json({ error: "Lyrics text is required (min 5 characters)." });
      return;
    }

    try {
      const result = await generateAndMasterTrack(body.lyricId ?? null, text, userId, {
        title: body.title,
        artistName: body.artistName,
        stylePrompt: body.stylePrompt,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      req.log.error({ err }, "MLK v3.5 generate-master failed");
      // Fail loudly with the real upstream error — never a silent fallback.
      res.status(502).json({ error: `Generate + master failed: ${message.slice(0, 500)}` });
    }
  },
);

export { mlkGenerateRouter };
