/**
 * GravelKing Protocol — Lyric Copyright Verification Gate.
 *
 * Every set of user-supplied lyrics (typed, pasted, or rewritten) passes
 * through this AI screening BEFORE song generation or library save. The
 * screen detects:
 *   - Verbatim or near-verbatim lyrics from known commercial recordings.
 *   - PHONETIC / OBFUSCATED bypass attempts (e.g. "U Kant all Waze get what
 *     u won't" → "You Can't Always Get What You Want" — The Rolling Stones).
 *
 * HONESTY BOUNDARY: this is an AI-recognition screen backed by the model's
 * knowledge of commercially released lyrics. It is NOT a licensed commercial
 * lyric-database lookup, and results are labeled accordingly ("AI screening").
 * The check is a protective gate, not a legal clearance service.
 *
 * FAILURE POLICY:
 *   - verdict "flagged"  → hard block (422 upstream). The matched work is
 *     named so the user understands exactly what tripped the gate.
 *   - screening infrastructure failure → FAIL-OPEN with a loud log, same
 *     policy as the prompt sanitizer: an outage of the checker must not take
 *     the whole songwriting product down. Lyria's own filter remains the
 *     enforcement backstop.
 *
 * FALSE-POSITIVE TUNING: common phrases, genre vocabulary, and short
 * coincidental overlaps must NOT flag — only substantial recognizable
 * passages (a distinctive hook/chorus or multiple lines) from a real
 * released song.
 */
import { createHash } from "crypto";
import { generateVertexText, isVertexConfigured } from "../geminiVertex";
import { logger } from "../lib/logger";

export interface LyricVerification {
  verdict: "clear" | "flagged";
  /** Human-readable reason when flagged. */
  reason?: string;
  /** "Song — Artist" when the screen recognized a specific work. */
  matchedWork?: string;
  /** True when the screening service itself failed and the gate failed open. */
  screeningUnavailable?: boolean;
}

const GUARD_INSTRUCTIONS = `GRAVELKING PROTOCOL — COPYRIGHT LYRIC SCREEN.
You are a copyright screening agent for a music generation service. Analyze the submitted lyrics and decide if they substantially reproduce lyrics from a known commercially released song.

DETECTION RULES:
1. VERBATIM MATCH: The text contains a distinctive hook, chorus, or multiple consecutive lines from a real released song.
2. OBFUSCATED / PHONETIC MATCH: The text disguises a known lyric through phonetic spelling, letter substitution, or spacing tricks (e.g. "U Kant all Waze get what u won't" is "You Can't Always Get What You Want" by The Rolling Stones). Decode phonetically and check the decoded text.
3. FALSE-POSITIVE GUARD: Do NOT flag common phrases, single-line coincidences, genre vocabulary, cliches, or generic sentiments ("I love you baby", "started from the bottom of my heart"). Only flag when a substantial, distinctive passage clearly maps to one specific released song.

OUTPUT: Respond with EXACTLY one line of minified JSON, nothing else:
{"verdict":"clear"} 
or
{"verdict":"flagged","song":"<title>","artist":"<artist>","evidence":"<the matching passage, max 120 chars>"}

LYRICS TO SCREEN:
`;

// Tiny LRU-ish cache: identical text (retries, verify-then-generate flows)
// should not pay for two screenings.
const cache = new Map<string, LyricVerification>();
const CACHE_MAX = 200;

function cacheKey(text: string): string {
  return createHash("sha256").update(text.trim(), "utf8").digest("hex");
}

/**
 * Test/dev hook: pre-seed the screening cache with a known verdict so the
 * flagged enforcement paths can be exercised deterministically without a
 * live Vertex call. Refuses to run in production — the real screen is the
 * only authority there.
 */
export function primeLyricVerificationForTest(text: string, result: LyricVerification): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("primeLyricVerificationForTest is not available in production");
  }
  cache.set(cacheKey(text.replace(/\r\n/g, "\n").trim()), result);
}

/**
 * Screen lyrics for recognizable commercial-song content. See module header
 * for verdict semantics and the fail-open policy.
 */
export async function verifyLyrics(text: string): Promise<LyricVerification> {
  const input = text.replace(/\r\n/g, "\n").trim();
  // Nothing substantial to screen — a few words can't be a protected passage.
  if (input.replace(/\s/g, "").length < 20) return { verdict: "clear" };

  const key = cacheKey(input);
  const hit = cache.get(key);
  if (hit) return hit;

  if (!isVertexConfigured()) {
    logger.error("lyricGuard: Vertex not configured — copyright screen FAILING OPEN");
    return { verdict: "clear", screeningUnavailable: true };
  }

  try {
    const raw = (
      await generateVertexText(`${GUARD_INSTRUCTIONS}${input.slice(0, 12_000)}`, {
        temperature: 0,
        maxOutputTokens: 256,
        thinkingConfig: { thinkingBudget: 0 },
      })
    ).trim();

    // The model sometimes wraps JSON in a code fence — strip it.
    const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(jsonText) as {
      verdict?: string;
      song?: string;
      artist?: string;
      evidence?: string;
    };

    let result: LyricVerification;
    if (parsed.verdict === "flagged" && (parsed.song || parsed.artist)) {
      const matchedWork = [parsed.song, parsed.artist].filter(Boolean).join(" — ");
      result = {
        verdict: "flagged",
        matchedWork,
        reason:
          `These lyrics appear to reproduce "${matchedWork}". ` +
          "Rewrite the matching passage in your own words, then verify again.",
      };
      logger.warn(
        { matchedWork, evidence: parsed.evidence?.slice(0, 120) },
        "lyricGuard: copyright screen FLAGGED submitted lyrics",
      );
    } else {
      result = { verdict: "clear" };
    }

    if (cache.size >= CACHE_MAX) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
    cache.set(key, result);
    return result;
  } catch (err) {
    // Fail-open, loudly — see module header.
    logger.error(
      { err: String((err as Error)?.message ?? err).slice(0, 300) },
      "lyricGuard: screening FAILED — copyright gate failing open",
    );
    return { verdict: "clear", screeningUnavailable: true };
  }
}
