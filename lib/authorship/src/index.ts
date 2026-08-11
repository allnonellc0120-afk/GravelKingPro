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

// ── Style / Instrumental Authorship Scorer ────────────────────────────────────
//
// Measures how much HUMAN creative specificity went into a style prompt used
// to generate an instrumental (the in-house MLK v3.5 generator). The more specific the prompt,
// the stronger the copyright claim on the resulting arrangement.
//
// Thresholds:
//   0–24  → insufficient (generic "make a rock song")
//  25–49  → baseline — qualifies for arrangement copyright claim
//  50–74  → strong — specific enough to be distinctly yours
//  75–100 → very strong — detailed enough to be near-impossible to replicate

export interface StyleScoreBreakdown {
  bpm:              number;  // BPM/tempo specified
  instruments:      number;  // named instruments (×8, max 32)
  structure:        number;  // song sections named (×5, max 25)
  genre:            number;  // specific genre vs generic
  mood:             number;  // mood/emotion words (×5, max 15)
  key:              number;  // musical key specified
  timeSignature:    number;  // time signature specified
  productionStyle:  number;  // production descriptors
}

export interface StyleAuthorshipResult {
  score:      number;
  breakdown:  StyleScoreBreakdown;
  eligible:   boolean;   // score >= 25
  label:      string;    // human-readable tier
}

export function styleAuthorshipScore(prompt: string): StyleAuthorshipResult {
  const zero: StyleScoreBreakdown = {
    bpm: 0, instruments: 0, structure: 0, genre: 0,
    mood: 0, key: 0, timeSignature: 0, productionStyle: 0,
  };
  if (!prompt?.trim()) {
    return { score: 0, breakdown: zero, eligible: false, label: "No prompt" };
  }

  const p = prompt.toLowerCase();
  const b: StyleScoreBreakdown = { ...zero };

  // ── BPM / tempo (+15) ───────────────────────────────────────────────────
  if (/\b\d{2,3}\s*bpm\b|\bbpm\s*[\s:=]?\d{2,3}|\b(tempo|at)\s+\d{2,3}\b/.test(p)) {
    b.bpm = 15;
  }

  // ── Named instruments (+8 each, max 32) ─────────────────────────────────
  const INSTRUMENTS = [
    "acoustic guitar","electric guitar","bass guitar","rhythm guitar","lead guitar",
    "drums","drum kit","kick drum","snare","hi-hat","hi hat","cymbal","tom",
    "piano","grand piano","upright piano","electric piano","rhodes","keyboard",
    "synthesizer","synth","moog","808","909",
    "violin","cello","viola","double bass","strings","orchestra","brass",
    "trumpet","trombone","saxophone","sax","alto sax","tenor sax","flute","clarinet","oboe",
    "organ","hammond","banjo","mandolin","ukulele","harp","sitar","oud",
    "mellotron","vocoder","talk box","theremin",
  ];
  b.instruments = Math.min(32, INSTRUMENTS.filter(i => p.includes(i)).length * 8);

  // ── Song structure terms (+5 each, max 25) ───────────────────────────────
  const STRUCTURES = [
    "intro","verse","pre-chorus","pre chorus","chorus","hook",
    "bridge","outro","breakdown","drop","interlude","coda","refrain","tag","vamp",
  ];
  b.structure = Math.min(25, STRUCTURES.filter(s => p.includes(s)).length * 5);

  // ── Genre specificity (+8 generic, +20 specific compound genre) ──────────
  const SPECIFIC_GENRES = [
    "outlaw grunge","neo-soul","neo soul","trap soul","indie folk","dark trap",
    "lo-fi hip hop","lofi hip hop","bedroom pop","psychedelic rock","synthwave",
    "drill","afrobeat","bossa nova","bluegrass","ambient","post-rock","math rock",
    "emo","shoegaze","nu-metal","nu metal","progressive rock","prog rock",
    "southern gothic","memphis rap","cloud rap","witch house","vapor wave","vaporwave",
    "alternative r&b","alt r&b","garage rock","surf rock","spaghetti western",
    "outlaw country","red dirt","tejano","cumbia","dembow","grime","jungle",
  ];
  const GENERIC_GENRES = [
    "rock","pop","rap","hip hop","hip-hop","country","jazz","blues",
    "classical","r&b","soul","funk","reggae","metal","punk","folk","electronic",
  ];
  if (SPECIFIC_GENRES.some(g => p.includes(g)))      b.genre = 20;
  else if (GENERIC_GENRES.some(g => p.includes(g)))  b.genre = 8;

  // ── Mood / emotion (+5 each, max 15) ─────────────────────────────────────
  const MOODS = [
    "melancholic","melancholy","aggressive","uplifting","dark","haunting",
    "joyful","somber","energetic","mellow","dreamy","intense","nostalgic",
    "raw","angry","hopeful","mysterious","triumphant","gritty","brooding",
    "ethereal","cinematic","anthemic","hypnotic","chaotic","serene",
  ];
  b.mood = Math.min(15, MOODS.filter(m => p.includes(m)).length * 5);

  // ── Musical key (+10) ────────────────────────────────────────────────────
  if (/\bkey of [a-g][#b♯♭]?\s*(major|minor|maj|min)?\b|\b[a-g][#b♯♭]?\s*(major|minor|maj|min)\b/.test(p)) {
    b.key = 10;
  }

  // ── Time signature (+5) ──────────────────────────────────────────────────
  if (/\b[2-9]\/[2-9]\b|\b(waltz|4\/4|3\/4|6\/8|7\/8|5\/4|12\/8)\b/.test(p)) {
    b.timeSignature = 5;
  }

  // ── Production style (+5) ────────────────────────────────────────────────
  const PROD_STYLES = [
    "lo-fi","lofi","hi-fi","hifi","cinematic","polished","raw","dirty",
    "overdriven","reverb-heavy","dry","warm","bright","vintage","analog",
    "tape-saturated","heavily compressed","punchy","airy","thick","sparse",
  ];
  if (PROD_STYLES.some(s => p.includes(s))) b.productionStyle = 5;

  const score = Math.min(100, Object.values(b).reduce((s, v) => s + v, 0));
  const eligible = score >= 25;
  const label =
    score >= 75 ? "Very strong — highly specific arrangement" :
    score >= 50 ? "Strong — distinctly yours" :
    score >= 25 ? "Baseline — arrangement copyright eligible" :
                  "Insufficient — too generic to claim";

  return { score, breakdown: b, eligible, label };
}
