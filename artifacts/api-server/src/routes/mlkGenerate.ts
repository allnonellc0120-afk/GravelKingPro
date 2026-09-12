/**
 * POST /api/mlk/v35/generate-master and /api/tracks/generate — MLK primary
 * orchestration endpoints.
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
import { generateAndMasterTrack, hashLyrics, remixTrack, type VocalMode } from "../services/mlkOrchestrator";
import { verifyLyrics } from "../services/lyricGuard";
import { isAdminAutomationAuthenticated, ADMIN_AUTOMATION_EMAIL } from "../lib/adminAuth";
import { db, usersTable } from "@workspace/db";
import { masterJobsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { CREDIT_COSTS, grantCredits, spendCredits } from "../lib/credits";
import { buildSignedRvcModelStreamUrl, resolveRvcModelOrigin } from "../services/rvcModelAccess";

const mlkGenerateRouter = Router();

// Generation is expensive (Lyria + kernel) — tight per-IP quota plus a global
// concurrency cap so parallel requests can't stack kernel subprocesses.
const generateRateLimit = rateLimit({ windowMs: 10 * 60_000, max: 3 });
const generateConcurrency = concurrencyLimit(2);

interface GenerationRequestBody {
  lyricId?: string;
  text?: string;
  title?: string;
  artistName?: string;
  stylePrompt?: string;
  vocalMode?: string;
  durationS?: number;
  isExplicit?: boolean;
  lyricAudit?: { finalLyricsHash?: string; authorshipScore?: number; ledger?: unknown[] };
}

interface PreparedGeneration {
  userId: string;
  body: GenerationRequestBody;
  vocalMode: VocalMode;
  text: string;
  creditReference: string;
  creditsSpent: boolean;
  creditBalance?: number;
  modelWeightsUrl: string;
}

/**
 * Shared pre-flight for both generation entry points: identity, config,
 * lyrics validation, copyright gate, and the credit spend. Returns null when
 * the response has already been sent (caller must return immediately).
 */
async function prepareGeneration(
  req: Request,
  res: Response,
): Promise<PreparedGeneration | null> {
  // Shared identity resolver: OIDC first, else gk_session — ISSUING the
  // cookie when absent so the same session can later fetch the track from
  // the gated /api/tracks/:id/download route.
  let user = await getUsageUser(req, res);
  if (isAdminAutomationAuthenticated(req)) {
    const [adminUser] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${ADMIN_AUTOMATION_EMAIL.toLowerCase()}`)
      .limit(1);
    if (!adminUser) {
      res.status(403).json({ error: "Bound admin identity is not provisioned." });
      return null;
    }
    user = adminUser;
  }
  const userId = user.id;

  if (!isVertexConfigured()) {
    res.status(503).json({ error: "Vertex AI is not configured on this server." });
    return null;
  }

  const body = req.body as GenerationRequestBody;
  const vocalMode: VocalMode =
    body.vocalMode === "instrumental" || body.vocalMode === "random"
      ? body.vocalMode
      : "lyrics";
  const text = (body.text ?? "").toString();
  // Lyrics are only required when the user is supplying their own —
  // "random" (model-written) and "instrumental" runs need none.
  if (vocalMode === "lyrics" && text.replace(/\s/g, "").length < 5) {
    res.status(400).json({ error: "Lyrics text is required (min 5 characters)." });
    return null;
  }

  // GravelKing Protocol copyright gate — server-side enforcement point.
  // User-supplied lyrics must clear the AI copyright screen before any
  // generation runs. The UI's /lyrics/verify preview is advisory; this is
  // the gate a crafted client cannot skip.
  if (vocalMode === "lyrics") {
    const screen = await verifyLyrics(text);
    if (screen.verdict === "flagged") {
      res.status(422).json({
        error: screen.reason ?? "These lyrics appear to reproduce a commercially released song.",
        code: "lyrics_flagged",
        ...(screen.matchedWork ? { matchedWork: screen.matchedWork } : {}),
      });
      return null;
    }
  }

  const adminBypass = isAdminAutomationAuthenticated(req) || user.isDeveloper;
  const creditReference = `song:${randomUUID()}`;
  let creditsSpent = false;
  let creditBalance: number | undefined;
  if (!adminBypass) {
    const spent = await spendCredits(userId, CREDIT_COSTS.song, "song", creditReference);
    if (!spent.ok) {
      res.status(402).json({
        error: `This song costs ${CREDIT_COSTS.song} credits. You have ${spent.balance}. Buy a credit pack to continue.`,
        code: "INSUFFICIENT_CREDITS",
        creditsRequired: CREDIT_COSTS.song,
        creditsBalance: spent.balance,
        purchaseUrl: "/pricing#credits",
      });
      return null;
    }
    creditsSpent = true;
    creditBalance = spent.balance;
    res.setHeader("X-GK-Credits-Balance", String(spent.balance));
  }

  return {
    userId,
    body,
    vocalMode,
    text,
    creditReference,
    creditsSpent,
    creditBalance,
    modelWeightsUrl: buildSignedRvcModelStreamUrl(
      resolveRvcModelOrigin(`https://${req.get("host")}`),
      3600,
    ),
  };
}

/** Run the full MLK pipeline for a prepared request. Throws on failure. */
async function runGeneration(prepared: PreparedGeneration) {
  const { body, vocalMode, text, userId } = prepared;
  const serverLyricHash = vocalMode === "lyrics" ? hashLyrics(text).hash : "";
  return generateAndMasterTrack(body.lyricId ?? null, text, userId, {
    title: body.title,
    artistName: body.artistName,
    stylePrompt: body.stylePrompt,
    vocalMode,
    targetDurationS:
      typeof body.durationS === "number" && Number.isFinite(body.durationS)
        ? body.durationS
        : undefined,
    lyricAudit: body.lyricAudit?.finalLyricsHash && Array.isArray(body.lyricAudit.ledger)
      ? {
          finalLyricsHash: serverLyricHash,
          authorshipScore: Math.max(0, Math.min(100, Number(body.lyricAudit.authorshipScore) || 0)),
           ledger: [
             ...body.lyricAudit.ledger.slice(0, 499),
             { metadata: { parental_advisory: body.isExplicit === true } },
           ],
        }
      : undefined,
    modelWeightsUrl: prepared.modelWeightsUrl,
  });
}

/**
 * POST /api/tracks/generate — asynchronous generation worker.
 *
 * Validation, copyright screening, and the credit spend happen synchronously
 * (so bad requests fail fast), then the pipeline is handed to a durable
 * background job row and the client gets { jobId, status: "processing" }
 * immediately. Clients poll GET /api/tracks/:jobId/status.
 */
mlkGenerateRouter.post(
  "/tracks/generate",
  generateRateLimit,
  generateConcurrency,
  async (req: Request, res: Response) => {
    const prepared = await prepareGeneration(req, res);
    if (!prepared) return;

    const jobId = randomUUID();
    await db.insert(masterJobsTable).values({
      id: jobId,
      userId: prepared.userId,
      type: "generation",
      status: "queued",
      stage: "queued",
      progress: 5,
      requestConfig: {
        title: prepared.body.title ?? null,
        vocalMode: prepared.vocalMode,
        durationS: prepared.body.durationS ?? null,
        creditReference: prepared.creditReference,
      },
    });

    res.status(202).json({ success: true, jobId, status: "queued" });

    // Background pipeline — the HTTP request is already answered. Failures
    // fail the job row (and refund credits) instead of hitting a proxy timeout.
    void (async () => {
      try {
        await db.update(masterJobsTable).set({
          status: "processing",
          stage: "processing_demucs",
          progress: 25,
          startedAt: new Date(),
        }).where(eq(masterJobsTable.id, jobId));
        await db.update(masterJobsTable).set({
          stage: "processing_rvc",
          progress: 60,
        }).where(eq(masterJobsTable.id, jobId));
        const result = await runGeneration(prepared);
        await db.update(masterJobsTable).set({
          stage: "processing_mlk_master",
          progress: 85,
        }).where(eq(masterJobsTable.id, jobId));
        await db.update(masterJobsTable).set({
          status: "completed",
          stage: "done",
          progress: 100,
          outputObjectKey: result.trackId,
          outputUrl: `/api/tracks/${result.trackId}/stream`,
          completedAt: new Date(),
        }).where(eq(masterJobsTable.id, jobId));
      } catch (err) {
        req.log.error({ err, jobId }, "MLK v3.5 background generation failed");
        if (prepared.creditsSpent) {
          await grantCredits(
            prepared.userId,
            CREDIT_COSTS.song,
            "failed_song_refund",
            `refund:${prepared.creditReference}`,
          ).catch((refundErr) => req.log.error({ err: refundErr, jobId }, "generation refund failed"));
        }
        const message = err instanceof Error ? err.message : String(err);
        await db.update(masterJobsTable).set({
          status: "failed",
          stage: "failed",
          error: userFacingGenerationError(message).error,
          completedAt: new Date(),
        }).where(eq(masterJobsTable.id, jobId));
      }
    })();
  },
);

/**
 * GET /api/tracks/:id/status — generation job polling.
 * Returns processing | ready | failed. On ready, includes the track id and
 * internal stream URL. Only the job owner (or admin automation) may read it.
 */
mlkGenerateRouter.get("/tracks/:id/status", async (req: Request, res: Response) => {
  const jobId = String(req.params.id);
  const [job] = await db
    .select()
    .from(masterJobsTable)
    .where(and(eq(masterJobsTable.id, jobId), eq(masterJobsTable.type, "generation")))
    .limit(1);
  if (!job) {
    res.status(404).json({ error: "Generation job not found." });
    return;
  }
  if (!isAdminAutomationAuthenticated(req)) {
    const user = await getUsageUser(req, res);
    if (job.userId && job.userId !== user.id) {
      res.status(403).json({ error: "This generation job belongs to another account." });
      return;
    }
  }

  if (job.status === "completed") {
    res.json({
      status: "ready",
      jobId,
      trackId: job.outputObjectKey,
      streamUrl: job.outputUrl,
    });
    return;
  }
  if (job.status === "failed") {
    res.json({ status: "failed", jobId, error: job.error ?? "Generation failed." });
    return;
  }
  res.json({ status: "processing", jobId, stage: job.stage, progress: job.progress });
});

/**
 * POST /api/mlk/v35/generate-master — legacy synchronous entry point.
 * New clients should use POST /api/tracks/generate + the status poller.
 */
mlkGenerateRouter.post(
  "/mlk/v35/generate-master",
  generateRateLimit,
  generateConcurrency,
  async (req: Request, res: Response) => {
    const prepared = await prepareGeneration(req, res);
    if (!prepared) return;

    try {
      const result = await runGeneration(prepared);
      res.json({ success: true, ...result });
    } catch (err) {
      if (prepared.creditsSpent) {
        await grantCredits(
          prepared.userId,
          CREDIT_COSTS.song,
          "failed_song_refund",
          `refund:${prepared.creditReference}`,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      // Full raw error (stack, upstream JSON) stays in the server logs ONLY.
      req.log.error({ err }, "MLK v3.5 generate-master failed");
      const friendly = userFacingGenerationError(message);
      res.status(friendly.status).json({ error: friendly.error, ...(friendly.code ? { code: friendly.code } : {}) });
    }
  },
);

/** Google's upstream safety filter rejected the prompt — a user-input problem, not a server fault. */
function isContentPolicyBlock(message: string): boolean {
  return /content_blocked|blocked for an unspecified policy|safety (filter|system|policy)/i.test(message);
}

const PROMPT_FLAGGED_MESSAGE =
  "Prompt flagged by AI safety filter. Try selecting from the preset style tags or softening your prompt.";

/**
 * Error shield: every failure maps to a clean, human-readable message.
 * Raw engine errors, upstream JSON, and stack traces never reach the UI —
 * they are logged server-side by the caller before this mapping.
 */
function userFacingGenerationError(message: string): { status: number; error: string; code?: string } {
  if (isContentPolicyBlock(message)) {
    return { status: 422, error: PROMPT_FLAGGED_MESSAGE, code: "content_blocked" };
  }
  // These messages are already written for humans — pass them through.
  if (/Storage Configuration Error/i.test(message)) return { status: 502, error: message };
  if (/not found|own vault/i.test(message)) return { status: 404, error: message };
  if (/Lyrics text is required/i.test(message)) return { status: 400, error: message };
  return {
    status: 502,
    error:
      "The music engine hit a temporary issue while producing your track. " +
      "Nothing was recorded or charged — please try again in a moment.",
  };
}

/**
 * POST /api/mlk/v35/remix and /api/tracks/remix — MLK v3.5 Remix Engine.
 *
 * Takes an existing vault track, anchors on its original style prompt, blends
 * the user's new twist, regenerates via Lyria, masters through the real MLK
 * v3.5 kernel, and issues a CHILD IP cert linked to the parent (chain of
 * title). Same cost profile as generation → same rate/concurrency limits.
 */
interface RemixRequestBody {
  parentTrackId?: string;
  twist?: string;
  vocalsOn?: boolean;
  artistName?: string;
}

interface PreparedRemix {
  userId: string;
  parentTrackId: string;
  twist: string;
  vocalsOn: boolean;
  artistName?: string;
  creditReference: string;
  creditsSpent: boolean;
}

/** Shared pre-flight for remix: identity, config, parent id, credit spend. */
async function prepareRemix(req: Request, res: Response): Promise<PreparedRemix | null> {
  let user = await getUsageUser(req, res);
  if (isAdminAutomationAuthenticated(req)) {
    const [adminUser] = await db
      .select()
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${ADMIN_AUTOMATION_EMAIL.toLowerCase()}`)
      .limit(1);
    if (!adminUser) {
      res.status(403).json({ error: "Bound admin identity is not provisioned." });
      return null;
    }
    user = adminUser;
  }

  if (!isVertexConfigured()) {
    res.status(503).json({ error: "Vertex AI is not configured on this server." });
    return null;
  }

  const adminBypass = isAdminAutomationAuthenticated(req) || user.isDeveloper;
  const creditReference = `remix:${randomUUID()}`;
  let creditsSpent = false;
  if (!adminBypass) {
    const spent = await spendCredits(user.id, CREDIT_COSTS.song, "song", creditReference);
    if (!spent.ok) {
      res.status(402).json({
        error: `This remix costs ${CREDIT_COSTS.song} credits. You have ${spent.balance}. Buy a credit pack to continue.`,
        code: "INSUFFICIENT_CREDITS",
        creditsRequired: CREDIT_COSTS.song,
        creditsBalance: spent.balance,
        purchaseUrl: "/pricing#credits",
      });
      return null;
    }
    creditsSpent = true;
    res.setHeader("X-GK-Credits-Balance", String(spent.balance));
  }

  const body = req.body as RemixRequestBody;
  const parentTrackId = (body.parentTrackId ?? "").toString().trim();
  if (!parentTrackId) {
    if (creditsSpent) {
      await grantCredits(user.id, CREDIT_COSTS.song, "failed_song_refund", `refund:${creditReference}`);
    }
    res.status(400).json({ error: "parentTrackId is required." });
    return null;
  }

  return {
    userId: user.id,
    parentTrackId,
    twist: (body.twist ?? "").toString(),
    vocalsOn: body.vocalsOn === true,
    artistName: body.artistName,
    creditReference,
    creditsSpent,
  };
}

/**
 * POST /api/tracks/remix — asynchronous remix worker.
 * Same ACK/poll contract as /api/tracks/generate: the durable job row tracks
 * the pipeline while the client polls GET /api/tracks/:jobId/status.
 */
mlkGenerateRouter.post(
  "/tracks/remix",
  generateRateLimit,
  generateConcurrency,
  async (req: Request, res: Response) => {
    const prepared = await prepareRemix(req, res);
    if (!prepared) return;

    const jobId = randomUUID();
    await db.insert(masterJobsTable).values({
      id: jobId,
      userId: prepared.userId,
      type: "generation",
      status: "queued",
      stage: "queued",
      progress: 5,
      requestConfig: {
        remixOf: prepared.parentTrackId,
        vocalsOn: prepared.vocalsOn,
        creditReference: prepared.creditReference,
      },
    });

    res.status(202).json({ success: true, jobId, status: "queued" });

    void (async () => {
      try {
        await db.update(masterJobsTable).set({
          status: "processing",
          stage: "processing_demucs",
          progress: 25,
          startedAt: new Date(),
        }).where(eq(masterJobsTable.id, jobId));
        await db.update(masterJobsTable).set({
          stage: "processing_rvc",
          progress: 60,
        }).where(eq(masterJobsTable.id, jobId));
        const result = await remixTrack(prepared.parentTrackId, prepared.userId, {
          twist: prepared.twist,
          vocalsOn: prepared.vocalsOn,
          artistName: prepared.artistName,
        });
        await db.update(masterJobsTable).set({
          stage: "processing_mlk_master",
          progress: 85,
        }).where(eq(masterJobsTable.id, jobId));
        await db.update(masterJobsTable).set({
          status: "completed",
          stage: "done",
          progress: 100,
          outputObjectKey: result.trackId,
          outputUrl: `/api/tracks/${result.trackId}/stream`,
          completedAt: new Date(),
        }).where(eq(masterJobsTable.id, jobId));
      } catch (err) {
        req.log.error({ err, jobId }, "MLK v3.5 background remix failed");
        if (prepared.creditsSpent) {
          await grantCredits(
            prepared.userId,
            CREDIT_COSTS.song,
            "failed_song_refund",
            `refund:${prepared.creditReference}`,
          ).catch((refundErr) => req.log.error({ err: refundErr, jobId }, "remix refund failed"));
        }
        const message = err instanceof Error ? err.message : String(err);
        await db.update(masterJobsTable).set({
          status: "failed",
          stage: "failed",
          error: userFacingGenerationError(message).error,
          completedAt: new Date(),
        }).where(eq(masterJobsTable.id, jobId));
      }
    })();
  },
);

/**
 * POST /api/mlk/v35/remix — legacy synchronous remix entry point.
 */
mlkGenerateRouter.post(
  "/mlk/v35/remix",
  generateRateLimit,
  generateConcurrency,
  async (req: Request, res: Response) => {
    const prepared = await prepareRemix(req, res);
    if (!prepared) return;

    try {
      const result = await remixTrack(prepared.parentTrackId, prepared.userId, {
        twist: prepared.twist,
        vocalsOn: prepared.vocalsOn,
        artistName: prepared.artistName,
      });
      res.json({ success: true, ...result });
    } catch (err) {
      if (prepared.creditsSpent) {
        await grantCredits(
          prepared.userId,
          CREDIT_COSTS.song,
          "failed_song_refund",
          `refund:${prepared.creditReference}`,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      // Full raw error (stack, upstream JSON) stays in the server logs ONLY.
      req.log.error({ err }, "MLK v3.5 remix failed");
      const friendly = userFacingGenerationError(message);
      res.status(friendly.status).json({ error: friendly.error, ...(friendly.code ? { code: friendly.code } : {}) });
    }
  },
);

export { mlkGenerateRouter };
