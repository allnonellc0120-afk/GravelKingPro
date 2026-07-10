---
name: Lyric import possession stamp
description: Design intent for the "Import Custom Lyrics" possession-stamp feature — a separate 100%-human IP track, isolated from the AI-collab scoring flow
---

# Lyric import possession stamp (gravelkingpro)

Users can paste lyrics they wrote themselves and "stamp" them: the server SHA-256
hashes the normalized text and stores hash + plaintext + server timestamp in the
dedicated `lyric_imports` table with `stampType = "imported_human_original"`. A
"My Protected Lyrics" dashboard lists them, visually distinct from AI drafts.

## Keep imported human lyrics isolated from the AI-collab flow
Imported lyrics are a DIFFERENT track from in-app AI-assisted lyrics
(`lyric_projects` + authorship scoring + forensic ledger). Separate table, separate
classifier, separate dashboard.
**Why:** the user's whole point is that fully-human work must be provably classified
differently from AI-collaborative work — never conflate them or run imported text
through the AI authorship score.
**How to apply:** any new authorship/IP feature must pick which track it belongs to;
do not merge lyric_imports into lyric_projects or vice-versa.

## Certification is a server-side gate storing canonical text
The "NOT produced by an AI" certification is enforced server-side (reject if
`certifiedHumanAuthor !== true`), and the stored certification statement is always
the server's canonical constant — the client-supplied text is ignored.
**Why:** the checkbox alone is bypassable, and the stored statement is a legal-ish
record that must not be forgeable by a crafted client.
