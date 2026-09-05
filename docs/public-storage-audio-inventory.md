# Public storage full-audio inventory

**Audit date:** 2026-09-05  
**Scope:** Objects under the configured `PUBLIC_OBJECT_SEARCH_PATHS` prefix

## Result

No generated full-audio object was confirmed to be publicly reachable.

- The owner-project fallback bucket was listed directly under the public prefix.
  It contained **88 objects**: 44 `audio_preview.mp3` files and 44 `cover_art.png`
  files. No `.wav`, full-length `.mp3`, `.m4a`, `.flac`, `.ogg`, `.webm`, or
  `.aac` full-take candidate was present.
- Development and production track records contributed **51 unique safe storage
  references**. For each record, the audit checked the public URL for its
  historical full-audio key and the generated naming variants:
  `audio_full.{wav,mp3}`, `full.{wav,mp3}`, `master.{wav,mp3}`, and
  `generated.{wav,mp3}`.
- The unauthenticated public URL check returned **no 2xx responses** for any
  candidate. This is the relevant exposure test because an object is only
  exposed if an anonymous public request can retrieve it.
- No object was deleted. Preview and cover objects were left intact.

## Verification note

The Replit-managed bucket denied `storage.objects.list` and
`storage.objects.get` to the deployment identity during the audit. Its objects
were therefore not treated as absent based on authenticated SDK errors. Instead,
the audit also tested the candidate URLs anonymously; all returned non-success
responses. The fallback bucket was fully listable and independently showed only
the expected preview and cover objects.

If managed-bucket IAM is repaired or an authorized inventory identity becomes
available, rerun a direct prefix listing and compare it with this report. Any
confirmed public full take must first be matched to its private counterpart
before removal.