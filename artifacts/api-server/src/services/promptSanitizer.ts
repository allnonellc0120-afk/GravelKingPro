/**
 * AI Prompt Translation & Safety Sanitizer (Zero-Rejection Engine).
 *
 * Every style prompt passes through a quick Gemini pre-pass BEFORE it reaches
 * Vertex AI Lyria:
 *   - Artist / band / trademark references are expanded into pure sonic &
 *     genre descriptors (Lyria blocks artist-imitation requests outright).
 *   - Explicit / violent / sexual terms are rewritten into artistic,
 *     policy-safe equivalents so the generation is not rejected.
 *
 * IMPORTANT BOUNDARIES:
 *   - Only the prompt SENT TO LYRIA is rewritten. The user's ORIGINAL prompt
 *     is what gets recorded in the IP cert stub — the cert documents the
 *     artist's actual creative direction, not a machine paraphrase.
 *   - User LYRICS are never rewritten: the lyric possession hash is computed
 *     from the exact typed text, and the track must sing those exact words or
 *     the certificate's evidence chain would be dishonest.
 *   - Fail-open by design: if the Gemini pre-pass itself errors, the original
 *     prompt continues to Lyria (loudly logged). The sanitizer exists to
 *     PREVENT rejections, so its own failure must never become one — Lyria's
 *     policy filter remains the enforcement backstop.
 */
import { generateVertexText } from "../geminiVertex";
import { logger } from "../lib/logger";

const SANITIZER_INSTRUCTIONS = `You rewrite music style prompts for a music generation model so they are policy-safe and maximally descriptive. Apply these rules:

1. ARTIST/TRADEMARK TRANSLATION: Replace every artist, band, producer, label, or trademarked reference with pure sonic and genre descriptors that capture that signature sound. Examples: "sounds like Kurt Cobain" -> "90s Pacific Northwest grunge, raw distorted electric guitars, raspy weathered vocals"; "Drake type beat" -> "atmospheric Toronto-style trap, filtered ambient pads, moody 808 bass, sparse hi-hats"; "Hans Zimmer" -> "epic cinematic orchestral score, massive brass swells, pulsing ostinato strings, thunderous percussion".
2. CONTENT SOFTENING: Rewrite explicit violence, sexual content, drug references, hate terms, or other likely-flagged phrasing into artistic, policy-safe musical equivalents that keep the emotional intent. Examples: explicit violence -> "dark gritty street narrative, tense and menacing atmosphere"; explicit sexual themes -> "sensual late-night R&B vibe, intimate and slow".
3. PRESERVE INTENT: Keep every musical detail — genre, instruments, tempo, BPM, key, mood, era, structure, production notes — exactly as intended. Never add vocals/instrumental directives that were not there.
4. NO MENTION of real people, bands, or brands may remain in the output.
5. If the prompt is already policy-safe and contains no artist/brand references, return it UNCHANGED, word for word.

Output ONLY the rewritten prompt text. No commentary, no quotes, no markdown.

PROMPT TO REWRITE:
`;

export interface SanitizedPrompt {
  /** The prompt to send to Lyria. */
  prompt: string;
  /** True when the pre-pass actually changed the text. */
  optimized: boolean;
}

/**
 * Aggressive rescue pass, used AFTER Lyria has actually blocked a prompt.
 * Unlike the pre-pass (which preserves wording where possible), this rewrites
 * unconditionally into a short, plain, unambiguous style description.
 * Throws on failure — at this point there is no safe prompt to fall back to.
 */
export async function rewriteBlockedPrompt(blocked: string): Promise<string> {
  const rewritten = (
    await generateVertexText(
      `The following music style prompt was BLOCKED by an automated content safety filter. ` +
        `Rewrite it as a short, simple, policy-safe music style description: only genre, instruments, mood, and tempo words. ` +
        `Remove any wording that references an existing recording or artist, or that could imply copying or reproducing one ` +
        `(e.g. "exact", "keep the same", "identical to"). Remove or soften anything explicit. ` +
        `Output ONLY the rewritten prompt text, nothing else.\n\nBLOCKED PROMPT:\n${blocked}`,
      { temperature: 0.3, maxOutputTokens: 512 },
    )
  ).trim();
  if (!rewritten) throw new Error("blocked-prompt rescue rewrite returned empty text");
  logger.warn(
    { blockedChars: blocked.length, rewrittenChars: rewritten.length },
    "promptSanitizer: rescue-rewrote a Lyria-blocked prompt",
  );
  return rewritten;
}

export async function sanitizeStylePrompt(original: string): Promise<SanitizedPrompt> {
  const input = original.trim();
  if (!input) return { prompt: original, optimized: false };
  try {
    const rewritten = (
      await generateVertexText(`${SANITIZER_INSTRUCTIONS}${input}`, {
        temperature: 0.2,
        maxOutputTokens: 1024,
      })
    ).trim();
    if (!rewritten) throw new Error("sanitizer returned empty text");
    const optimized = rewritten.replace(/\s+/g, " ") !== input.replace(/\s+/g, " ");
    if (optimized) {
      logger.info(
        { originalChars: input.length, rewrittenChars: rewritten.length },
        "promptSanitizer: style prompt optimized for Lyria",
      );
    }
    return { prompt: rewritten, optimized };
  } catch (err) {
    // Fail-open, loudly: the sanitizer must never become its own rejection.
    logger.error(
      { err: String((err as Error)?.message ?? err).slice(0, 300) },
      "promptSanitizer: Gemini pre-pass FAILED — sending the original prompt to Lyria",
    );
    return { prompt: original, optimized: false };
  }
}
