/**
 * POST /api/mlk/v35/generate-master and /api/tracks/generate — MLK primary
 * orchestration endpoints.
 *
 * Thin controller over services/mlkOrchestrator.generateAndMasterTrack:
 * lyric hash → Vertex AI Lyria → REAL MLK V4 kernel → Dual-Anchor cert →
 * user vault. Reuses existing session auth patterns; no new global config.
 */
import { Router, Request, Response } from "express";
import { rateLimit } from "../lib/rateLimiter";
import { concurrencyLimit } from "../lib/concurrencyLimit";
import { getUsageUser } from "../lib/usage";
import { isVertexConfigured } from "../geminiVertex";
import { generateAndMasterTrack, generateLyriaAudio, hashLyrics, remixTrack, type VocalMode } from "../services/mlkOrchestrator";
import { dispatchGeneration, failPipelineJob } from "../services/generationPipeline";
import { verifyLyrics } from "../services/lyricGuard";
import { isAdminAutomationAuthenticated, ADMIN_AUTOMATION_EMAIL } from "../lib/adminAuth";
import { db, usersTable } from "@workspace/db";
import { masterJobsTable } from "@workspace/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { CREDIT_COSTS, grantCredits, spendCredits } from "../lib/credits";
import { buildSignedRvcModelStreamUrl, resolveRvcModelOrigin } from "../services/rvcModelAccess";
import { publishGenerationJobEvent, subscribeToGenerationJob } from "../services/generationEvents";

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

interface GenerationJobState {
  id?: string;
  status: "queued" | "processing" | "ready" | "failed";
  jobId: string;
  stage?: string;
  progress?: number;
  trackId?: string | null;
  streamUrl?: string | null;
  error?: string;
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
async function runGeneration(
  prepared: PreparedGeneration,
  onStage?: (stage: "demucs" | "rvc" | "mlk_master") => Promise<void>,
) {
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
    onStage,
  });
}

/**
 * POST /api/tracks/generate — asynchronous generation worker.
 *
 * Validation, copyright screening, and the credit spend happen synchronously
 * (so bad requests fail fast), then the pipeline is handed to a durable
 * background job row and the client gets { jobId, status: "processing" }
 * immediately. Clients follow GET /api/tracks/:jobId/events.
 */
mlkGenerateRouter.post(
  ["/tracks/generate", "/generate/mlk"],
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
    publishGenerationJobEvent({ jobId, status: "queued", stage: "queued", progress: 5 });

    res.status(202).json({ success: true, jobId, status: "queued" });

    // Webhook-chained pipeline — the HTTP request is already answered. Lyria
    // (Vertex) runs here, then Demucs/RVC advance via /api/webhooks/replicate;
    // no request ever waits on a Replicate prediction.
    void (async () => {
      try {
        const origin = `https://${req.get("host")}`;
        await db.update(masterJobsTable).set({
          status: "processing",
          stage: "generating_lyria",
          progress: 10,
          startedAt: new Date(),
        }).where(eq(masterJobsTable.id, jobId));
        publishGenerationJobEvent({
          jobId,
          status: "processing",
          stage: "generating_lyria",
          progress: 10,
        });
        const stylePrompt =
          prepared.body.stylePrompt?.trim() ||
          (prepared.vocalMode === "instrumental"
            ? "Modern instrumental, rich arrangement, clean professional mix."
            : "Full song with vocals, modern production, clean mix, structured verses and chorus.");
        const lyriaInput =
          prepared.vocalMode === "instrumental"
            ? `${stylePrompt}\n\nInstrumental only — no vocals, no singing, no spoken words, no humming.`
            : prepared.vocalMode === "random"
              ? `${stylePrompt}\n\nWrite and sing your own original lyrics that fit this style.`
              : `${stylePrompt}\n\nSing these exact lyrics, word for word:\n${prepared.text}`;
        const lyriaStartedAt = performance.now();
        const lyria = await generateLyriaAudio(lyriaInput);
        const lyriaDurationMs = Math.round(performance.now() - lyriaStartedAt);
        req.log.info({ jobId, durationMs: lyriaDurationMs }, "[generation] Lyria completed");
        await db.update(masterJobsTable).set({
          requestConfig: {
            title: prepared.body.title ?? null,
            artistName: prepared.body.artistName ?? null,
            stylePrompt,
            vocalMode: prepared.vocalMode,
            durationS: prepared.body.durationS ?? null,
            creditReference: prepared.creditReference,
            creditsSpent: prepared.creditsSpent,
            lyrics: prepared.vocalMode === "lyrics" ? prepared.text : (lyria.responseLyrics ?? null),
            origin,
          },
        }).where(eq(masterJobsTable.id, jobId));
        publishGenerationJobEvent({
          jobId,
          status: "processing",
          stage: "generating_lyria",
          progress: 20,
        });

        if (prepared.vocalMode === "instrumental") {
          // No voice work needed — master directly and finish inline.
          const result = await runGeneration(prepared);
          await db.update(masterJobsTable).set({
            status: "completed",
            stage: "done",
            progress: 100,
            outputObjectKey: result.trackId,
            outputUrl: `/api/tracks/${result.trackId}/stream`,
            completedAt: new Date(),
          }).where(eq(masterJobsTable.id, jobId));
          publishGenerationJobEvent({
            jobId,
            status: "completed",
            stage: "done",
            progress: 100,
            outputObjectKey: result.trackId,
            outputUrl: `/api/tracks/${result.trackId}/stream`,
          });
          return;
        }

        await dispatchGeneration({ jobId, audio: lyria.audio, config: {
          title: prepared.body.title ?? null,
          artistName: prepared.body.artistName ?? null,
          stylePrompt,
          vocalMode: prepared.vocalMode,
          creditReference: prepared.creditReference,
          creditsSpent: prepared.creditsSpent,
          lyrics: prepared.vocalMode === "lyrics" ? prepared.text : (lyria.responseLyrics ?? null),
          origin,
        } });
      } catch (err) {
        req.log.error({ err, jobId }, "MLK V4 background generation failed");
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
        publishGenerationJobEvent({
          jobId,
          status: "failed",
          stage: "failed",
          error: userFacingGenerationError(message).error,
        });
      }
    })();
  },
);

function generationState(job: typeof masterJobsTable.$inferSelect): GenerationJobState & {
  current_stage?: number;
  progress_percent?: number;
  final_master_wav_url?: string | null;
  final_master_mp3_url?: string | null;
} {
  if (job.status === "completed") {
    return {
      id: job.id,
      status: "ready",
      jobId: job.id,
      current_stage: 3,
      progress_percent: 100,
      trackId: job.outputObjectKey,
      streamUrl: job.outputUrl,
      final_master_wav_url: job.outputUrl,
      final_master_mp3_url: job.outputUrl,
    };
  }
  if (job.status === "failed") {
    return { status: "failed", jobId: job.id, error: job.error ?? "Generation failed." };
  }
  return {
    id: job.id,
    status: job.status === "queued" ? "queued" : "processing",
    jobId: job.id,
    current_stage: job.stage === "processing_demucs" ? 1 : job.stage === "processing_rvc" ? 2 : 3,
    progress_percent: job.progress,
    stage: job.stage,
    progress: job.progress,
  };
}

/**
 * GET /api/tracks/:id/events — live generation stage events.
 * Every event is emitted after a durable job transition; there is no client
 * timer that invents progress.
 */
mlkGenerateRouter.get("/tracks/:id/events", async (req: Request, res: Response) => {
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

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: GenerationJobState): void => {
    if (!res.writableEnded && !res.destroyed) {
      res.write(`event: job\ndata: ${JSON.stringify(event)}\n\n`);
    }
  };
  const initial = generationState(job);
  send(initial);
  if (initial.status === "ready" || initial.status === "failed") {
    res.end();
    return;
  }

  let current = initial;
  const unsubscribe = subscribeToGenerationJob(jobId, (event) => {
    const merged = {
      ...current,
      ...(typeof event.status === "string" ? { status: event.status === "completed" ? "ready" : event.status } : {}),
      ...(typeof event.stage === "string" ? { stage: event.stage } : {}),
      ...(typeof event.progress === "number" ? { progress: event.progress, progress_percent: event.progress } : {}),
      ...(typeof event.error === "string" ? { error: event.error } : {}),
      ...(event.outputObjectKey ? { trackId: event.outputObjectKey } : {}),
      ...(event.outputUrl ? { streamUrl: event.outputUrl, final_master_wav_url: event.outputUrl, final_master_mp3_url: event.outputUrl } : {}),
      ...(event.status === "completed" ? { status: "ready", current_stage: 3, progress: 100, progress_percent: 100 } : {}),
    } as GenerationJobState & { progress_percent?: number; current_stage?: number };
    current = merged;
    send(merged);
    if (merged.status === "ready" || merged.status === "failed") {
      unsubscribe();
      res.end();
    }
  });
  const keepAlive = setInterval(() => {
    if (res.writableEnded || res.destroyed) return;
    res.write(": keep-alive\n\n");
  }, 15_000);
  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

/**
 * GET /api/tracks/:id/status — generation job status compatibility endpoint.
 * Returns processing | ready | failed. On ready, includes the track id and
 * internal stream URL. Only the job owner (or admin automation) may read it.
 */
mlkGenerateRouter.get(["/tracks/:id/status", "/jobs/:id"], async (req: Request, res: Response) => {
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

  res.json(generationState(job));
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
      req.log.error({ err }, "MLK V4 generate-master failed");
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
 * POST /api/mlk/v4/remix and /api/tracks/remix — MLK V4 Remix Engine.
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
  certify?: boolean;
}

interface PreparedRemix {
  userId: string;
  parentTrackId: string;
  twist: string;
  vocalsOn: boolean;
  artistName?: string;
  certify: boolean;
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
    certify: body.certify === true,
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
  ["/tracks/remix"],
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
        certify: prepared.certify,
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
        publishGenerationJobEvent({
          jobId,
          status: "processing",
          stage: "processing_demucs",
          progress: 25,
        });
        await db.update(masterJobsTable).set({
          stage: "processing_rvc",
          progress: 60,
        }).where(eq(masterJobsTable.id, jobId));
        publishGenerationJobEvent({
          jobId,
          status: "processing",
          stage: "processing_rvc",
          progress: 60,
        });
        const result = await remixTrack(prepared.parentTrackId, prepared.userId, {
          twist: prepared.twist,
          vocalsOn: prepared.vocalsOn,
          artistName: prepared.artistName,
          certify: prepared.certify,
        });
        await db.update(masterJobsTable).set({
          stage: "processing_mlk_master",
          progress: 85,
        }).where(eq(masterJobsTable.id, jobId));
        publishGenerationJobEvent({
          jobId,
          status: "processing",
          stage: "processing_mlk_master",
          progress: 85,
        });
        await db.update(masterJobsTable).set({
          status: "completed",
          stage: "done",
          progress: 100,
          outputObjectKey: result.trackId,
          outputUrl: `/api/tracks/${result.trackId}/stream`,
          requestConfig: {
            remixOf: prepared.parentTrackId,
            vocalsOn: prepared.vocalsOn,
            certify: prepared.certify,
            certificationStatus: result.certificationStatus,
            certId: result.certId,
            creditReference: prepared.creditReference,
          },
          completedAt: new Date(),
        }).where(eq(masterJobsTable.id, jobId));
        publishGenerationJobEvent({
          jobId,
          status: "completed",
          stage: "done",
          progress: 100,
          outputObjectKey: result.trackId,
          outputUrl: `/api/tracks/${result.trackId}/stream`,
        });
      } catch (err) {
        req.log.error({ err, jobId }, "MLK V4 background remix failed");
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
        publishGenerationJobEvent({
          jobId,
          status: "failed",
          stage: "failed",
          error: userFacingGenerationError(message).error,
        });
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
        certify: prepared.certify,
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
      req.log.error({ err }, "MLK V4 remix failed");
      const friendly = userFacingGenerationError(message);
      res.status(friendly.status).json({ error: friendly.error, ...(friendly.code ? { code: friendly.code } : {}) });
    }
  },
);

export { mlkGenerateRouter };
