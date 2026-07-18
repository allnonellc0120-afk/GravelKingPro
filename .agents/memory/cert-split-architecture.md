---
name: GravelKing IP Cert — Nominator/Denominator Split
description: Cryptographic split-key cert system for audio ownership proof. Track carries nominator, server keeps denominator. Dual-stored on Postgres + Firestore.
---

## The Split

**fullHash** = SHA-256(contentHash | artist | certId)  — 64 hex chars

- **Nominator** (first 32 chars) → embedded in track LSBs as JSON `{ v:2, id, n, a }`
- **Denominator** (last 32 chars) → stored server-side only in `ip_cert_stubs`
- **Handshake** = HMAC-SHA256(certId|nominator|denominator, SESSION_SECRET) → also server-only

Neither half alone proves ownership. Verification requires track (nominator) + server (denominator + handshake).

## Kernel Role (kernel-v3.ts)

`embedLsbPayload(wavBuf, payload)` — opaque bit transport only. No hashing, no HMAC.  
`extractLsbPayload(wavBuf)` — returns raw bytes or null (null = not stamped or re-encoded).  
Wire format: `GKPW\x03` (5 bytes) + uint16BE length + payload bytes.

**Why:** Kernel is deliberately ignorant of cert math — all crypto stays in master.ts (server route), never in a shared lib that could leak to client bundle.

## Storage

Primary: `ip_cert_stubs` Postgres table (via `@workspace/db`)  
Backup: Firestore `gk_cert_stubs` collection (via `backupCertStub()` in lib/firestore.ts)  
Firestore backup = independently court-subpoenable even if GravelKing closes.

## Style Authorship Score

`styleAuthorshipScore(prompt)` in `@workspace/authorship` — scores 0–100 on 8 dimensions:  
BPM (+15), instruments (+8×, max 32), structure terms (+5×, max 25), genre specificity (+8/+20),  
mood words (+5×, max 15), musical key (+10), time signature (+5), production style (+5).

Threshold: ≥25 = copyright eligible (same as lyric authorship threshold).  
Stored in `ip_cert_stubs.style_authorship_score` alongside the cert.

## Verify Endpoint

`POST /api/kernel/verify-cert` — upload WAV, server extracts nominator, looks up DB, re-derives HMAC.  
Returns `{ valid: true, certId, artist, certifiedAt }` or `{ valid: false, reason }`.  
Possible reasons: NO_GKP_WATERMARK, PAYLOAD_CORRUPT, CERT_NOT_ON_SERVER, HANDSHAKE_MISMATCH, NOMINATOR_TAMPERED.

**Why:** Only the GK server can verify — it's the sole authority for the handshake token.

## Legal Standing

- Promo Scene9 covers the copyright pioneering argument for producer pitches
- US Copyright Office 2023: human selection/arrangement of AI elements IS copyrightable
- Style prompt score proves human creative direction was specific enough to claim arrangement copyright
- Firestore timestamp = server-authoritative creation record, not client-controlled
