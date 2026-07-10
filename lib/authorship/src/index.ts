import DiffMatchPatch from "diff-match-patch";

/**
 * Extra credit multipliers layered on top of the base human-authored fraction.
 * - DELETION_WEIGHT: removing AI-written text is editorial human work, but it
 *   does not appear in the final piece, so it earns partial credit.
 * - STRUCTURAL_WEIGHT: relocating a word/phrase to a different sentence is a
 *   deliberate structural authorship decision and earns an extra bonus on top
 *   of the insert credit the relocated text already receives.
 */
const DELETION_WEIGHT = 0.5;
const STRUCTURAL_WEIGHT = 0.5;

const OP_DELETE = -1;
const OP_INSERT = 1;

function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

function tokenizeWords(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

/**
 * Human-authorship score (0–100) comparing the FINAL lyric text against the
 * original AI draft, using diff-match-patch semantic diffing
 * (`diff_main` + `diff_cleanupSemantic`).
 *
 * Design:
 * - The score is computed from the FINAL text vs the ORIGINAL AI draft, never
 *   from per-keystroke churn. A delete-then-retype of the SAME text at the SAME
 *   position leaves the final text identical to the draft there, so it produces
 *   no diff and earns **0 credit**.
 * - Text the human newly wrote (present in the final, absent from the draft)
 *   counts as authorship. Text the human deleted from the draft earns partial
 *   editorial credit.
 * - A word/phrase relocated to a DIFFERENT sentence shows up as a delete in one
 *   place and an insert in another. These **structural moves** earn an extra
 *   bonus, so genuine rearrangement is rewarded more than incidental edits.
 *
 * The result is a 0–100 percentage representing how much of the final work
 * originates from the human, suitable for the copyright-eligibility threshold.
 */
export function authorshipScore(aiDraft: string, finalText: string): number {
  const a = normalize(aiDraft ?? "");
  const b = normalize(finalText ?? "");
  if (a.length === 0) return 100;
  if (a === b) return 0;
  if (b.length === 0) return 0;

  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(a, b);
  dmp.diff_cleanupSemantic(diffs);

  let deletedChars = 0;
  let insertedChars = 0;
  const deletedWords: string[] = [];
  const insertedWords: string[] = [];

  for (const [op, text] of diffs) {
    if (op === OP_DELETE) {
      deletedChars += text.length;
      deletedWords.push(...tokenizeWords(text));
    } else if (op === OP_INSERT) {
      insertedChars += text.length;
      insertedWords.push(...tokenizeWords(text));
    }
  }

  // Structural moves: words that were removed from one location AND inserted at
  // another (multiset intersection) — the human rearranged them.
  const removed = new Map<string, number>();
  for (const w of deletedWords) removed.set(w, (removed.get(w) ?? 0) + 1);
  let movedChars = 0;
  for (const w of insertedWords) {
    const n = removed.get(w) ?? 0;
    if (n > 0) {
      removed.set(w, n - 1);
      movedChars += w.length;
    }
  }

  const denom = Math.max(b.length, 1);
  const humanBase = insertedChars;
  const deletionCredit = deletedChars * DELETION_WEIGHT;
  const structuralBonus = movedChars * STRUCTURAL_WEIGHT;
  const raw = (humanBase + deletionCredit + structuralBonus) / denom;

  return Math.max(0, Math.min(100, Math.round(raw * 100)));
}
