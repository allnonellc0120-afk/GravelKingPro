import { Router } from "express";
import type { Request, Response } from "express";
import { db, lyricProjectsTable, lyricRevisionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const GEMINI_BASE = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"] ?? "";
const GEMINI_KEY  = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"]  ?? "";

async function geminiGenerate(prompt: string): Promise<string> {
  const res = await fetch(
    `${GEMINI_BASE}/models/gemini-3-flash-preview:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_KEY,
      },
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

const lyricsRouter = Router();

// POST /api/lyrics/generate — Gemini lyric generation (free, output watermarked)
lyricsRouter.post("/api/lyrics/generate", async (req: Request, res: Response) => {
  const { story, genre, bpm } = req.body as {
    story?: string;
    genre?: string;
    bpm?: number;
  };

  if (!story || typeof story !== "string" || story.trim().length < 5) {
    res.status(400).json({ error: "story is required (min 5 characters)" });
    return;
  }

  const prompt = `You are a professional songwriter and lyric writer.

The user has given you this story or idea:
"${story.trim()}"

Genre: ${genre || "Pop"}
BPM feel: ${bpm ? `${bpm} BPM` : "moderate tempo"}

Generate a complete, singable song with this exact structure. Use the section labels exactly as written:

[Verse 1]
(4 lines)

[Pre-Chorus]
(2 lines)

[Chorus]
(4 lines)

[Verse 2]
(4 lines)

[Pre-Chorus]
(2 lines)

[Chorus]
(4 lines)

[Bridge]
(2-3 lines)

[Outro/Chorus]
(4 lines)

Rules:
- Rhyme scheme: consistent ABAB or AABB within each section
- Line length: 8-12 syllables, optimized for singing
- Chorus must be a strong, memorable hook
- Stay true to the emotional tone of the story
- Do NOT include explanatory text — output lyrics only

After the lyrics, on the LAST LINE output exactly this format (no line break before):
SUNO_PROMPT: [genre] [2-3 mood adjectives] [key instruments] [tempo] vocals`;

  try {
    const fullText = (await geminiGenerate(prompt)).trim();
    const sunoMatch = fullText.match(/^SUNO_PROMPT:\s*(.+)$/m);
    const sunoPrompt = sunoMatch
      ? sunoMatch[1].trim()
      : `${genre || "Pop"} emotional heartfelt vocals`;
    const lyrics = fullText.replace(/^SUNO_PROMPT:.*$/m, "").trim();

    res.json({ lyrics, sunoPrompt });
  } catch (err) {
    req.log.error({ err }, "Gemini lyric generation failed");
    res.status(500).json({ error: "Lyric generation failed. Please try again." });
  }
});

// POST /api/lyrics/project — save a new project to DB
lyricsRouter.post("/api/lyrics/project", async (req: Request, res: Response) => {
  const { aiDraft, title, genre, bpm, sunoPrompt } = req.body as {
    aiDraft?: string;
    title?: string;
    genre?: string;
    bpm?: number;
    sunoPrompt?: string;
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
    aiDraft,
    currentContent: aiDraft,
    authorshipScore: 0,
    isCopyrightEligible: false,
    genre: genre ?? null,
    bpm: bpm ?? null,
    sunoPrompt: sunoPrompt ?? null,
    isAiOnly: true,
    updatedAt: new Date(),
  });

  res.json({ id });
});

// GET /api/lyrics/project/:id — load project + revision log
lyricsRouter.get("/api/lyrics/project/:id", async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const project = await db.query.lyricProjectsTable.findFirst({
    where: eq(lyricProjectsTable.id, id),
  });

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const revisions = await db.query.lyricRevisionsTable.findMany({
    where: eq(lyricRevisionsTable.projectId, id),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 50,
  });

  res.json({ project, revisions });
});

// POST /api/lyrics/revise — save edit, compute authorship score
lyricsRouter.post("/api/lyrics/revise", async (req: Request, res: Response) => {
  const { projectId, content } = req.body as {
    projectId?: string;
    content?: string;
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

  const score = levenshteinPercent(project.aiDraft, content);
  const eligible = score >= 20;

  await db.insert(lyricRevisionsTable).values({
    id: randomUUID(),
    projectId,
    content,
    authorshipScore: score,
    changedLines: null,
  });

  await db
    .update(lyricProjectsTable)
    .set({
      currentContent: content,
      authorshipScore: score,
      isCopyrightEligible: eligible,
      isAiOnly: false,
      updatedAt: new Date(),
    })
    .where(eq(lyricProjectsTable.id, projectId));

  res.json({ authorshipScore: score, isCopyrightEligible: eligible });
});

// POST /api/lyrics/expand — Gemini completes partial user-written lyrics
lyricsRouter.post("/api/lyrics/expand", async (req: Request, res: Response) => {
  const { partialLyrics, genre, bpm, styleContext } = req.body as {
    partialLyrics?: string;
    genre?: string;
    bpm?: number;
    styleContext?: string;
  };

  if (!partialLyrics || typeof partialLyrics !== "string" || partialLyrics.trim().length < 5) {
    res.status(400).json({ error: "partialLyrics is required (min 5 characters)" });
    return;
  }

  const prompt = `You are a professional songwriter. The user has written these lyrics (full or partial) for a ${genre || "Pop"} song${bpm ? ` at ${bpm} BPM` : ""}${styleContext ? ` with this style: ${styleContext}` : ""}:

---
${partialLyrics.trim()}
---

Your job: complete and expand these lyrics into a full song. Rules:
- PRESERVE every line the user wrote exactly as written — do not change them
- Fill in missing sections around the user's lines
- Use standard structure: [Verse 1] [Pre-Chorus] [Chorus] [Verse 2] [Pre-Chorus] [Chorus] [Bridge] [Outro/Chorus]
- Match the rhyme scheme, syllable count and emotional tone already established
- Output ONLY the lyrics — no explanations, no commentary

After the lyrics, on the LAST LINE output exactly:
SUNO_PROMPT: [genre] [2-3 mood adjectives] [key instruments] [tempo] vocals`;

  try {
    const fullText = (await geminiGenerate(prompt)).trim();
    const sunoMatch = fullText.match(/^SUNO_PROMPT:\s*(.+)$/m);
    const sunoPrompt = sunoMatch ? sunoMatch[1].trim() : `${genre || "Pop"} emotional vocals`;
    const lyrics = fullText.replace(/^SUNO_PROMPT:.*$/m, "").trim();
    res.json({ lyrics, sunoPrompt });
  } catch (err) {
    req.log.error({ err }, "Gemini expand failed");
    res.status(500).json({ error: "Expansion failed. Please try again." });
  }
});

// POST /api/lyrics/convert-style — Gemini converts free-text style → Suno-compatible tags
lyricsRouter.post("/api/lyrics/convert-style", async (req: Request, res: Response) => {
  const { styleDescription } = req.body as { styleDescription?: string };

  if (!styleDescription || typeof styleDescription !== "string" || styleDescription.trim().length < 3) {
    res.status(400).json({ error: "styleDescription is required" });
    return;
  }

  const prompt = `Convert this music style description into Suno AI style tags.

Description: "${styleDescription.trim()}"

Rules:
- Output ONLY comma-separated style tags — no labels, no explanations, no full sentences
- Maximum 120 characters total
- Translate artist/song references into their actual sonic characteristics:
  e.g. "sounds like Drake" → "melodic rap, Toronto drill, emotional vocals, dark trap"
  e.g. "like Radiohead" → "art rock, melancholic, layered guitars, ethereal vocals"
- Include: genre, mood adjectives, key instruments, tempo feel, vocal style
- Example output: dark trap, heavy 808s, atmospheric strings, 140bpm, melodic vocals, midnight energy

Output the style tags only:`;

  try {
    const raw = (await geminiGenerate(prompt)).trim();
    const tags = raw.replace(/^(style tags:|output:|tags:)/i, "").trim().slice(0, 180);
    res.json({ styleTags: tags });
  } catch (err) {
    req.log.error({ err }, "Gemini style conversion failed");
    res.status(500).json({ error: "Style conversion failed. Please try again." });
  }
});

/**
 * Levenshtein edit distance expressed as a percentage of the original length.
 * Capped at 100. Used for the Authorship Meter.
 */
function levenshteinPercent(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return 100;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j]!;
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j]!, dp[j - 1]!);
      prev = temp;
    }
  }
  return Math.min(100, Math.round(((dp[n] ?? 0) / m) * 100));
}

export default lyricsRouter;
