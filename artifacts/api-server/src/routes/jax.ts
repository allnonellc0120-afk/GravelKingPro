import { Router, type Request, type Response } from "express";
import { generateVertexText, isVertexConfigured } from "../geminiVertex";
import { rateLimit } from "../lib/rateLimiter";
import { isAdminAutomationAuthenticated, requireAdmin } from "../lib/adminAuth";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { randomUUID } from "crypto";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { db, tracksTable, purchasedTracksTable } from "@workspace/db";
import { ObjectStorageService, saveObjectWithFallback } from "../lib/objectStorage";
import {
  buildCoverArgs,
  buildGeneratedAudioKeys,
  buildGeneratedPreviewArgs,
  saveGeneratedAudioArtifacts,
} from "../services/mlkOrchestrator";
import { CREDIT_COSTS, grantCredits, resolveCreditUser, spendCredits } from "../lib/credits";
import {
  getJaxSession,
  listJaxSessions,
  saveJaxSession,
  type JaxAuthorshipEntry,
  type JaxSessionMessage,
} from "../lib/firestore";
import { authorshipScore } from "@workspace/authorship";

const execFileAsync = promisify(execFileCb);
const objectStorage = new ObjectStorageService();

const jaxRouter = Router();
const connectors = new ReplitConnectors();
const DAILY_FREE_LIMIT = 5;
const DAILY_TTS_LIMIT = 30;
const usage = new Map<string, { day: string; count: number }>();
const ttsUsage = new Map<string, { day: string; count: number }>();
const elevenLabs = new ReplitConnectors();
const GEORGE_PREMADE_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export function configuredAdminVoiceLabel() {
  return JAX_VOICE_PRESETS.admin.voiceId() === GEORGE_PREMADE_VOICE_ID
    ? "George (Premade)"
    : "Admin Configured Voice";
}

export function getConfiguredAdminVoiceDiagnostic() {
  const configuredVoiceId = JAX_VOICE_PRESETS.admin.voiceId();
  const isGeorgePremade = configuredVoiceId === GEORGE_PREMADE_VOICE_ID;
  return {
    configuredVoiceId,
    resolvedLabel: isGeorgePremade ? "George (Premade)" : "Admin Configured Voice",
    isGeorgePremade,
  };
}

export const JAX_VOICE_PRESETS = {
  admin: { label: configuredAdminVoiceLabel, voiceId: () => process.env.JAX_VOICE_ID?.trim() ?? "" },
  adam: { label: "JAX Baritone (Deep & Resonant)", voiceId: () => "pNInz6obpgDQGcFmaJgB" },
  callum: { label: "JAX Gritty Blues / Rough", voiceId: () => "N2lVS1w4EtoT3dr4eOWO" },
  antoni: { label: "JAX Smooth Studio / Conversational", voiceId: () => "ErXwobaYiN019PkySvjV" },
  josh: { label: "JAX Heavy Low-End / Narrator", voiceId: () => "TxGEqnHWrfWFTfGW9XjX" },
  bill: { label: "JAX Classic Vintage", voiceId: () => "pqHfZKP75CvOlQylNhV4" },
} as const;

export function getJaxVoiceMetadata() {
  return Object.entries(JAX_VOICE_PRESETS).map(([key, preset]) => ({
    key,
    voiceId: key === "admin" ? "admin" : preset.voiceId(),
    label: key === "admin" ? JAX_VOICE_PRESETS.admin.label() : String(preset.label),
  })).filter((preset) => preset.key !== "admin" || Boolean(JAX_VOICE_PRESETS.admin.voiceId()));
}

jaxRouter.get("/jax/voices", (_req: Request, res: Response) => {
  res.json({ voices: getJaxVoiceMetadata() });
});

/** GET /api/admin/jax/voice-config — admin-only release/configuration check. */
jaxRouter.get("/admin/jax/voice-config", async (req: Request, res: Response) => {
  if (!await requireAdmin(req, res)) return;
  res.json(getConfiguredAdminVoiceDiagnostic());
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
  saveJaxSession(payload, sessionId);
  res.json({ ok: true, sessionId });
});

jaxRouter.post("/jax/generate", rateLimit({ windowMs: 60_000, max: 12 }), async (req: Request, res: Response) => {
  const adminBypass = isAdminAutomationAuthenticated(req);
  const user = req.dbUser;
  if (!user && !adminBypass) {
    res.status(401).json({ error: "Sign in to chat with JAX." });
    return;
  }
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
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

  const artistProfile = req.body?.artistProfile && typeof req.body.artistProfile === "object"
    ? JSON.stringify(req.body.artistProfile).slice(0, 6000)
    : "{}";
  const system = `You are JAX, GravelKing's conversational songwriting companion. Be warm, empathetic, grounded, and direct. Remember the artist's story and respond like a trusted studio partner. You can answer brief questions about rhymes, facts, references, and song context, using web grounding when current or factual information would help.

Keep normal conversation and life talk outside lyric blocks. Whenever you write or revise lyrics, put ONLY the lyric lines inside one clean Markdown block labeled lyrics:
\`\`\`lyrics
lyric lines here
\`\`\`
Never put lyric lines in surrounding prose, and never use raw multi-line lyrics outside a code block. If the artist dictates exact words or asks to change a specific line, preserve those words exactly and treat them as human-authored. The artist memory JSON below is preference context, not a request to reveal private data.

Artist memory JSON:
${artistProfile}`;
  const history = Array.isArray(req.body?.history)
    ? req.body.history
        .filter((m: any) => m && typeof m.content === "string" && (m.role === "user" || m.role === "jax"))
        .slice(-12)
        .map((m: any) => `${m.role === "user" ? "Artist" : "JAX"}: ${m.content.slice(0, 2000)}`)
        .join("\n")
    : "";
  const fullPrompt = `${system}${history ? `\n\nConversation so far:\n${history}\n` : ""}\nArtist: ${prompt}\nJAX:`;
  try {
    let text = "";
    if (isVertexConfigured()) {
      try {
        text = await generateVertexText(fullPrompt, {
          maxOutputTokens: 2048,
          responseMimeType: "text/plain",
          tools: [{ googleSearch: {} }],
        });
      } catch (vertexError) {
        req.log.warn({ err: vertexError }, "JAX grounded Vertex call failed; retrying without search");
      }
      if (!text.trim()) {
        try {
          // A grounded request can occasionally fail independently of the text
          // model. Retrying the same live prompt keeps JAX useful without ever
          // substituting a canned answer.
          text = await generateVertexText(fullPrompt, {
            maxOutputTokens: 2048,
            responseMimeType: "text/plain",
          });
        } catch (retryError) {
          req.log.warn({ err: retryError }, "JAX fallback Vertex call failed");
        }
      }
    }
    if (!text.trim()) throw new Error("No text provider returned a response");
    res.json({ text: text.trim(), remaining: unlimited ? null : DAILY_FREE_LIMIT - count - 1 });
  } catch (error) {
    req.log.error({ error }, "JAX generation failed");
    res.status(503).json({ error: "JAX could not reach the writing service right now. Your prompt and draft are still safe; please try again shortly." });
  }
});

/**
 * POST /api/jax/generate-music — ElevenLabs music generator, a second engine
 * alongside the Vertex/Lyria path in /api/mlk/v35/generate-master.
 * Gated to Pro/King (monthly/node_auditor) tiers with admin bypass.
 * Client smart-fills missing lyrics/style via /api/jax/generate first; this
 * route composes the final prompt and streams back an MP3 take.
 */
const musicUsage = new Map<string, { day: string; count: number }>();
const DAILY_MUSIC_LIMIT = 10;

jaxRouter.post("/jax/generate-music", rateLimit({
  windowMs: 10 * 60_000,
  max: 5,
  message: "Too many music generations. Please wait a few minutes and try again.",
}), async (req: Request, res: Response) => {
  const adminBypass = isAdminAutomationAuthenticated(req);
  const user = req.dbUser;
  if (!user && !adminBypass) {
    res.status(401).json({ error: "Sign in to generate music with ElevenLabs." });
    return;
  }

  const musicKey = adminBypass ? `admin:${req.ip}` : `user:${user?.id}`;
  const today = dayKey();
  const priorMusic = musicUsage.get(musicKey);
  const musicCount = priorMusic?.day === today ? priorMusic.count : 0;
  if (!adminBypass && user?.isDeveloper !== true && musicCount >= DAILY_MUSIC_LIMIT) {
    res.status(429).json({ error: "Your daily ElevenLabs generations are used. Try again tomorrow." });
    return;
  }

  const lyrics = typeof req.body?.lyrics === "string" ? req.body.lyrics.trim() : "";
  const style = typeof req.body?.style === "string" ? req.body.style.trim() : "";
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
  if (!lyrics && !style) {
    res.status(400).json({ error: "Provide lyrics or a style so ElevenLabs knows what to write." });
    return;
  }

  const creditUser = adminBypass ? null : await resolveCreditUser(req);
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
    const promptParts: string[] = [];
    if (style) promptParts.push(`Musical style: ${style}.`);
    if (title) promptParts.push(`Song title: ${title}.`);
    if (lyrics) promptParts.push(`Sing these original lyrics:\n${lyrics.slice(0, 4000)}`);
    const response = await elevenLabs.proxy("elevenlabs", "/v1/music", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        prompt: promptParts.join("\n\n").slice(0, 6000),
        music_length_ms: 120_000,
        model_id: "music_v1",
      }),
    });
    if (!response.ok) {
      if (creditsSpent && creditUser) {
        await grantCredits(creditUser.id, CREDIT_COSTS.song, "failed_song_refund", `refund:${creditReference}`);
      }
      req.log.warn({ status: response.status }, "ElevenLabs music generation rejected request");
      res.status(502).json({ error: "JAX could not finish this take. Adjust the lyrics or style and try again." });
      return;
    }

    const mp3 = Buffer.from(await response.arrayBuffer());
    const trackTitle = title || "JAX Take";

    // Save the take to the user's vault so it behaves like every other
    // library track — playable in-app, and openable in the Mastering tool
    // via ?gkTrack=<id> (the MLK pipeline does the same).
    const trackId = randomUUID();
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
    // Convention (see mlkOrchestrator): audioFullKey names the WAV slot; the
    // full MP3 sits beside it with the same basename. The stream/download
    // routes derive the .mp3 key from audioFullKey, so no schema change.
    const { audioFullKey, audioFullMp3Key, audioPreviewKey } = buildGeneratedAudioKeys(trackId);
    const coverArtKey = `tracks/${trackId}/cover_art.png`;
    const coverPath = join(tmpdir(), `jax-cover-${trackId}.png`);
    const fullPath = join(tmpdir(), `jax-take-${trackId}.mp3`);
    const fullWavPath = join(tmpdir(), `jax-take-${trackId}.wav`);
    const previewPath = join(tmpdir(), `jax-preview-${trackId}.mp3`);
    await writeFile(fullPath, mp3);
    // Public namespace gets ONLY a 30-sec preview (same contract as the MLK
    // path) — the full take stays under the private, ownership-gated key.
    await Promise.all([
      execFileAsync("ffmpeg", buildGeneratedPreviewArgs(fullPath, previewPath), { timeout: 60_000 }),
      execFileAsync("ffmpeg", ["-y", "-i", fullPath, "-c:a", "pcm_s16le", fullWavPath], { timeout: 60_000 }),
      execFileAsync("ffmpeg", buildCoverArgs(trackId, trackTitle, coverPath), { timeout: 30_000 }),
    ]);
    await saveGeneratedAudioArtifacts(
      {
        bucketId,
        keys: { audioFullKey, audioFullMp3Key, audioPreviewKey },
        fullWav: await readFile(fullWavPath),
        fullMp3: mp3,
        previewMp3: await readFile(previewPath),
        coverArt: await readFile(coverPath),
      },
      {
        savePrivate: (id, key, body, contentType) => saveObjectWithFallback(id, key, body, { contentType }),
        savePublic: (key, body, contentType) => objectStorage.savePublicObject(key, body, contentType),
      },
    );
    await Promise.all([unlink(fullPath), unlink(fullWavPath), unlink(previewPath), unlink(coverPath)]).catch(() => {});
    await db.transaction(async (tx) => {
      await tx.insert(tracksTable).values({
        id: trackId,
        title: trackTitle,
        artistName: "JAX",
        audioFullKey,
        audioPreviewKey,
        coverArtKey,
        // PRIVATE: generated takes land ONLY in the creator's library.
        status: "private",
        price: 0,
        submittedByUserId: user?.id ?? null,
        lyricsText: lyrics || null,
      });
      if (user?.id) {
        await tx.insert(purchasedTracksTable).values({
          userId: user.id,
          trackId,
          stripeCheckoutSessionId: `jax-music-${trackId}`,
        });
      }
    });
    res.json({ success: true, trackId, title: trackTitle });
  } catch (error) {
    if (creditsSpent && creditUser) {
      await grantCredits(creditUser.id, CREDIT_COSTS.song, "failed_song_refund", `refund:${creditReference}`);
    }
    req.log.error({ error }, "ElevenLabs music generation failed");
    res.status(502).json({ error: "JAX music generation is temporarily unavailable." });
  }
});

jaxRouter.post("/jax/tts", rateLimit({
  windowMs: 60_000,
  max: 6,
  message: "Too many voice playback requests. Please wait a moment and try again.",
}), async (req: Request, res: Response) => {
  const adminBypass = isAdminAutomationAuthenticated(req);
  if (!req.dbUser && !adminBypass) {
    res.status(401).json({ error: "Sign in to use JAX voice playback." });
    return;
  }
  const ttsKey = adminBypass ? `admin:${req.ip}` : `user:${req.dbUser?.id}`;
  const today = dayKey();
  const priorTts = ttsUsage.get(ttsKey);
  const ttsCount = priorTts?.day === today ? priorTts.count : 0;
  if (ttsCount >= DAILY_TTS_LIMIT) {
    res.status(429).json({ error: "Your daily JAX voice playback limit is used. Try again tomorrow." });
    return;
  }
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const requestedVoiceId = typeof req.body?.voiceId === "string" ? req.body.voiceId.trim() : "";
  const voiceId = requestedVoiceId === "admin" ? JAX_VOICE_PRESETS.admin.voiceId() : requestedVoiceId;
  const allowedVoiceIds = Object.values(JAX_VOICE_PRESETS).map((preset) => preset.voiceId()).filter(Boolean);
  if (!text || text.length > 10_000) {
    res.status(400).json({ error: "Text must be between 1 and 10,000 characters." });
    return;
  }
  if (!voiceId || !allowedVoiceIds.includes(voiceId)) {
    res.status(400).json({ error: "Select a supported male JAX voice preset." });
    return;
  }
  ttsUsage.set(ttsKey, { day: today, count: ttsCount + 1 });
  try {
    const response = await connectors.proxy("elevenlabs", `/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", output_format: "mp3_44100_128" }),
    });
    if (!response.ok) {
      req.log.warn({ status: response.status, voiceId }, "JAX TTS provider rejected request");
      res.status(502).json({ error: "JAX voice provider rejected this playback request." });
      return;
    }
    res.type("audio/mpeg").send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    req.log.error({ error }, "JAX TTS request failed");
    res.status(502).json({ error: "JAX voice playback is temporarily unavailable." });
  }
});

export default jaxRouter;
