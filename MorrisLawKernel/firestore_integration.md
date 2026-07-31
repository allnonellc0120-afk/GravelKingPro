# Firestore Integration — Server-Side Signing Only

How GravelKing's certificate layer uses Firestore, and the rules that keep it
court-grade. This repo's clients never talk to Firestore directly — they defer
to the live GravelKing server, which is the only party allowed to write.

## Architecture

- Certificates are **dual-stored**: PostgreSQL is the primary system of record;
  Firestore mirrors the cert document for redundancy and independent audit.
- All Firestore access happens **server-side** through a GCP service account
  (`GCP_SERVICE_ACCOUNT` credential, Admin SDK). Clients — including this
  repo's Streamlit app and verification service — hold **no** Firestore
  credentials.
- Documents are keyed by the **server-issued** record id (the same id embedded
  in the track's nominator payload). Client-chosen ids are never accepted;
  a cert update must land on the exact server-known document or fail.
- The HMAC handshake (denominator side) is computed only on the server with a
  server-held secret. Firestore stores the *result* of certification, never
  the signing material.

## Security rules

Client SDK access is denied outright. The Admin SDK (server) bypasses rules by
design, which is exactly the intended trust boundary: **if it didn't come
through the server, it doesn't get written.**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Cert mirror + studio drafts: server-side only. No client reads or
    // writes under any condition — public verification goes through the
    // server's /api/kernel/verify-cert endpoint instead.
    match /certs/{certId} { allow read, write: if false; }
    match /song_drafts/{draftId} { allow read, write: if false; }
  }
}
```

## Invariants worth defending

1. **Server-side signing only.** No signing key, HMAC secret, or service
   account ever ships in a client bundle or this repository.
2. **Verification is a server verdict.** Public verification never reads
   Firestore directly; it POSTs the audio to the verification endpoint and the
   server answers from its records (Postgres + mirror).
3. **Ids bind the chain.** Track nominator → server record id → Firestore doc
   id are the same identifier; a mismatch anywhere is a tamper signal, not a
   recoverable state.
4. **Degradation is loud.** If the mirror write fails, the server logs and
   surfaces it; the cert is not silently "half-stored".
