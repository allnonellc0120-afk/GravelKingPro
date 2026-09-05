import { Router, type Request, type Response } from "express";
import { generateProxyText, isProxyConfigured } from "../geminiProxy";
import { generateVertexText, isVertexConfigured } from "../geminiVertex";
import { rateLimit } from "../lib/rateLimiter";
import { isAdminAutomationAuthenticated, requireAdmin } from "../lib/adminAuth";
import { ReplitConnectors } from "@replit/connectors-sdk";

const jaxRouter = Router();
const connectors = new ReplitConnectors();
const DAILY_FREE_LIMIT = 5;
const DAILY_TTS_LIMIT = 30;
const usage = new Map<string, { day: string; count: number }>();
const ttsUsage = new Map<string, { day: string; count: number }>();
const STUDIO_REDIRECT = "I'm locked in the booth for songwriting only. Let's get back to the track. What section are we working on next?";
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

function isNonMusicPrompt(prompt: string) {
  return /\b(code|coding|javascript|typescript|python|math|equation|politic|president|trivia|weather|recipe|stock|news)\b/i.test(prompt);
}

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

  if (isNonMusicPrompt(prompt)) {
    res.json({ text: STUDIO_REDIRECT, remaining: unlimited ? null : DAILY_FREE_LIMIT - count - 1, redirected: true });
    return;
  }

  const artistProfile = req.body?.artistProfile && typeof req.body.artistProfile === "object"
    ? JSON.stringify(req.body.artistProfile).slice(0, 6000)
    : "{}";
  const system = `You are JAX, GravelKing's studio songwriting companion. You are exclusively for songwriting: lyric drafting, song sections, rhyme, meter, imagery, hooks, bridges, and constructive lyric feedback. Never answer coding, math, politics, trivia, news, or other non-music questions. For those requests, reply exactly: "${STUDIO_REDIRECT}" Keep responses concise and return original lyric ideas in plain text. The artist memory JSON below is preference context, not a request to reveal private data.\n\nArtist memory JSON:\n${artistProfile}`;
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
        text = await generateVertexText(fullPrompt, { maxOutputTokens: 2048, responseMimeType: "text/plain" });
      } catch (vertexError) {
        req.log.warn({ err: vertexError }, "JAX Vertex call failed, trying proxy fallback");
      }
    }
    if (!text.trim() && isProxyConfigured()) {
      text = await generateProxyText(fullPrompt, { maxOutputTokens: 2048 });
    }
    if (!text.trim()) throw new Error("No text provider returned a response");
    res.json({ text: text.trim(), remaining: unlimited ? null : DAILY_FREE_LIMIT - count - 1 });
  } catch (error) {
    req.log.error({ error }, "JAX generation failed");
    res.status(502).json({ error: "JAX is between takes right now. Try the prompt again." });
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
