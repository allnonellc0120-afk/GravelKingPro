---
name: Authorship scoring (copyright eligibility)
description: How human-authorship % is computed for lyrics and the invariants that gate copyright eligibility
---

# Authorship scoring

Human-authorship of lyrics is scored by the shared lib `@workspace/authorship`
(`authorshipScore(aiDraft, finalText)`), used by BOTH the server lyrics-revise path
and the web songwriting page. It replaced two duplicated `levenshteinPercent`
helpers — do not reintroduce a per-package copy; import the shared lib.

## Invariants (these are product/legal boundaries, not style choices)
- Output is **clamped 0–100**. Downstream copyright eligibility is `score >= 25`;
  any change that can push the score outside 0–100 silently breaks that gate.
- **Delete + retype the same text at the same position = 0 credit.** This falls out
  naturally because when `finalText === aiDraft` the diff is empty — do not add
  edit-distance heuristics that would award credit for round-trip edits.
- A word **moved to a different sentence** must earn structural (human) credit.
- Empty final text scores 0 (was 100 under the old levenshtein helper) — intended:
  deleting everything is not authorship.

**Why:** the score decides whether a user can claim copyright authorship of AI-assisted
lyrics; over-crediting trivial edits (or mis-scaling past 100) would misrepresent the
IP story, which is the app's core honesty boundary.

## Interop gotchas
- `diff-match-patch` is CJS `export =` the class (with static `DIFF_*` consts).
  Import as `import DiffMatchPatch from "diff-match-patch"` — works via
  `moduleResolution: "bundler"` synthetic defaults (no `esModuleInterop` in this repo),
  and esbuild/Vite both bundle it fine (NOT in build.mjs `external`).
- The web page has a React state var also named `authorshipScore`; the lib import is
  aliased to `computeAuthorshipScore` to avoid the collision. Keep that alias.
- To ad-hoc test the lib with esbuild, import it by **relative path**
  (`./lib/authorship/src/index.ts`), not the `@workspace/authorship` alias — the alias
  only symlinks into consuming packages, so esbuild from the repo root can't resolve it.
