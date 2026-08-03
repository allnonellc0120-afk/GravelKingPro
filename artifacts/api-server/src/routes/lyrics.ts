import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { saveSongDraft, updateSongDraft, queryLibraryBySession } from "../lib/firestore";
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
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID, createHmac, createHash } from "crypto";
import type { LineState } from "@workspace/db";
import { authorshipScore } from "@workspace/authorship";
import { generateVertexText, isVertexConfigured } from "../geminiVertex";
import { generateProxyText, isProxyConfigured } from "../geminiProxy";
import { logger } from "../lib/logger";
import { logToolError } from "../lib/errorTracker";
import { recordActivity } from "../lib/activityTracker";

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
 * Lyric/songwriter generation — resilient dual-provider.
 *
 * Prefers the user's own Google Cloud Vertex AI when GCP_SERVICE_ACCOUNT holds
 * a valid service-account credential. If that credential is absent/invalid, or
 * the Vertex call errors or returns nothing, it falls back to Replit's managed
 * Gemini proxy so the songwriter keeps working. Only if the active provider(s)
 * fail does it throw, so the route returns a 500 instead of a fake result.
 */
async function geminiGenerate(prompt: string): Promise<string> {
  const cfg = { maxOutputTokens: 8192 };
  // 45s max per provider. Full-song generations routinely take 12–15s on the
  // Gemini proxy; a 15s cap sat right on that edge and intermittently killed
  // otherwise-successful generations ("Lyric generation failed").
  const TIMEOUT_MS = 45_000;

  // Race both providers simultaneously — whichever responds first with a
  // non-empty result wins. MLK v3 kernel runs on the output side regardless
  // of which provider answered.
  const candidates: Promise<string>[] = [];

  if (isVertexConfigured()) {
    candidates.push(
      generateVertexText(prompt, { ...cfg, responseMimeType: "text/plain" })
        .then(t => { if (!t.trim()) throw new Error("vertex:empty"); return t; })
        .catch(err => { logger.warn({ err }, "Vertex AI race lost or failed"); throw err; })
    );
  }

  if (isProxyConfigured()) {
    candidates.push(
      generateProxyText(prompt, cfg, TIMEOUT_MS)
        .then(t => { if (!t.trim()) throw new Error("proxy:empty"); return t; })
        .catch(err => { logger.warn({ err }, "Replit proxy race lost or failed"); throw err; })
    );
  }

  if (candidates.length === 0) {
    throw new Error("No AI provider configured (set GCP_SERVICE_ACCOUNT or AI_INTEGRATIONS_GEMINI_*)");
  }

  // Promise.any: first fulfillment wins; only throws AggregateError if ALL fail
  return Promise.any(candidates);
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

// Best-effort project ownership for the by-id lyric routes. Blocks only when the
// caller presents a DIFFERENT gk_session than the one that owns the project, so a
// logged-in user cannot read/tamper with another session's IP work just by
// knowing the id. Callers with NO gk_session (e.g. OIDC users, who never receive
// that cookie) pass through so we never lock someone out of their own project.
// Residual gap: a caller sending no cookie at all is not blocked — fully closing
// the IDOR needs an owner userId column + anon session token (tracked follow-up).
function ownershipMismatch(req: Request, projectSessionId: string | null | undefined): boolean {
  const caller = (req.cookies as Record<string, string> | undefined)?.["gk_session"];
  return Boolean(caller) && Boolean(projectSessionId) && caller !== projectSessionId;
}

// ─── POST /api/lyrics/generate ───────────────────────────────────────────────
// Supports both simple (story prompt) and advanced (timeline canvas) modes.
lyricsRouter.post("/lyrics/generate", lyricsGenRateLimit, async (req: Request, res: Response) => {
  recordActivity((req.cookies as Record<string, string> | undefined)?.["gk_session"], "Lyric Generator");
  const {
    story, genre, bpm, mode,
    key, vocalType, genreTags,
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

  const structure = isAdvanced
    ? timelineBlocks!
        .sort((a, b) => a.timestampMs - b.timestampMs)
        .map(({ timestampMs, label, sectionType }) => {
          const m = Math.floor(timestampMs / 60000);
          const s = Math.floor((timestampMs % 60000) / 1000);
          return `${m}:${String(s).padStart(2, "0")} [${label}] (${sectionType})`;
        })
        .join("\n")
    : "[Intro]\n[Verse 1]\n[Pre-Chorus]\n[Chorus]\n[Verse 2]\n[Pre-Chorus]\n[Chorus]\n[Bridge]\n[Outro/Chorus]";

  const prompt = isAdvanced
    ? `You are a professional songwriter. Write lyrics that strictly match this song timeline.

Global parameters:
- Genre: ${genreTags || genre || "Pop"}
- BPM: ${bpm || "moderate tempo"}
- Key: ${key || "not specified"}
- Vocal type: ${vocalType || "not specified"}

Timeline (align lyrics cadence, syllable pacing, and emotional delivery to each block):
${structure}

Rules:
- Write lyrics for every timeline block in order, labeling each exactly as: [$LABEL]
- Match syllable pacing to the BPM and emotional tone of each block
- Do NOT include explanatory text — output lyrics only
- After the lyrics, on the LAST LINE output exactly:
  SUNO_PROMPT: [genre] [2-3 mood adjectives] [key instruments] [tempo] [vocal type] vocals`
    : `You are a professional songwriter.

The user's story or idea: "${story!.trim()}"
Genre: ${genre || "Pop"}
BPM: ${bpm ? `${bpm} BPM` : "moderate tempo"}

Generate a complete, singable song with this exact structure:
${structure}

Rules:
- Rhyme scheme: consistent ABAB or AABB within each section
- Line length: 8-12 syllables, optimized for singing
- Chorus must be a strong, memorable hook
- Stay true to the emotional tone of the story
- Do NOT include explanatory text — output lyrics only

After the lyrics, on the LAST LINE output exactly:
SUNO_PROMPT: [genre] [2-3 mood adjectives] [key instruments] [tempo] vocals`;

  try {
    const fullText = (await geminiGenerate(`${prompt}${songwritingPolicy(genreTags || genre, Boolean(isExplicit))}`)).trim();
    const sunoMatch = fullText.match(/^SUNO_PROMPT:\s*(.+)$/m);
    const stylePrompt = sunoMatch ? sunoMatch[1].trim() : `${genre || "Pop"} emotional vocals`;
    const lyrics = fullText.replace(/^SUNO_PROMPT:.*$/m, "").trim();
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
SUNO_PROMPT: [genre] [2-3 mood adjectives] [key instruments] [tempo] vocals`;

  try {
    const fullText = (await geminiGenerate(prompt)).trim();
    const sunoMatch = fullText.match(/^SUNO_PROMPT:\s*(.+)$/m);
    const stylePrompt = sunoMatch ? sunoMatch[1].trim() : `${genre || "Pop"} emotional vocals`;
    const lyrics = fullText.replace(/^SUNO_PROMPT:.*$/m, "").trim();
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

  const prompt = `Convert this music style description into Suno AI style tags.

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
    res.json({ import: serializeImport(row!) });
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
  if (!req.isAuthenticated() && !hasSession) {
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
  if (ownershipMismatch(req, forensicProject.sessionId)) {
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
    aiDraft, title, genre, bpm, sunoPrompt,
    mode, storyPrompt, key, vocalType, genreTags,
    linesState, stylePrompt, generationCount,
  } = req.body as {
    aiDraft?: string;
    title?: string;
    genre?: string;
    bpm?: number;
    sunoPrompt?: string;
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

  const id = randomUUID();
  const sessionId = (req.cookies as Record<string, string>)?.["gk_session"] ?? randomUUID();

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
    currentContent: aiDraft,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    linesState: (linesState ?? null) as any,
    stylePrompt: stylePrompt ?? sunoPrompt ?? null,
    sunoPrompt: sunoPrompt ?? stylePrompt ?? null,
    genre: genre ?? null,
    authorshipScore: 0,
    isCopyrightEligible: false,
    isAiOnly: true,
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
      stylePrompt: stylePrompt ?? sunoPrompt ?? undefined,
      authorshipScore: 0,
      isCopyrightEligible: false,
      is_certified: false,
      lineCount: parseToLines(aiDraft).length,
    },
    id,
  );

  res.json({ id });
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
  if (ownershipMismatch(req, project.sessionId)) {
    res.status(403).json({ error: "You do not have access to this project." });
    return;
  }

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

  res.json({ authorshipScore: score, isCopyrightEligible: eligible });
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
  if (ownershipMismatch(req, project.sessionId)) {
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
  if (ownershipMismatch(req, project.sessionId)) {
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
  if (ownershipMismatch(req, blocksProject.sessionId)) {
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
