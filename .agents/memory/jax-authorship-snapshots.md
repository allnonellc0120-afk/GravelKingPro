---
name: JAX authorship snapshots
description: AI lyric responses stay immutable; only direct edits in a response lyric editor receive human attribution.
---

AI responses must be recorded as immutable per-response snapshots. Later AI revisions are separate AI snapshots, not human edits to the prior response. Human authorship is awarded only when the user directly changes the lyric text in the inline editor; spoken or typed instructions alone are not lyric authorship.

**Why:** Treating an AI replacement response as a diff from the original draft falsely credited the changed words to the human.

**How to apply:** Compare each lyric card against its own stored AI snapshot for the live diff, while the session-level score compares the final song against the original AI baseline.