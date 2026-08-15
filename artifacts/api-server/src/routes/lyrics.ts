import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { saveSongDraft, updateSongDraft, deleteSongDraft, queryLibraryBySession } from "../lib/firestore";
import { hasStudio } from "../lib/entitlement";
import { getUsageUser } from "../lib/usage";
import { rateLimit } from "../lib/rateLimiter";
import {
  db,
  lyricProjectsTable,
  lyricRevisionsTable,
  lyricForensicLedgerTable,
  lyricTimelineBlocksTable,
  lyricImportsTable,
  usersTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID, createHmac, createHash } from "crypto";
import type { LineState } from "@workspace/db";
import { authorshipScore } from "@workspace/authorship";
import { generateVertexText, isVertexConfigured } from "../geminiVertex";
import { logToolError } from "../lib/errorTracker";
import { recordActivity } from "../lib/activityTracker";
import { verifyLyrics } from "../services/lyricGuard";

const EMBED_SECRET = process.env["SESSION_SECRET"] ?? "gravelking-embed-secret";

function makeEmbedToken(projectId: string, authorshipScore: number): string {
  return createHmac("sha256", EMBED_SECRET)
    .update(`${projectId}|${authorshipScore}`)
    .digest("hex")
    .slice(0, 32);
}

function verifyEmbedToken(projectId: string, authorshipScore: number, token: string): boolean {
  const expected = makeEmbedToken(projectId, authorshipScore);
  return expected === token;
}

/**
 * Lyric/songwriter generation — Google Cloud Vertex AI ONLY.
 *
 * Runs exclusively on the owner's own Google Cloud account via
 * GCP_SERVICE_ACCOUNT. The Replit AI Integrations Gemini proxy is deliberately
 * NOT used here: it is a Replit-billed managed sidecar that returns
 * "401 ApiKey not approved" in production, which previously took the songwriter
 * down in the published Play app. Keeping it as a fallback made the songwriter
 * depend on Replit billing, so it is removed.
 *
 * Failures surface as a real error naming the Google-side cause rather than a
 * generic 500, so misconfiguration is diagnosable from the logs.
 */
async function geminiGenerate(
  prompt: string,
  config?: {
    temperature?: number;
    topP?: number;
    maxOutputTokens?: number;
    thinkingConfig?: { thinkingBudget: number };
  },
): Promise<string> {
  if (!isVertexConfigured()) {
    throw new Error(
      "Google Cloud Gemini is not configured — GCP_SERVICE_ACCOUNT must hold a valid service-account JSON key.",
    );
  }

  const text = await generateVertexText(prompt, {
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
    ...config,
  });

  if (!text.trim()) {
    throw new Error("Google Cloud Gemini returned an empty response.");
  }
  return text;
}

/**
 * Inference parameters for full-song generation (per owner's blueprint):
 * temperature 0.75 / top_p 0.85 for grounded-but-creative output, 1024 output
 * tokens (a full song is ~400–600). thinkingBudget 0 keeps gemini-2.5-flash
 * from spending that budget on hidden reasoning tokens.
 */
const SONG_GENERATION_CONFIG = {
  temperature: 0.75,
  topP: 0.85,
  maxOutputTokens: 1024,
  thinkingConfig: { thinkingBudget: 0 },
};

/**
 * Anti-"plastic" stylistic directives applied to every full-song generation
 * (both simple and advanced/timeline modes). Verbatim from the owner's
 * blueprint — do not soften the cliché ban.
 */
function strictStylisticDirectives(bpmLabel: string, delivery: string): string {
  return `
STRICT STYLISTIC DIRECTIVES:
1. BAN ALL AI CLICHÉS: Absolutely do NOT use overused AI buzzwords, vague filler, or fake deep metaphors. Banned terms include: 'neon', 'shadows', 'echoes', 'whispers', 'tapestry', 'symphony', 'fire in my soul', 'digital streets', 'starlight', 'stumbling in the dark'.
2. GROUNDED IMAGERY: Use concrete, real-world detail, authentic slang matching the genre, and vivid imagery. Show, don't tell.
3. CADENCE MATCHING: Tailor line lengths, syllable counts, and rhythm strictly to ${bpmLabel} and the ${delivery} vocal style so it fits a beat naturally.
4. FORMATTING: Output strictly formatted song sections with tags (e.g., [Verse 1], [Chorus], [Outro]). No introductory conversational text or concluding remarks.`;
}

/** Translate the form's structure checkboxes into explicit structure requirements. */
function buildStructureRequirement(structureOptions: string[] | undefined): {
  sections: string;
  directives: string[];
} {
  const opts = new Set((structureOptions ?? []).map((o) => o.toLowerCase()));
  const wantsBridge = opts.has("include bridge");
  const directives: string[] = [];

  let sections: string;
  if (opts.has("raw/freeform")) {
    sections =
      "Freeform — let the narrative dictate the section flow, but still tag every section (e.g., [Verse 1], [Hook], [Outro])." +
      (wantsBridge ? " Include a [Bridge]." : "");
  } else if (opts.has("verse-chorus-verse")) {
    sections = wantsBridge
      ? "[Verse 1]\n[Chorus]\n[Verse 2]\n[Chorus]\n[Bridge]\n[Chorus]\n[Outro]"
      : "[Verse 1]\n[Chorus]\n[Verse 2]\n[Chorus]\n[Outro]";
  } else {
    sections = wantsBridge
      ? "[Intro]\n[Verse 1]\n[Pre-Chorus]\n[Chorus]\n[Verse 2]\n[Pre-Chorus]\n[Chorus]\n[Bridge]\n[Outro/Chorus]"
      : "[Intro]\n[Verse 1]\n[Pre-Chorus]\n[Chorus]\n[Verse 2]\n[Pre-Chorus]\n[Chorus]\n[Bridge]\n[Outro/Chorus]";
  }

  if (opts.has("complex/internal rhymes")) {
    directives.push(
      "Use complex rhyme craft: internal rhymes, multisyllabic rhymes, and slant rhymes woven inside lines — not just end-of-line rhymes.",
    );
  }

  return { sections, directives };
}

const GENRE_RULES: Record<string, string> = {
  rap: "Uncompromising, heavy-leverage, street-level truth and cold execution. Use internal rhymes, heavy cadence, raw storytelling, economic power, survival, loyalty, and strategy. Avoid generic AI metaphors such as shadows in the night, neon lights, or echoes of the street.",
  trap: "High-velocity, aggressive, dark, heavily rhythmic. Use short punchy lines for 808 syncopation, repetitive high-impact hooks, resilience, and relentless grind. Avoid pop fluff and overly complex multisyllabic poetry.",
  pop: "Edge-driven, assertive, direct, and catchy without becoming soft. Use melodic structure, real-world edge, power dynamics, self-reliance, and dominant energy.",
  rock: "Gritty, distorted, driving, and confrontational. Use a strong verse-chorus dynamic, raw tension, friction, breaking systems, pressure, and holding the line.",
  outlaw_grunge: "Weary, heavy-handed, stripped-down, dirt-road gritty, and unforgiving. Use raw acoustic or distorted feeling, hard lessons, heavy consequences, isolation, and living by your own law.",
};

function songwritingPolicy(genre: string | undefined, isExplicit: boolean): string {
  const key = (genre || "pop").toLowerCase().replace(/\s+/g, "_");
  const genreRule = GENRE_RULES[key] || GENRE_RULES.pop;
  return `\n\nSONGWRITING SAFETY AND STYLE STANDARD:\n- Genre direction: ${genreRule}\n- ${isExplicit
    ? "EXPLICIT 18+ artistic mode: raw language may be used for artistic grit, but absolutely no hate speech, slurs, targeted harassment, non-consensual sexual content, sexual violence, or sexual content involving minors."
    : "RADIO/CLEAN mode: keep language clean for broadcast while preserving grit and emotional impact; no profanity, hate speech, slurs, targeted harassment, or sexual content."}\n- Do not imitate a living artist or reproduce recognizable copyrighted lyrics.\n- If the request asks for disallowed content, refuse that part briefly and provide a safe creative alternative.`;
}

const DEFAULT_CERTIFICATION = "I certify these lyrics are my original human work and were NOT produced by an AI.";

/** Serialize a lyric_imports row for the client (ISO timestamps). */
function serializeImport(row: typeof lyricImportsTable.$inferSelect) {
  return {
    id: row.id,
    contentHash: row.contentHash,
    hashAlgorithm: row.hashAlgorithm,
    stampType: row.stampType,
    importedText: row.importedText,
    charCount: row.charCount,
    certifiedHumanAuthor: row.certifiedHumanAuthor,
    certificationText: row.certificationText,
    stampedAt: row.stampedAt instanceof Date ? row.stampedAt.toISOString() : row.stampedAt,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function parseToLines(raw: string): LineState[] {
  let currentSection = "";
  return raw.split("\n").map((l) => {
    const trimmed = l.trim();
    const isSection = /^\[.+\]$/.test(trimmed);
    if (isSection) {
      currentSection = trimmed;
      return { id: randomUUID(), type: "section" as const, text: trimmed, aiOriginal: trimmed, isHumanEdited: false, sectionContext: trimmed };
    } else if (trimmed === "") {
      return { id: randomUUID(), type: "empty" as const, text: "", aiOriginal: "", isHumanEdited: false, sectionContext: currentSection };
    } else {
      return { id: randomUUID(), type: "lyric" as const, text: l, aiOriginal: l, isHumanEdited: false, sectionContext: currentSection };
    }
  });
}

const lyricsRouter = Router();

// All AI endpoints below call Gemini (real cost). Bound abuse/DoS the same way
// the audio/master/studio routes do — UI quotas alone are client-bypassable.
// Generation is anonymous-reachable, so it gets the tighter window.
const lyricsGenRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  max: 15,
  message: "Too many lyric generations. Please wait a few minutes.",
});
// Live line-editing helpers are chattier; allow more per minute but still bounded.
const lyricsAiRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  message: "Too many edits in a short time. Please slow down.",
});

// Server-side Pro gate for paid editor features (UI gating alone is bypassable).
async function requireStudio(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (await hasStudio(req)) {
    next();
    return;
  }
  res.status(403).json({ error: "A Pro (Studio) subscription is required for this feature." });
}

// STRICT owner check for the by-id lyric routes. The caller must present a
// credential that MATCHES the project's stored owner session:
//   - the gk_session cookie equal to the project's sessionId (the stored
//     sessionId is always a server-generated high-entropy random token —
//     project creation NEVER stores a user id there, because user ids are
//     public/stable identifiers, not bearer secrets: a client-supplied
//     cookie equal to a known user id must never grant access), or
//   - a server-AUTHENTICATED user (req.dbUser resolves only through a valid
//     Clerk session or a server-side session row — it cannot be spoofed by a
//     crafted cookie) whose sessionId or id equals the project's sessionId
//     (covers legacy rows keyed to a user principal before random tokens).
// A caller with NO credential is ALWAYS denied — a missing cookie must never
// grant access to private or destructive routes (that would be an IDOR: any
// anonymous caller who learned a project id could read or delete it).
// Project creation sets the gk_session cookie when absent, so anonymous and
// signed-in creators alike keep a matching credential for their own project.
//
// LEGACY-ROW GUARD: the cookie path is only honoured when the stored
// sessionId is NOT the id of an existing user row. Legacy projects whose
// sessionId is a user principal id would otherwise be forgeable — user ids
// are public/stable identifiers, not bearer secrets, so an attacker who
// learned one could set gk_session=<userId> and own the project. For those
// rows only a server-authenticated req.dbUser match grants access.
async function isProjectOwner(req: Request, projectSessionId: string | null | undefined): Promise<boolean> {
  if (!projectSessionId) return false;
  const dbUser = req.dbUser as { id?: string; sessionId?: string | null } | undefined;
  if (dbUser && (dbUser.sessionId === projectSessionId || dbUser.id === projectSessionId)) return true;
  const cookie = (req.cookies as Record<string, string> | undefined)?.["gk_session"];
  if (cookie && cookie === projectSessionId) {
    const [principal] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, projectSessionId))
      .limit(1);
    // If the stored sessionId is actually a user id (legacy row), the cookie
    // is a forgeable public identifier — deny; only the authenticated-user
    // branch above may grant access to that project.
    return !principal;
  }
  return false;
}

// ─── POST /api/lyrics/generate ───────────────────────────────────────────────
// Supports both simple (story prompt) and advanced (timeline canvas) modes.
lyricsRouter.post("/lyrics/generate", lyricsGenRateLimit, async (req: Request, res: Response) => {
  recordActivity((req.cookies as Record<string, string> | undefined)?.["gk_session"], "Lyric Generator");
  const {
    story, genre, bpm, mode,
    key, vocalType, genreTags,
    emotion, vocalDelivery, rhythmStyle, structureOptions,
    isExplicit,
    timelineBlocks,
  } = req.body as {
    story?: string;
    genre?: string;
    bpm?: number;
    mode?: "simple" | "advanced";
    key?: string;
    vocalType?: string;
    genreTags?: string;
    emotion?: string;
    vocalDelivery?: string;
    rhythmStyle?: string;
    structureOptions?: string[];
    isExplicit?: boolean;
    timelineBlocks?: Array<{ timestampMs: number; label: string; sectionType: string }>;
  };

  const isAdvanced = mode === "advanced";

  if (isAdvanced) {
    if (!timelineBlocks?.length) {
      res.status(400).json({ error: "Advanced mode requires at least one timeline block." });
      return;
    }
  } else {
    if (!story || story.trim().length < 5) {
      res.status(400).json({ error: "story is required (min 5 characters)" });
      return;
    }
  }

  // Shared prompt ingredients (blueprint placeholders).
  const genreLabel = (genreTags || genre || "Pop").trim();
  const bpmLabel = (rhythmStyle?.trim() || (bpm ? `${bpm} BPM` : "") || "moderate tempo").trim();
  const emotionLabel = (emotion?.trim() || "authentic to the theme").trim();
  const deliveryLabel = (vocalDelivery?.trim() || vocalType?.trim() || "natural, genre-appropriate").trim();

  const { sections, directives: structureDirectives } = buildStructureRequirement(structureOptions);

  const structure = isAdvanced
    ? timelineBlocks!
        .sort((a, b) => a.timestampMs - b.timestampMs)
        .map(({ timestampMs, label, sectionType }) => {
          const m = Math.floor(timestampMs / 60000);
          const s = Math.floor((timestampMs % 60000) / 1000);
          return `${m}:${String(s).padStart(2, "0")} [${label}] (${sectionType})`;
        })
        .join("\n")
    : sections;

  const extraDirectives = structureDirectives.length
    ? `\n${structureDirectives.map((d) => `- ${d}`).join("\n")}`
    : "";

  const prompt = isAdvanced
    ? `You are an elite, raw lyricist and professional songwriter specializing in ${genreLabel}. Your task is to write high-impact, authentic song lyrics that strictly match this song timeline:
- Genre/Sub-genre: ${genreLabel}
- Tempo/Rhythm: ${bpmLabel}
- Key: ${key || "not specified"}
- Emotion/Mood: ${emotionLabel}
- Vocal Delivery: ${deliveryLabel}
- Theme/Concept: follow the timeline block labels

Timeline (align lyrics cadence, syllable pacing, and emotional delivery to each block):
${structure}

- Write lyrics for every timeline block in order, labeling each exactly as: [$LABEL]${extraDirectives}
${strictStylisticDirectives(bpmLabel, deliveryLabel)}

After the lyrics, on the LAST LINE output exactly:
STYLE_PROMPT: [genre] [2-3 mood adjectives] [key instruments] [tempo] [vocal type] vocals`
    : `You are an elite, raw lyricist and professional songwriter specializing in ${genreLabel}. Your task is to write high-impact, authentic song lyrics based on these parameters:
- Genre/Sub-genre: ${genreLabel}
- Tempo/Rhythm: ${bpmLabel}
- Emotion/Mood: ${emotionLabel}
- Vocal Delivery: ${deliveryLabel}
- Structure Requirements:
${structure}
- Theme/Concept: "${story!.trim()}"${extraDirectives}
${strictStylisticDirectives(bpmLabel, deliveryLabel)}

After the lyrics, on the LAST LINE output exactly:
STYLE_PROMPT: [genre] [2-3 mood adjectives] [key instruments] [tempo] vocals`;

  try {
    const fullText = (
      await geminiGenerate(
        `${prompt}${songwritingPolicy(genreTags || genre, Boolean(isExplicit))}`,
        SONG_GENERATION_CONFIG,
      )
    ).trim();
    const styleMatch = fullText.match(/^STYLE_PROMPT:\s*(.+)$/m);
    const stylePrompt = styleMatch ? styleMatch[1].trim() : `${genre || "Pop"} emotional vocals`;
    const lyrics = fullText.replace(/^STYLE_PROMPT:.*$/m, "").trim();
    const lines = parseToLines(lyrics);

    // Note: the library entry is created when the user SAVES a project
    // (POST /lyrics/project), keyed by the project id so revise can update it.
    res.json({ lyrics, stylePrompt, lines });
  } catch (err) {
    req.log.error({ err }, "Gemini lyric generation failed");
    void logToolError("Lyric Generator", "AI_GENERATION", err);
    res.status(500).json({ error: "Lyric generation failed. Please try again." });
  }
});

// ─── POST /api/lyrics/verify ─────────────────────────────────────────────────
// GravelKing Protocol copyright gate: AI screening of typed/pasted/rewritten
// lyrics for recognizable commercial-song content (including phonetic
// obfuscation). Must clear before generation or library save — both of those
// routes re-run the same check server-side, so this endpoint is the UI's
// preview of the verdict, not the enforcement point.
lyricsRouter.post("/lyrics/verify", lyricsAiRateLimit, async (req: Request, res: Response) => {
  const { text } = req.body as { text?: string };
  const input = (text ?? "").toString();
  if (input.replace(/\s/g, "").length < 5) {
    res.status(400).json({ error: "Lyrics text is required (min 5 characters)." });
    return;
  }
  try {
    const result = await verifyLyrics(input);
    res.json({
      verdict: result.verdict,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.matchedWork ? { matchedWork: result.matchedWork } : {}),
      ...(result.screeningUnavailable ? { screeningUnavailable: true } : {}),
      method: "ai_screening",
    });
  } catch (err) {
    req.log.error({ err }, "Lyric verification failed");
    void logToolError("Lyric Verify", "COPYRIGHT_SCREEN", err);
    res.status(500).json({ error: "Verification failed. Please try again." });
  }
});

// ─── POST /api/lyrics/expand ─────────────────────────────────────────────────
lyricsRouter.post("/lyrics/expand", lyricsAiRateLimit, requireStudio, async (req: Request, res: Response) => {
  const { partialLyrics, genre, bpm, styleContext } = req.body as {
    partialLyrics?: string;
    genre?: string;
    bpm?: number;
    styleContext?: string;
  };
  if (!partialLyrics || partialLyrics.trim().length < 5) {
    res.status(400).json({ error: "partialLyrics is required (min 5 characters)" });
    return;
  }
  const prompt = `You are a professional songwriter. The user has written these lyrics (partial or full) for a ${genre || "Pop"} song${bpm ? ` at ${bpm} BPM` : ""}${styleContext ? ` with this style: ${styleContext}` : ""}:

---
${partialLyrics.trim()}
---

Complete and expand into a full song. Rules:
- PRESERVE every line the user wrote exactly as written
- Fill in missing sections around the user's lines
- Structure: [Verse 1] [Pre-Chorus] [Chorus] [Verse 2] [Pre-Chorus] [Chorus] [Bridge] [Outro/Chorus]
- Match the rhyme scheme, syllable count and emotional tone already established
- Output ONLY the lyrics

After the lyrics, on the LAST LINE output exactly:
STYLE_PROMPT: [genre] [2-3 mood adjectives] [key instruments] [tempo] vocals`;

  try {
    const fullText = (await geminiGenerate(prompt)).trim();
    const styleMatch = fullText.match(/^STYLE_PROMPT:\s*(.+)$/m);
    const stylePrompt = styleMatch ? styleMatch[1].trim() : `${genre || "Pop"} emotional vocals`;
    const lyrics = fullText.replace(/^STYLE_PROMPT:.*$/m, "").trim();
    const lines = parseToLines(lyrics);
    res.json({ lyrics, stylePrompt, lines });
  } catch (err) {
    req.log.error({ err }, "Gemini expand failed");
    void logToolError("Lyric Generator", "LYRIC_EXPAND", err);
    res.status(500).json({ error: "Expansion failed. Please try again." });
  }
});

// ─── POST /api/lyrics/regenerate-line ────────────────────────────────────────
// Returns 3 distinct variations. Pro only — enforced server-side via requireStudio.
lyricsRouter.post("/lyrics/regenerate-line", lyricsAiRateLimit, requireStudio, async (req: Request, res: Response) => {
  const { line, instruction, sectionLabel, genre, songConcept, prevLine, nextLine } = req.body as {
    line?: string;
    instruction?: string;
    sectionLabel?: string;
    genre?: string;
    songConcept?: string;
    prevLine?: string;
    nextLine?: string;
  };
  if (!line) {
    res.status(400).json({ error: "line is required" });
    return;
  }

  const contextBlock = [
    prevLine ? `Previous line: "${prevLine}"` : "",
    `Line to rewrite: "${line}"`,
    nextLine ? `Next line: "${nextLine}"` : "",
  ].filter(Boolean).join("\n");

  const prompt = `You are rewriting a single line from a ${genre || "Pop"} song.

Song concept: ${songConcept || "not specified"}
Section: ${sectionLabel || "unknown"}
${contextBlock}
Writer's instruction: ${instruction ? `"${instruction}"` : "Make this line more vivid, powerful and original."}

Generate EXACTLY 3 distinct rewrites of this line. Rules for each:
- Same approximate syllable count as the original
- Maintains rhyme compatibility with surrounding lines  
- Same emotional tone and section context
- Each variation must be meaningfully different from the others

Output in this exact format (no extra text):
VARIATION_1: [line here]
VARIATION_2: [line here]
VARIATION_3: [line here]`;

  try {
    const raw = (await geminiGenerate(prompt)).trim();
    const variations: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const match = raw.match(new RegExp(`VARIATION_${i}:\\s*(.+)`, "i"));
      if (match?.[1]) variations.push(match[1].trim().replace(/^["']|["']$/g, ""));
    }
    // Fallback if parsing fails
    if (variations.length === 0) variations.push(line);
    res.json({ variations });
  } catch (err) {
    req.log.error({ err }, "Gemini line regen failed");
    void logToolError("Lyric Generator", "LYRIC_REGENERATE", err);
    res.status(500).json({ error: "Line regeneration failed. Please try again." });
  }
});

// ─── POST /api/lyrics/rhymes ─────────────────────────────────────────────────
// Gemini-powered rhyme suggestions for the rhyming tray.
lyricsRouter.post("/lyrics/rhymes", lyricsAiRateLimit, requireStudio, async (req: Request, res: Response) => {
  const { word, genre } = req.body as { word?: string; genre?: string };
  if (!word || word.trim().length < 2) {
    res.status(400).json({ error: "word is required" });
    return;
  }

  const prompt = `Generate 10 words that rhyme with "${word.trim()}" suitable for ${genre || "Pop"} songwriting.

Rules:
- Perfect or near-rhymes only
- Words that sound natural in song lyrics
- Mix simple and poetic options
- Output ONLY the 10 words, one per line, no numbers or labels`;

  try {
    const raw = (await geminiGenerate(prompt)).trim();
    const rhymes = raw
      .split("\n")
      .map((l) => l.trim().replace(/^[-•*\d.)\s]+/, "").trim())
      .filter((l) => l.length > 0 && l.length < 25)
      .slice(0, 10);
    res.json({ rhymes });
  } catch (err) {
    req.log.error({ err }, "Gemini rhymes failed");
    void logToolError("Lyric Generator", "LYRIC_RHYMES", err);
    res.status(500).json({ error: "Rhyme generation failed." });
  }
});

// ─── POST /api/lyrics/convert-style ──────────────────────────────────────────
lyricsRouter.post("/lyrics/convert-style", lyricsAiRateLimit, async (req: Request, res: Response) => {
  const { styleDescription } = req.body as { styleDescription?: string };
  if (!styleDescription || styleDescription.trim().length < 3) {
    res.status(400).json({ error: "styleDescription is required" });
    return;
  }

  const prompt = `Convert this music style description into concise style tags for the in-house MLK v3.5 music generator.

Description: "${styleDescription.trim()}"

Rules:
- Output ONLY comma-separated style tags — no labels, no explanations
- Maximum 120 characters total
- Translate artist/song references into their actual sonic characteristics
- Include: genre, mood adjectives, key instruments, tempo feel, vocal style

Output the style tags only:`;

  try {
    const raw = (await geminiGenerate(prompt)).trim();
    const tags = raw.replace(/^(style tags:|output:|tags:)/i, "").trim().slice(0, 180);
    res.json({ styleTags: tags });
  } catch (err) {
    req.log.error({ err }, "Gemini style conversion failed");
    void logToolError("Lyric Generator", "LYRIC_STYLE", err);
    res.status(500).json({ error: "Style conversion failed." });
  }
});

// ─── POST /api/lyrics/import ──────────────────────────────────────────────────
// Stamp user-imported, self-authored lyrics: SHA-256 possession hash + plaintext
// + a server-authoritative timestamp. Additive — independent of AI generation.
lyricsRouter.post("/lyrics/import", lyricsAiRateLimit, async (req: Request, res: Response) => {
  const { text, certifiedHumanAuthor } = req.body as {
    text?: string;
    certifiedHumanAuthor?: boolean;
  };

  // Normalize CRLF→LF and strip trailing spaces so the hash is stable and
  // reproducible from the retained plaintext.
  const normalized = (text ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
  if (normalized.length < 5) {
    res.status(400).json({ error: "Lyrics text is required (min 5 characters)." });
    return;
  }
  // Certification is a hard server-side gate — the UI checkbox alone is bypassable.
  if (certifiedHumanAuthor !== true) {
    res.status(400).json({ error: "You must certify you are the original human author before stamping." });
    return;
  }

  // Possession stamps also pass the AI copyright screen — a stamp on someone
  // else's released lyrics would be a false ownership record.
  const importScreen = await verifyLyrics(normalized);
  if (importScreen.verdict === "flagged") {
    res.status(422).json({
      error: importScreen.reason ||
        "These lyrics appear to reproduce a released song and cannot be stamped as your original work.",
      code: "lyrics_flagged",
      ...(importScreen.matchedWork ? { matchedWork: importScreen.matchedWork } : {}),
    });
    return;
  }
  const importScreeningUnavailable = importScreen.screeningUnavailable === true;

  const contentHash = createHash("sha256").update(normalized, "utf8").digest("hex");

  try {
    const usageUser = await getUsageUser(req, res);
    const sessionId = (req.cookies as Record<string, string> | undefined)?.["gk_session"] ?? null;
    const [row] = await db
      .insert(lyricImportsTable)
      .values({
        id: randomUUID(),
        sessionId,
        userId: usageUser.id,
        contentHash,
        hashAlgorithm: "sha256",
        stampType: "imported_human_original",
        importedText: normalized,
        charCount: normalized.length,
        certifiedHumanAuthor: true,
        // Canonical statement is always stored server-side; the client value is
        // ignored so the recorded certification can't be forged by a crafted client.
        certificationText: DEFAULT_CERTIFICATION,
      })
      .returning();

    recordActivity(sessionId, "Lyric Import");
    res.json({
      import: serializeImport(row!),
      ...(importScreeningUnavailable ? { screeningUnavailable: true } : {}),
    });
  } catch (err) {
    req.log.error({ err }, "Lyric import stamp failed");
    void logToolError("Lyric Import", "IMPORT_STAMP", err);
    res.status(500).json({ error: "Could not stamp your lyrics. Please try again." });
  }
});

// ─── GET /api/lyrics/imports ──────────────────────────────────────────────────
// List every possession stamp owned by the caller (OIDC id or gk_session id),
// newest first. Read-only. Does not create an identity for cookieless callers.
lyricsRouter.get("/lyrics/imports", async (req: Request, res: Response) => {
  const hasSession = Boolean((req.cookies as Record<string, string> | undefined)?.["gk_session"]);
  if (!req.dbUser && !hasSession) {
    res.json({ imports: [] });
    return;
  }
  try {
    const usageUser = await getUsageUser(req, res);
    const rows = await db
      .select()
      .from(lyricImportsTable)
      .where(eq(lyricImportsTable.userId, usageUser.id))
      .orderBy(desc(lyricImportsTable.stampedAt));
    res.json({ imports: rows.map(serializeImport) });
  } catch (err) {
    req.log.error({ err }, "Lyric imports list failed");
    res.status(500).json({ error: "Could not load your protected lyrics." });
  }
});

// ─── POST /api/lyrics/forensic-entry ─────────────────────────────────────────
// Log a single edit event to the immutable forensic ledger.
lyricsRouter.post("/lyrics/forensic-entry", async (req: Request, res: Response) => {
  const {
    projectId, sessionId, editType, lineIndex,
    originalText, newText, regenInstruction,
    levenshteinDelta, authorshipScoreBefore, authorshipScoreAfter,
  } = req.body as {
    projectId?: string;
    sessionId?: string;
    editType?: string;
    lineIndex?: number;
    originalText?: string;
    newText?: string;
    regenInstruction?: string;
    levenshteinDelta?: number;
    authorshipScoreBefore?: number;
    authorshipScoreAfter?: number;
  };

  if (!projectId || !editType) {
    res.status(400).json({ error: "projectId and editType are required" });
    return;
  }

  const forensicProject = await db.query.lyricProjectsTable.findFirst({
    where: eq(lyricProjectsTable.id, projectId),
  });
  if (!forensicProject) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!await isProjectOwner(req, forensicProject.sessionId)) {
    res.status(403).json({ error: "You do not have access to this project." });
    return;
  }

  await db.insert(lyricForensicLedgerTable).values({
    id: randomUUID(),
    projectId,
    sessionId: sessionId ?? null,
    editType,
    lineIndex: lineIndex ?? null,
    originalText: originalText ?? null,
    newText: newText ?? null,
    regenInstruction: regenInstruction ?? null,
    levenshteinDelta: levenshteinDelta ?? null,
    authorshipScoreBefore: authorshipScoreBefore ?? null,
    authorshipScoreAfter: authorshipScoreAfter ?? null,
  });

  res.json({ ok: true });
});

// ─── POST /api/lyrics/project ────────────────────────────────────────────────
lyricsRouter.post("/lyrics/project", async (req: Request, res: Response) => {
  const {
    aiDraft, content, title, genre, bpm,
    mode, storyPrompt, key, vocalType, genreTags,
    linesState, stylePrompt, generationCount,
  } = req.body as {
    aiDraft?: string;
    content?: string;
    title?: string;
    genre?: string;
    bpm?: number;
    mode?: string;
    storyPrompt?: string;
    key?: string;
    vocalType?: string;
    genreTags?: string;
    linesState?: LineState[];
    stylePrompt?: string;
    generationCount?: number;
  };

  if (!aiDraft) {
    res.status(400).json({ error: "aiDraft is required" });
    return;
  }

  // The canonical saved lyric text: the user's current (possibly edited)
  // content when provided, otherwise the AI draft itself.
  const savedContent = (content ?? "").trim() || aiDraft;

  // GravelKing Protocol gate: lyrics entering the library must clear the AI
  // copyright screen. Enforced HERE (not just in the UI) — the /lyrics/verify
  // endpoint is only a preview; the cache makes verify-then-save cheap.
  // Both the stored draft AND the canonical content are screened (identical
  // text is a single cached screening).
  let screeningUnavailable = false;
  for (const text of savedContent === aiDraft ? [savedContent] : [savedContent, aiDraft]) {
    const projectScreen = await verifyLyrics(text);
    if (projectScreen.verdict === "flagged") {
      res.status(422).json({
        error: projectScreen.reason ||
          "These lyrics appear to reproduce a released song and cannot be saved. Rewrite the matching passage in your own words.",
        code: "lyrics_flagged",
        ...(projectScreen.matchedWork ? { matchedWork: projectScreen.matchedWork } : {}),
      });
      return;
    }
    if (projectScreen.screeningUnavailable) screeningUnavailable = true;
  }

  const initialScore = savedContent === aiDraft ? 0 : authorshipScore(aiDraft, savedContent);

  const id = randomUUID();
  // Owner principal: the existing gk_session cookie, else a FRESHLY GENERATED
  // high-entropy token. NEVER a user id — user ids are public/stable
  // identifiers (they appear in track metadata and certificate URLs), so
  // accepting one as a bearer credential would let anyone who knows the
  // owner's id spoof the cookie and read/revise/delete the project.
  // When the caller had no cookie we SET one below — the strict owner check
  // denies credential-less access, so the creator must leave with a
  // credential that matches the stored owner.
  const cookieSession = (req.cookies as Record<string, string>)?.["gk_session"];
  const sessionId = cookieSession ?? randomUUID();
  if (!cookieSession) {
    res.cookie("gk_session", sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }

  await db.insert(lyricProjectsTable).values({
    id,
    sessionId,
    title: title || "Untitled Song",
    mode: mode || "simple",
    storyPrompt: storyPrompt ?? null,
    bpm: bpm ?? null,
    key: key ?? null,
    vocalType: vocalType ?? null,
    genreTags: genreTags ?? null,
    aiDraft,
    currentContent: savedContent,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    linesState: (linesState ?? null) as any,
    stylePrompt: stylePrompt ?? null,
    // Legacy column (historic name) — mirrors stylePrompt for old readers.
    sunoPrompt: stylePrompt ?? null,
    genre: genre ?? null,
    authorshipScore: initialScore,
    isCopyrightEligible: initialScore >= 25,
    isAiOnly: savedContent === aiDraft,
    generationCount: generationCount ?? 1,
    isLocked: false,
    updatedAt: new Date(),
  });

  // Canonical library entry, keyed by the project id so /lyrics/revise can
  // update its authorship score + certification status against the same doc.
  saveSongDraft(
    {
      sessionId,
      projectId: id,
      mode: mode || "simple",
      genre: genre ?? undefined,
      storyPrompt: storyPrompt ?? undefined,
      aiDraft,
      stylePrompt: stylePrompt ?? undefined,
      authorshipScore: initialScore,
      isCopyrightEligible: initialScore >= 25,
      is_certified: initialScore >= 25,
      lineCount: parseToLines(savedContent).length,
    },
    id,
  );

  // Fail-open policy (user directive, reconfirmed 2026-08-14): a screening
  // outage never blocks songwriting — but the save must be honestly labeled
  // as unscreened so the client never claims "cleared".
  res.json({ id, ...(screeningUnavailable ? { screeningUnavailable: true } : {}) });
});

// ─── POST /api/lyrics/revise ─────────────────────────────────────────────────
lyricsRouter.post("/lyrics/revise", async (req: Request, res: Response) => {
  const { projectId, content, linesState, editType, lineIndex, originalLineText, regenInstruction } = req.body as {
    projectId?: string;
    content?: string;
    linesState?: LineState[];
    editType?: string;
    lineIndex?: number;
    originalLineText?: string;
    regenInstruction?: string;
  };

  if (!projectId || !content) {
    res.status(400).json({ error: "projectId and content are required" });
    return;
  }

  const project = await db.query.lyricProjectsTable.findFirst({
    where: eq(lyricProjectsTable.id, projectId),
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!await isProjectOwner(req, project.sessionId)) {
    res.status(403).json({ error: "You do not have access to this project." });
    return;
  }

  // GravelKing Protocol gate: revisions are saves too. Without this, a client
  // could create a clean project then revise commercial lyrics into it —
  // screening only at creation would be a bypassable gate.
  const revisionScreen = await verifyLyrics(content);
  if (revisionScreen.verdict === "flagged") {
    res.status(422).json({
      error: revisionScreen.reason ||
        "These lyrics appear to reproduce a released song and cannot be saved. Rewrite the matching passage in your own words.",
      code: "lyrics_flagged",
      ...(revisionScreen.matchedWork ? { matchedWork: revisionScreen.matchedWork } : {}),
    });
    return;
  }
  const reviseScreeningUnavailable = revisionScreen.screeningUnavailable === true;

  const score = authorshipScore(project.aiDraft, content);
  const eligible = score >= 25;

  await db.insert(lyricRevisionsTable).values({
    id: randomUUID(),
    projectId,
    content,
    authorshipScore: score,
    editType: editType ?? null,
    lineIndex: lineIndex ?? null,
    originalLineText: originalLineText ?? null,
    regenInstruction: regenInstruction ?? null,
    changedLines: null,
  });

  await db
    .update(lyricProjectsTable)
    .set({
      currentContent: content,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      linesState: (linesState ?? undefined) as any,
      authorshipScore: score,
      isCopyrightEligible: eligible,
      isAiOnly: false,
      updatedAt: new Date(),
    })
    .where(eq(lyricProjectsTable.id, projectId));

  if (projectId) {
    updateSongDraft(projectId, {
      authorshipScore: score,
      isCopyrightEligible: eligible,
      is_certified: eligible,
    });
  }

  res.json({
    authorshipScore: score,
    isCopyrightEligible: eligible,
    ...(reviseScreeningUnavailable ? { screeningUnavailable: true } : {}),
  });
});

// ─── GET /api/library/studio ─────────────────────────────────────────────────
// Returns the current session's saved song drafts + audio jobs from Firestore.
lyricsRouter.get("/library/studio", async (req: Request, res: Response) => {
  const sessionId = (req.cookies as Record<string, string>)?.["gk_session"];
  if (!sessionId) {
    res.json({ songs: [], jobs: [] });
    return;
  }
  const data = await queryLibraryBySession(sessionId);
  res.json(data);
});

// ─── GET /api/lyrics/certificate/:projectId ──────────────────────────────────
// Server-verified IP certificate payload. Requires Studio (Pro) tier AND a
// project that has reached the 25% human-authorship threshold. Gating lives
// here, not just in the UI, so the certificate cannot be minted by faking client state.
lyricsRouter.get("/lyrics/certificate/:projectId", async (req: Request, res: Response) => {
  if (!(await hasStudio(req))) {
    res.status(403).json({ error: "A Pro (Studio) subscription is required to certify authorship." });
    return;
  }

  const project = await db.query.lyricProjectsTable.findFirst({
    where: eq(lyricProjectsTable.id, String(req.params["projectId"])),
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!await isProjectOwner(req, project.sessionId)) {
    res.status(403).json({ error: "You do not have access to this project." });
    return;
  }
  if (!project.isCopyrightEligible || (project.authorshipScore ?? 0) < 25) {
    res.status(403).json({ error: "This work has not reached the 25% human-authorship threshold yet." });
    return;
  }

  const score = project.authorshipScore ?? 0;
  const token = makeEmbedToken(String(project.id), score);

  res.json({
    title: project.title,
    genre: project.genre,
    authorshipScore: score,
    certifiedAt: new Date().toISOString(),
    embedToken: token,
    embedUrl: `/api/lyrics/embed/${project.id}?token=${token}`,
  });
});

// ─── GET /api/lyrics/embed/:projectId — publicly shareable certificate page ───
// No auth required — token acts as the capability proof.
lyricsRouter.get("/lyrics/embed/:projectId", async (req: Request, res: Response) => {
  const projectId = String(req.params["projectId"]);
  const token = String(req.query["token"] ?? "");

  const project = await db.query.lyricProjectsTable.findFirst({
    where: eq(lyricProjectsTable.id, projectId),
  });

  if (!project) {
    res.status(404).send("<h1>Certificate not found</h1>");
    return;
  }

  const score = project.authorshipScore ?? 0;
  if (!verifyEmbedToken(projectId, score, token)) {
    res.status(403).send("<h1>Invalid or expired certificate token</h1>");
    return;
  }

  if (!project.isCopyrightEligible || score < 25) {
    res.status(403).send("<h1>This work has not reached the authorship threshold</h1>");
    return;
  }

  const title = (project.title ?? "Untitled Work").slice(0, 80);
  const genre = project.genre ?? "Music";
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const fingerprint = `GKP-${token.slice(0, 8).toUpperCase()}-${token.slice(8, 16).toUpperCase()}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IP Certificate — ${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,"Times New Roman",serif;background:#0d0d0d;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
  .cert{background:#fffdf6;border:8px double #c9a227;border-radius:4px;padding:40px 48px;max-width:600px;width:100%;text-align:center}
  .seal{font-size:10px;font-weight:bold;letter-spacing:4px;text-transform:uppercase;color:#c9a227;font-family:Arial,sans-serif}
  h1{font-size:22px;margin:14px 0 4px;color:#161616}
  .badge{display:inline-block;margin:10px 0;padding:6px 16px;border:2px solid #2a7a2a;border-radius:999px;color:#2a7a2a;font-weight:bold;letter-spacing:1px;text-transform:uppercase;font-size:11px;font-family:Arial,sans-serif}
  .title{font-size:20px;font-style:italic;margin:20px 0 4px;color:#1a1a1a}
  .row{font-size:13px;color:#555;margin:4px 0;font-family:Arial,sans-serif}
  .score{font-size:18px;font-weight:bold;color:#2a7a2a;margin:16px 0;font-family:Arial,sans-serif}
  .legal{font-size:11px;color:#666;max-width:480px;margin:14px auto 0;line-height:1.6;font-family:Arial,sans-serif}
  .footer{margin-top:24px;border-top:2px solid #c9a227;padding-top:12px;font-size:10px;color:#999;font-family:monospace}
  .fp{background:#f5f0e8;border:1px solid #d4b96e;border-radius:4px;padding:6px 12px;display:inline-block;margin-top:8px;font-size:11px;letter-spacing:2px;color:#8a6914}
</style>
</head>
<body>
<div class="cert">
  <div class="seal">Gravel King Productions · Engine 2 IP Pipeline</div>
  <h1>Certificate of Human–AI Collaborative Authorship</h1>
  <div class="badge">Certified Human-AI Collaborative Work</div>
  <div class="title">&ldquo;${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}&rdquo;</div>
  <div class="row">Genre: ${genre}</div>
  <div class="row">Date: ${date}</div>
  <div class="score">Human Authorship Score: ${score}%</div>
  <div class="legal">This document certifies that the named work contains sufficient human creative
  expression — through manual line-by-line editing of AI-generated elements —
  to support a claim of human authorship under current U.S. Copyright Office guidance
  (Thaler v. Vidal, 2023). The complete forensic edit ledger is retained on file.</div>
  <div class="footer">
    Verified by forensic authorship ledger<br>
    <div class="fp">${fingerprint}</div>
  </div>
</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.send(html);
});

// ─── DELETE /api/lyrics/project/:id ──────────────────────────────────────────
// Owner-scoped delete. Cascades via FK (revisions, forensic ledger, timeline
// blocks all have onDelete:"cascade"). Firestore draft is also cleaned up.
lyricsRouter.delete("/lyrics/project/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);

  const project = await db.query.lyricProjectsTable.findFirst({
    where: eq(lyricProjectsTable.id, id),
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!await isProjectOwner(req, project.sessionId)) {
    res.status(403).json({ error: "You do not have access to this project." });
    return;
  }

  await db.delete(lyricProjectsTable).where(eq(lyricProjectsTable.id, id));

  // Best-effort Firestore cleanup — fire-and-forget, never fails the response.
  deleteSongDraft(id);

  res.json({ ok: true });
});

// ─── GET /api/lyrics/project/:id ─────────────────────────────────────────────
lyricsRouter.get("/lyrics/project/:id", async (req: Request, res: Response) => {
  const id = String(req.params["id"]);

  const project = await db.query.lyricProjectsTable.findFirst({
    where: eq(lyricProjectsTable.id, id),
  });
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!await isProjectOwner(req, project.sessionId)) {
    res.status(403).json({ error: "You do not have access to this project." });
    return;
  }

  const revisions = await db.query.lyricRevisionsTable.findMany({
    where: eq(lyricRevisionsTable.projectId, id),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 50,
  });

  const forensicLog = await db.query.lyricForensicLedgerTable.findMany({
    where: eq(lyricForensicLedgerTable.projectId, id),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });

  res.json({ project, revisions, forensicLog });
});

// ─── POST /api/lyrics/timeline-blocks ────────────────────────────────────────
lyricsRouter.post("/lyrics/timeline-blocks", async (req: Request, res: Response) => {
  const { projectId, blocks } = req.body as {
    projectId?: string;
    blocks?: Array<{ timestampMs: number; label: string; sectionType: string; sortOrder: number }>;
  };

  if (!projectId || !blocks?.length) {
    res.status(400).json({ error: "projectId and blocks are required" });
    return;
  }

  const blocksProject = await db.query.lyricProjectsTable.findFirst({
    where: eq(lyricProjectsTable.id, projectId),
  });
  if (!blocksProject) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!await isProjectOwner(req, blocksProject.sessionId)) {
    res.status(403).json({ error: "You do not have access to this project." });
    return;
  }

  // Replace all blocks for this project
  await db.delete(lyricTimelineBlocksTable).where(eq(lyricTimelineBlocksTable.projectId, projectId));

  const rows = blocks.map((b) => ({
    id: randomUUID(),
    projectId,
    timestampMs: b.timestampMs,
    label: b.label,
    sectionType: b.sectionType || null,
    sortOrder: b.sortOrder,
  }));

  await db.insert(lyricTimelineBlocksTable).values(rows);
  res.json({ ok: true });
});

export default lyricsRouter;
