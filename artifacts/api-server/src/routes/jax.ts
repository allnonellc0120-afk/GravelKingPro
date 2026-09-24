import { Router, type Request, type Response } from "express";
import { buildJaxSystemPrompt, classifyJaxIntent } from "../prompts/jaxSystem";
import { getAdminRuntimeConfig } from "../lib/adminRuntimeConfig";
import { rateLimit } from "../lib/rateLimiter";
import {
  beginTokenTracking,
  getTokenTelemetryLedgerSummary,
  tokenTrackerMiddleware,
  type TokenTracker,
} from "../middleware/tokenTracker";
import {
  ADMIN_AUTOMATION_EMAIL,
  isAdminAutomationAuthenticated,
  requireAdmin,
} from "../lib/adminAuth";
import { randomUUID, timingSafeEqual } from "crypto";
import { db, artistProfilesTable, usersTable, type User } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { generateAndMasterTrack } from "../services/mlkOrchestrator";
import {
  getObjectFileWithFallback,
} from "../lib/objectStorage";
import {
  buildSignedRvcModelStreamUrl,
  resolveRvcModelOrigin,
  GRAVELKING_RVC_MODEL_FILENAME,
  LEGACY_GRAVELKING_RVC_MODEL_FILENAME,
  rvcModelStreamSignature,
} from "../services/rvcModelAccess";
import { CREDIT_COSTS, grantCredits, resolveCreditUser, spendCredits } from "../lib/credits";
import {
  getJaxSession,
  listJaxSessions,
  saveJaxSession,
  deleteJaxSession,
  type JaxAuthorshipEntry,
  type JaxSessionMessage,
} from "../lib/firestore";
import { authorshipScore } from "@workspace/authorship";
import { zipSync } from "fflate";
import { generateWithMlkPython } from "../services/mlkPythonClient";
import { generateVertexTextWithTrace, isVertexConfigured } from "../geminiVertex";
const jaxRouter = Router();
const DAILY_FREE_LIMIT = 5;
const usage = new Map<string, { day: string; count: number }>();
const ARTIST_PROFILE_FIELDS = [
  "bio", "genre", "subGenres", "tempo", "stylisticRules", "lifeEvents",
  "emotionalHistory", "storytellingThemes", "lyricalCadence", "vocalStyle",
  "vocabularyHabits",
] as const;

async function resolveJaxUser(req: Request, adminBypass: boolean): Promise<User | null> {
  if (req.dbUser) return req.dbUser;
  if (!adminBypass) return null;
  const [adminUser] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = lower(${ADMIN_AUTOMATION_EMAIL})`)
    .limit(1);
  return adminUser ?? null;
}

function writeSse(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

jaxRouter.get(
  "/jax/rvc-model/:expiresAt/:signature/:filename",
  async (req: Request, res: Response) => {
    if (
      req.params.filename !== GRAVELKING_RVC_MODEL_FILENAME &&
      req.params.filename !== LEGACY_GRAVELKING_RVC_MODEL_FILENAME
    ) {
      res.status(404).end();
      return;
    }
    const expiresAt = Number(req.params.expiresAt);
    if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
      res.status(403).json({ error: "Model URL expired" });
      return;
    }
    const expected = Buffer.from(rvcModelStreamSignature(expiresAt));
    const signatureParam = req.params.signature;
    const supplied = Buffer.from(
      Array.isArray(signatureParam) ? (signatureParam[0] ?? "") : (signatureParam ?? ""),
    );
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      res.status(403).json({ error: "Invalid model URL signature" });
      return;
    }
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
    const [weightsFile, indexFile] = await Promise.all([
      getObjectFileWithFallback(bucketId, getAdminRuntimeConfig().rvc.modelKey),
      getObjectFileWithFallback(bucketId, getAdminRuntimeConfig().rvc.indexKey),
    ]);
    if (!weightsFile || !indexFile) {
      res.status(404).json({ error: "RVC model package is incomplete" });
      return;
    }
    const [[weights], [index]] = await Promise.all([
      weightsFile.download(),
      indexFile.download(),
    ]);
    const archive = Buffer.from(zipSync({
      "gravelking_v2.pth": new Uint8Array(weights),
      "gravelking_v2.index": new Uint8Array(index),
    }, { level: 0 }));
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Length", String(archive.length));
    res.setHeader("Content-Disposition", `attachment; filename="${GRAVELKING_RVC_MODEL_FILENAME}"`);
    res.end(archive);
  },
);

function profileResponse(profile: typeof artistProfilesTable.$inferSelect | null) {
  return profile ?? {
    memoryEnabled: true,
    bio: "",
    genre: "",
    subGenres: "",
    tempo: "",
    stylisticRules: "",
    lifeEvents: "",
    emotionalHistory: "",
    storytellingThemes: "",
    lyricalCadence: "",
    vocalStyle: "",
    vocabularyHabits: "",
  };
}
export function configuredAdminVoiceLabel() {
  return "JAX GravelKing Outlaw Baritone (MLK/RVC)";
}

export function getConfiguredAdminVoiceDiagnostic() {
  return {
    configuredVoiceId: "gravelking_outlaw_baritone",
    resolvedLabel: configuredAdminVoiceLabel(),
    pipeline: "MLK/RVC native inference",
    engine: "Morris Law Kernel V2",
  };
}

export const JAX_VOICE_PRESETS = {
  gravelking_outlaw_baritone: {
    presetId: "gravelking_outlaw_baritone",
    label: configuredAdminVoiceLabel(),
    voiceId: () => "gravelking_outlaw_baritone",
    pipeline: "MLK/RVC native inference",
  },
} as const;

export function getJaxVoiceMetadata() {
  return Object.entries(JAX_VOICE_PRESETS).map(([key, preset]) => ({
    key,
    voiceId: preset.voiceId(),
    label: String(preset.label),
    pipeline: preset.pipeline,
    engine: "Morris Law Kernel V2",
  }));
}

jaxRouter.get("/jax/voice-registry", (_req: Request, res: Response) => {
  res.json({
    engine: "Morris Law Kernel V2",
    pipeline: "MLK/RVC native inference",
    defaultVoice: "gravelking_outlaw_baritone",
    voiceAsset: "gravelking_outlaw_baritone.zip",
    voices: getJaxVoiceMetadata(),
  });
});

jaxRouter.get("/jax/voices", (_req: Request, res: Response) => {
  res.json({ voices: getJaxVoiceMetadata() });
});

jaxRouter.get("/jax/artist-profile", async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ error: "Sign in to manage your artist memory." });
    return;
  }
  const [profile] = await db
    .select()
    .from(artistProfilesTable)
    .where(eq(artistProfilesTable.userId, req.dbUser.id))
    .limit(1);
  res.json({ profile: profileResponse(profile ?? null) });
});

jaxRouter.put("/jax/artist-profile", async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ error: "Sign in to manage your artist memory." });
    return;
  }
  const body = req.body ?? {};
  const values = Object.fromEntries(ARTIST_PROFILE_FIELDS.map((field) => [
    field,
    typeof body[field] === "string" ? body[field].slice(0, 12_000) : "",
  ])) as Record<string, string>;
  const memoryEnabled = body.memoryEnabled !== false;
  const [profile] = await db
    .insert(artistProfilesTable)
    .values({ userId: req.dbUser.id, memoryEnabled, ...values })
    .onConflictDoUpdate({
      target: artistProfilesTable.userId,
      set: { memoryEnabled, ...values, updatedAt: new Date() },
    })
    .returning();
  res.json({ profile: profileResponse(profile ?? null) });
});

jaxRouter.delete("/jax/artist-profile", async (req: Request, res: Response) => {
  if (!req.dbUser) {
    res.status(401).json({ error: "Sign in to manage your artist memory." });
    return;
  }
  await db.delete(artistProfilesTable).where(eq(artistProfilesTable.userId, req.dbUser.id));
  res.json({ ok: true });
});

/** GET /api/admin/jax/voice-config — admin-only release/configuration check. */
jaxRouter.get("/admin/jax/voice-config", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  res.json(getConfiguredAdminVoiceDiagnostic());
});

/** Development-only Vertex allowlist proxy smoke call; never exposed in production. */
jaxRouter.post("/admin/jax/vertex-proxy-smoke", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== "development") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!await requireAdmin(req, res)) return;
  if (!isVertexConfigured()) {
    res.status(503).json({ error: "Vertex is not configured" });
    return;
  }
  const prompt = typeof req.body?.prompt === "string" && req.body.prompt.trim()
    ? req.body.prompt.trim().slice(0, 2_000)
    : "Return exactly: GK_PROXY_SMOKE_OK";
  try {
    const result = await generateVertexTextWithTrace(prompt, {
      maxOutputTokens: 16,
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    });
    if (!result.traceId) {
      res.status(502).json({ error: "Vertex response did not include an interception trace ID" });
      return;
    }
    res.json({ ok: true, text: result.text, traceId: result.traceId });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    req.log.error({ err: error, detail }, "Vertex allowlist proxy smoke failed");
    res.status(502).json({ error: "Vertex allowlist proxy smoke failed" });
  }
});

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function currentUserId(req: Request): string | null {
  return req.dbUser?.id ?? null;
}

function cleanMessages(value: unknown): JaxSessionMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message: any) => message && (message.role === "user" || message.role === "jax") && typeof message.content === "string")
    .slice(-80)
    .map((message: any) => ({
      id: typeof message.id === "string" ? message.id : randomUUID(),
      role: message.role,
      content: message.content.slice(0, 12_000),
      createdAt: typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString(),
      ...(Array.isArray(message.explicitHumanText)
        ? {
            explicitHumanText: message.explicitHumanText
              .filter((text: unknown): text is string => typeof text === "string")
              .slice(0, 20),
          }
        : {}),
    }));
}

function cleanLedger(value: unknown): JaxAuthorshipEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry: any) => entry && (entry.source === "human" || entry.source === "ai") && typeof entry.text === "string")
    .slice(0, 500)
    .map((entry: any) => ({
      text: entry.text.slice(0, 4_000),
      source: entry.source,
      start: Number.isFinite(entry.start) ? entry.start : 0,
      end: Number.isFinite(entry.end) ? entry.end : 0,
      rationale: entry.rationale === "explicit-dictation" || entry.rationale === "human-edit"
        ? entry.rationale
        : "ai-generation",
    }));
}

function sessionPayload(req: Request) {
  const body = req.body ?? {};
  const messages = cleanMessages(body.messages);
  const finalText = typeof body.finalText === "string" ? body.finalText.slice(0, 30_000) : "";
  const aiDraft = typeof body.aiDraft === "string" ? body.aiDraft.slice(0, 30_000) : "";
  return {
    userId: currentUserId(req) as string,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : "Untitled song",
    messages,
    aiDraft,
    finalText,
    authorshipScore: Math.max(0, Math.min(100, Number(body.authorshipScore) || authorshipScore(aiDraft, finalText))),
    authorshipLedger: cleanLedger(body.authorshipLedger),
  };
}

jaxRouter.get("/jax/sessions", async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to view JAX sessions." });
    return;
  }
  res.json({ sessions: await listJaxSessions(userId) });
});

jaxRouter.get("/jax/sessions/:sessionId", async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to view this JAX session." });
    return;
  }
  const sessionId = String(req.params.sessionId);
  const session = await getJaxSession(userId, sessionId);
  if (!session) {
    res.status(404).json({ error: "JAX session not found." });
    return;
  }
  res.json({ session });
});

jaxRouter.put("/jax/sessions/:sessionId", async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to save JAX sessions." });
    return;
  }
  const sessionId = String(req.params.sessionId);
  const existing = await getJaxSession(userId, sessionId);
  if (!existing && req.body?.sessionId !== sessionId) {
    res.status(404).json({ error: "JAX session not found." });
    return;
  }
  const payload = sessionPayload(req);
  await saveJaxSession(payload, sessionId);
  res.json({ ok: true, sessionId });
});

jaxRouter.delete("/jax/sessions/:sessionId", async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to delete JAX sessions." });
    return;
  }
  const deleted = await deleteJaxSession(userId, String(req.params.sessionId));
  if (!deleted) {
    res.status(404).json({ error: "JAX session not found." });
    return;
  }
  res.json({ ok: true });
});

jaxRouter.get("/jax/telemetry/ledger", async (req: Request, res: Response) => {
  const adminBypass = isAdminAutomationAuthenticated(req);
  const authenticatedClientId = req.dbUser?.id;
  const requestedClientId =
    typeof req.query.clientId === "string" ? req.query.clientId.trim() : "";

  if (!adminBypass && !authenticatedClientId) {
    res.status(401).json({ error: "Sign in to view token telemetry." });
    return;
  }
  if (
    requestedClientId &&
    !adminBypass &&
    requestedClientId !== authenticatedClientId
  ) {
    res.status(403).json({ error: "You may only view your own token telemetry." });
    return;
  }

  try {
    const clientId = requestedClientId || authenticatedClientId;
    const summary = await getTokenTelemetryLedgerSummary(clientId);
    res.json(summary);
  } catch (error) {
    req.log.error({ error }, "Token telemetry ledger read failed");
    res.status(500).json({ error: "Token telemetry ledger is unavailable." });
  }
});

jaxRouter.post(
  ["/jax/generate", "/chat/jax"],
  rateLimit({ windowMs: 60_000, max: 12 }),
  tokenTrackerMiddleware,
  async (req: Request, res: Response) => {
  const adminBypass = isAdminAutomationAuthenticated(req);
  const user = await resolveJaxUser(req, adminBypass);
  if (!user && !adminBypass) {
    res.status(401).json({ error: "Sign in to chat with JAX." });
    return;
  }
  const prompt = typeof req.body?.message === "string"
    ? req.body.message.trim()
    : typeof req.body?.prompt === "string"
      ? req.body.prompt.trim()
      : "";
  const isExplicit = req.body?.is_explicit === true;
  if (!prompt) {
    res.status(400).json({ error: "Tell JAX what you want to write." });
    return;
  }

  const unlimited = adminBypass || user?.isDeveloper === true || user?.subscriptionTier === "monthly" || user?.subscriptionTier === "node_auditor";
  const key = adminBypass ? "admin-key-bypass" : String(user?.id);
  const today = dayKey();
  const prior = usage.get(key);
  const count = prior?.day === today ? prior.count : 0;
  if (!unlimited && count >= DAILY_FREE_LIMIT) {
    res.status(429).json({ error: "Your 5 free JAX prompts for today are used. Upgrade for unlimited studio writing.", remaining: 0 });
    return;
  }
  if (!unlimited) usage.set(key, { day: today, count: count + 1 });

  const [artistProfileRow] = user
    ? await db.select().from(artistProfilesTable).where(eq(artistProfilesTable.userId, user.id)).limit(1)
    : [];
  const rawArtistProfile = artistProfileRow?.memoryEnabled
    ? JSON.stringify({
        bio: artistProfileRow.bio,
        genre: artistProfileRow.genre,
        subGenres: artistProfileRow.subGenres,
        tempo: artistProfileRow.tempo,
        stylisticRules: artistProfileRow.stylisticRules,
        lifeEvents: artistProfileRow.lifeEvents,
        emotionalHistory: artistProfileRow.emotionalHistory,
        storytellingThemes: artistProfileRow.storytellingThemes,
        lyricalCadence: artistProfileRow.lyricalCadence,
        vocalStyle: artistProfileRow.vocalStyle,
        vocabularyHabits: artistProfileRow.vocabularyHabits,
      })
    : "{}";
  const artistProfile = rawArtistProfile.slice(0, 24_000);
  const intent = classifyJaxIntent(prompt);
  const system = buildJaxSystemPrompt({ isExplicit, artistProfile, intent });
  const rawHistory = Array.isArray(req.body?.history)
    ? req.body.history
        .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "jax"))
        .map((m: any) => `${m.role === "user" ? "Artist" : "JAX"}: ${m.content.slice(0, 100_000)}`)
        .join("\n")
    : "";
  const history = Array.isArray(req.body?.history)
    ? req.body.history
        .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "jax"))
        .slice(-2)
        .map((m: any) => `${m.role === "user" ? "Artist" : "JAX"}: ${m.content.slice(0, 2000)}`)
        .join("\n")
    : "";
  const fullPrompt = `${system}${history ? `\n\nConversation so far:\n${history}\n` : ""}\nArtist: ${prompt}\nJAX:`;
  const operation = /\bremix\b/i.test(prompt) ? "jax_remix" : "jax_generate";
  const requestedClientId =
    typeof req.body?.clientId === "string"
      ? req.body.clientId
      : typeof req.body?.client_id === "string"
        ? req.body.client_id
        : "";
  const clientId =
    requestedClientId.trim()
      ? requestedClientId.trim().slice(0, 200)
      : user?.id ?? (adminBypass ? "admin" : undefined);
  const modelRatePerMillionUsd =
    typeof req.body?.modelRatePerMillionUsd === "number" &&
    Number.isFinite(req.body.modelRatePerMillionUsd) &&
    req.body.modelRatePerMillionUsd >= 0
      ? req.body.modelRatePerMillionUsd
      : undefined;
  const tokenTracker: TokenTracker = beginTokenTracking({
    operation,
    rawBaselineText: `${system}\n\nConversation so far:\n${rawHistory}\nArtist: ${prompt}\nJAX:`,
    actualPromptText: fullPrompt,
    maxOutputTokens: 2048,
    clientId,
    modelRatePerMillionUsd,
  });
  const wantsStream = req.body?.stream === true || req.headers.accept?.includes("text/event-stream") === true;
  try {
    let text = "";
    const remaining = unlimited ? null : DAILY_FREE_LIMIT - count - 1;
    const startedAt = Date.now();
    if (process.env.NODE_ENV === "test" && process.env.JAX_TEST_RESPONSE) {
      text = process.env.JAX_TEST_RESPONSE.trim();
    } else {
      const mlk = await generateWithMlkPython(fullPrompt);
      text = (mlk.generated_lyrics ?? mlk.output ?? "").trim();
    }
    if (!text) throw new Error("Morris Law Kernel returned no generated text");

    if (wantsStream) {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      writeSse(res, "ready", { remaining });
      writeSse(res, "token", { text });
      const durationMs = Date.now() - startedAt;
      const tokenTelemetry = tokenTracker.finish(text, { provider: "mlk_python_stream" });
      writeSse(res, "done", { remaining, durationMs, ttftMs: durationMs, ttftDeltaMs: durationMs - 45_000, tokenTelemetry });
      req.log.info({ durationMs, historyMessages: 2, engine: "mlk_python", intent }, "JAX MLK SSE generation completed");
      res.end();
      return;
    }
    const tokenTelemetry = tokenTracker.finish(text, { provider: "mlk_python" });
    res.json({ text: text.trim(), remaining, tokenTelemetry, intent });
  } catch (error) {
    tokenTracker.finish("", { provider: "mlk_python", status: "failed" });
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "JAX generation failed",
    );
    if (wantsStream && res.headersSent) {
      writeSse(res, "error", { error: "JAX could not reach the writing service right now. Your prompt and draft are still safe; please try again shortly." });
      res.end();
      return;
    }
    res.status(503).json({ error: "JAX could not reach the writing service right now. Your prompt and draft are still safe; please try again shortly." });
  }
  },
);

/**
 * POST /api/jax/generate-music — JAX's MLK primary audio path.
 *
 * This delegates to the same Vertex Lyria → GravelKing RVC → MLK vault
 * orchestrator used by the primary generation routes. There is deliberately
 * no provider fallback here.
 */
const musicUsage = new Map<string, { day: string; count: number }>();
const DAILY_MUSIC_LIMIT = 10;

jaxRouter.post("/jax/generate-music", rateLimit({
  windowMs: 10 * 60_000,
  max: 5,
  message: "Too many music generations. Please wait a few minutes and try again.",
}), async (req: Request, res: Response) => {
  const adminBypass = isAdminAutomationAuthenticated(req);
  const user = await resolveJaxUser(req, adminBypass);
  if (!user && !adminBypass) {
    res.status(401).json({ error: "Sign in to generate music with the MLK engine." });
    return;
  }

  const musicKey = adminBypass ? `admin:${req.ip}` : `user:${user?.id}`;
  const today = dayKey();
  const priorMusic = musicUsage.get(musicKey);
  const musicCount = priorMusic?.day === today ? priorMusic.count : 0;
  if (!adminBypass && user?.isDeveloper !== true && musicCount >= DAILY_MUSIC_LIMIT) {
    res.status(429).json({ error: "Your daily MLK generations are used. Try again tomorrow." });
    return;
  }

  const lyrics = typeof req.body?.lyrics === "string" ? req.body.lyrics.trim() : "";
  const lyricAudit = req.body?.lyricAudit && typeof req.body.lyricAudit === "object"
    ? req.body.lyricAudit as { finalLyricsHash?: string; authorshipScore?: number; ledger?: unknown[] }
    : null;
  const style = typeof req.body?.style === "string" ? req.body.style.trim() : "";
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
  if (!lyrics && !style) {
    res.status(400).json({ error: "Provide lyrics or a style so the MLK engine knows what to create." });
    return;
  }

  const creditUser = adminBypass ? null : await resolveCreditUser(req);
  const ownerUserId = user?.id ?? creditUser?.id;
  if (!ownerUserId) {
    res.status(403).json({ error: "A bound account is required for MLK vault generation." });
    return;
  }
  const creditReference = `song:${randomUUID()}`;
  let creditsSpent = false;
  if (!adminBypass && !creditUser?.isDeveloper) {
    const spent = await spendCredits(creditUser!.id, CREDIT_COSTS.song, "song", creditReference);
    if (!spent.ok) {
      res.status(402).json({
        error: `This song costs ${CREDIT_COSTS.song} credits. You have ${spent.balance}. Buy a credit pack to continue.`,
        code: "INSUFFICIENT_CREDITS",
        creditsRequired: CREDIT_COSTS.song,
        creditsBalance: spent.balance,
        purchaseUrl: "/pricing#credits",
      });
      return;
    }
    creditsSpent = true;
    res.setHeader("X-GK-Credits-Balance", String(spent.balance));
  }
  musicUsage.set(musicKey, { day: today, count: musicCount + 1 });
  try {
    const result = await generateAndMasterTrack(null, lyrics, ownerUserId, {
      title: title || undefined,
      artistName: "JAX",
      stylePrompt: style || undefined,
      vocalMode: lyrics ? "lyrics" : "random",
      targetDurationS: 120,
      modelWeightsUrl: buildSignedRvcModelStreamUrl(
        resolveRvcModelOrigin(`${req.protocol}://${req.get("host")}`),
        3600,
      ),
      lyricAudit: lyrics && lyricAudit?.finalLyricsHash && Array.isArray(lyricAudit.ledger)
        ? {
            finalLyricsHash: lyricAudit.finalLyricsHash,
            authorshipScore: Math.max(0, Math.min(100, Number(lyricAudit.authorshipScore) || 0)),
            ledger: lyricAudit.ledger.slice(0, 500),
          }
        : undefined,
    });
    res.json({ success: true, trackId: result.trackId, title: result.title, engine: "mlk-primary" });
  } catch (error) {
    if (creditsSpent && creditUser) {
      await grantCredits(creditUser.id, CREDIT_COSTS.song, "failed_song_refund", `refund:${creditReference}`);
    }
    req.log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "MLK primary JAX music generation failed",
    );
    res.status(502).json({ error: "JAX MLK music generation is temporarily unavailable." });
  }
});

/**
 * Text playback is intentionally not synthesized by the API server. The
 * GravelKing voice identity is produced by the MLK/RVC music pipeline, which
 * requires generated source audio; this endpoint remains explicit rather than
 * silently routing text through another provider.
 */
jaxRouter.post("/jax/tts", (_req: Request, res: Response) => {
  res.status(410).json({
    error: "JAX text playback is unavailable. Generate a track through the MLK engine.",
    code: "MLK_TRACK_AUDIO_REQUIRED",
  });
});

export default jaxRouter;
