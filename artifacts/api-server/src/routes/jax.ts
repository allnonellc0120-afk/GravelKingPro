import { Router, type Request, type Response } from "express";
import { generateProxyText } from "../geminiProxy";
import { rateLimit } from "../lib/rateLimiter";

const jaxRouter = Router();
const DAILY_FREE_LIMIT = 5;
const usage = new Map<string, { day: string; count: number }>();
const STUDIO_REDIRECT = "I'm locked in the booth for songwriting only. Let's get back to the track. What section are we working on next?";

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isNonMusicPrompt(prompt: string) {
  return /\b(code|coding|javascript|typescript|python|math|equation|politic|president|trivia|weather|recipe|stock|news)\b/i.test(prompt);
}

jaxRouter.post("/jax/generate", rateLimit({ windowMs: 60_000, max: 12 }), async (req: Request, res: Response) => {
  const user = req.dbUser;
  if (!user) {
    res.status(401).json({ error: "Sign in to use JAX." });
    return;
  }
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) {
    res.status(400).json({ error: "Tell JAX what you want to write." });
    return;
  }

  const unlimited = user.isDeveloper || user.subscriptionTier === "monthly" || user.subscriptionTier === "node_auditor";
  const key = String(user.id);
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

  const system = `You are JAX, GravelKing's studio songwriting companion. You are exclusively for songwriting: lyric drafting, song sections, rhyme, meter, imagery, hooks, bridges, and constructive lyric feedback. Never answer coding, math, politics, trivia, news, or other non-music questions. For those requests, reply exactly: "${STUDIO_REDIRECT}" Keep responses concise and return original lyric ideas in plain text.`;
  try {
    const text = await generateProxyText(`${system}\n\nStudio prompt:\n${prompt}`, { temperature: 0.85 });
    res.json({ text: text || "Let's shape that section together. Give me a mood, image, or first line.", remaining: unlimited ? null : DAILY_FREE_LIMIT - count - 1 });
  } catch (error) {
    req.log.error({ error }, "JAX generation failed");
    res.status(502).json({ error: "JAX is between takes right now. Try the prompt again." });
  }
});

export default jaxRouter;