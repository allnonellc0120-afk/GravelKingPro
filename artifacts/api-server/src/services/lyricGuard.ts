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
  /**
   * The specific matching passage returned by the screening model (≤120 chars).
   * Present only when verdict is "flagged". Used by the UI to highlight the
   * problematic text inside the editor.
   */
  evidence?: string;
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
(A single \`\`\`json code fence around that one JSON object is tolerated as a
transport wrapper; any other surrounding text invalidates the response.)

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
 * SCHEMA-STRICT parse of the screening model's response. Exactly two shapes
 * are valid — matching the OUTPUT contract in GUARD_INSTRUCTIONS:
 *   {"verdict":"clear"}                                      (no other keys)
 *   {"verdict":"flagged","song":"…","artist":"…"}            (both nonempty;
 *     plus an OPTIONAL nonempty string "evidence"; no other keys)
 * Per the contract, the single JSON object MAY arrive wrapped in one ```json
 * code fence (an explicitly tolerated transport wrapper — some model builds
 * fence all structured output, and treating that as an outage would fake
 * unavailability on every response). The fence is stripped BEFORE parsing;
 * the payload inside is still held to the exact schema.
 * ANYTHING else — unparseable JSON, non-object/array, unknown/extra keys,
 * missing or unknown verdict, wrong field types, empty song/artist, prose
 * around the JSON — is treated as a screening failure (fail-open +
 * screeningUnavailable), NEVER as a valid screen result. Exported for tests.
 */
export function parseScreeningResponse(raw: string): LyricVerification {
  // Contract-permitted transport wrapper: a single optional ```json fence.
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  const unavailable: LyricVerification = { verdict: "clear", screeningUnavailable: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return unavailable;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return unavailable;
  }

  const keys = Object.keys(parsed as Record<string, unknown>);
  const p = parsed as Record<string, unknown>;

  if (p["verdict"] === "clear") {
    // Exact shape: the ONLY key allowed is "verdict".
    if (keys.length !== 1) return unavailable;
    return { verdict: "clear" };
  }

  if (p["verdict"] === "flagged") {
    // Exact shape: verdict + song + artist, plus optional evidence. No other keys.
    const allowed = new Set(["verdict", "song", "artist", "evidence"]);
    if (keys.some((k) => !allowed.has(k))) return unavailable;

    const song = typeof p["song"] === "string" ? p["song"].trim() : "";
    const artist = typeof p["artist"] === "string" ? p["artist"].trim() : "";
    if (!song || !artist) return unavailable;
    if ("evidence" in p && (typeof p["evidence"] !== "string" || !p["evidence"].trim())) {
      return unavailable;
    }

    const matchedWork = `${song} — ${artist}`;
    const evidenceStr = typeof p["evidence"] === "string" ? p["evidence"].trim() : undefined;
    return {
      verdict: "flagged",
      matchedWork,
      evidence: evidenceStr || undefined,
      reason:
        `These lyrics appear to reproduce "${matchedWork}". ` +
        "Rewrite the matching passage in your own words, then verify again.",
    };
  }

  // Unknown or missing verdict.
  return unavailable;
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

    const result = parseScreeningResponse(raw);

    if (result.verdict === "flagged") {
      logger.warn(
        { matchedWork: result.matchedWork },
        "lyricGuard: copyright screen FLAGGED submitted lyrics",
      );
    }

    // A nonconforming/partial model response is an infrastructure failure, not
    // a clearance — surface it as unavailable and NEVER cache it, so the next
    // attempt gets a fresh screening.
    if (result.screeningUnavailable) {
      logger.error(
        { raw: raw.slice(0, 200) },
        "lyricGuard: nonconforming screening response — gate failing open as UNAVAILABLE",
      );
      return result;
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
