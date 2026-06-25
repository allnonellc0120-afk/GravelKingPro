import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { saveSongDraft, updateSongDraft, queryLibraryBySession } from "../lib/firestore";
import { hasStudio } from "../lib/entitlement";
import { rateLimit } from "../lib/rateLimiter";
import {
  db,
  lyricProjectsTable,
  lyricRevisionsTable,
  lyricForensicLedgerTable,
  lyricTimelineBlocksTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { LineState } from "@workspace/db";

const GEMINI_BASE = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"] ?? "";
const GEMINI_KEY  = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"]  ?? "";

async function geminiGenerate(prompt: string): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-3-flash-preview:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${body}`);
  }
  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function levenshteinPercent(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return 100;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = temp;
    }
  }
  return Math.min(100, Math.round(((dp[n] ?? 0) / m) * 100));
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
  const {
    story, genre, bpm, mode,
    key, vocalType, genreTags,
    timelineBlocks,
  } = req.body as {
    story?: string;
    genre?: string;
    bpm?: number;
    mode?: "simple" | "advanced";
    key?: string;
    vocalType?: string;
    genreTags?: string;
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
    const fullText = (await geminiGenerate(prompt)).trim();
    const sunoMatch = fullText.match(/^SUNO_PROMPT:\s*(.+)$/m);
    const stylePrompt = sunoMatch ? sunoMatch[1].trim() : `${genre || "Pop"} emotional vocals`;
    const lyrics = fullText.replace(/^SUNO_PROMPT:.*$/m, "").trim();
    const lines = parseToLines(lyrics);

    // Note: the library entry is created when the user SAVES a project
    // (POST /lyrics/project), keyed by the project id so revise can update it.
    res.json({ lyrics, stylePrompt, lines });
  } catch (err) {
    req.log.error({ err }, "Gemini lyric generation failed");
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
    res.status(500).json({ error: "Style conversion failed." });
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

  const score = levenshteinPercent(project.aiDraft, content);
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

  res.json({
    title: project.title,
    genre: project.genre,
    authorshipScore: project.authorshipScore,
    certifiedAt: new Date().toISOString(),
  });
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
