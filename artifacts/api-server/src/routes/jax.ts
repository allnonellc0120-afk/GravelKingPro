import { Router, type Request, type Response } from "express";
import { generateProxyText } from "../geminiProxy";
import { rateLimit } from "../lib/rateLimiter";
import { isAdminAutomationAuthenticated } from "../lib/adminAuth";
import { ReplitConnectors } from "@replit/connectors-sdk";

const jaxRouter = Router();
const DAILY_FREE_LIMIT = 5;
const usage = new Map<string, { day: string; count: number }>();
const STUDIO_REDIRECT = "I'm locked in the booth for songwriting only. Let's get back to the track. What section are we working on next?";
const elevenLabs = new ReplitConnectors();
export const JAX_VOICE_PRESETS = {
  admin: { label: "Admin Custom Cloned Voice", voiceId: () => process.env.JAX_VOICE_ID?.trim() ?? "" },
  adam: { label: "JAX Baritone (Deep & Resonant)", voiceId: () => "pNInz6obpgDQGcFmaJgB" },
  callum: { label: "JAX Gritty Blues / Rough", voiceId: () => "N2lVS1w4EtoT3dr4eOWO" },
  antoni: { label: "JAX Smooth Studio / Conversational", voiceId: () => "ErXwobaYiN019PkySvjV" },
  josh: { label: "JAX Heavy Low-End / Narrator", voiceId: () => "TxGEqnHWrfWFTfGW9XjX" },
  bill: { label: "JAX Classic Vintage", voiceId: () => "pqHfZKP75CvOlQylNhV4" },
} as const;

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
    res.status(403).json({ error: "Admin automation requires valid x-admin-key and x-admin-user headers." });
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
  try {
    const text = await generateProxyText(`${system}\n\nStudio prompt:\n${prompt}`, { temperature: 0.85 });
    res.json({ text: text || "Let's shape that section together. Give me a mood, image, or first line.", remaining: unlimited ? null : DAILY_FREE_LIMIT - count - 1 });
  } catch (error) {
    req.log.error({ error }, "JAX generation failed");
    res.status(502).json({ error: "JAX is between takes right now. Try the prompt again." });
  }
});

jaxRouter.post("/jax/tts", async (req: Request, res: Response) => {
  const adminBypass = isAdminAutomationAuthenticated(req);
  if (!req.dbUser && !adminBypass) {
    res.status(401).json({ error: "Sign in to use JAX voice playback." });
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
  try {
    const response = await elevenLabs.proxy("elevenlabs", `/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
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