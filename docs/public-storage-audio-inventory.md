# Public storage full-audio inventory and IAM recovery

**Audit date:** 2026-09-05  
**Scope:** Objects under the configured `PUBLIC_OBJECT_SEARCH_PATHS` prefix

## Managed-bucket read contract

The API server's managed-storage identity must have the following permissions
on the configured Replit bucket only:

- `storage.objects.list` on the configured managed bucket. GCS grants this
  permission at bucket scope; the inventory helper constrains every request to
  a configured `PUBLIC_OBJECT_SEARCH_PATHS` prefix.
- `storage.objects.get` for listed public candidates and their corresponding
  private objects under `PRIVATE_OBJECT_DIR`

Use a custom role containing only the required object read/list permissions, or
the narrowest object-viewer grant available, on this managed bucket—not on the
project. Where conditional IAM supports resource-prefix restrictions, apply
them as well. Do **not** grant project-wide `roles/storage.admin`, grant public
access, or put credentials in the repository. The inventory helper in
`artifacts/api-server/src/lib/objectStorage.ts` intentionally lists only the
configured public prefixes and fetches metadata through the managed identity.

## Recovery and verification

The supported workspace recovery action is to run the idempotent managed
Object Storage setup. After that, verify from the API-server deployment
identity:

1. List each configured public prefix with `storage.objects.list`.
2. Fetch metadata for at least one listed public object with
   `storage.objects.get`.
3. For every full-audio candidate, check the candidate and its private
   counterpart with authenticated object existence/metadata requests.
4. Repeat in both development and production; do not treat a `403` as an
   empty bucket.

At this audit, setup reported that the bucket was already provisioned, but the
deployment identity still received `403` for both list and get. The configured
owner-project service account also lacked permission to read or change the
managed bucket IAM policy. This is a platform-side grant that cannot be safely
repaired from application code. The recovery owner must grant the deployment
identity the narrowly scoped permissions above on the managed bucket, then
rerun the verification steps and replace this note with the observed counts.

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
`storage.objects.get` to the deployment identity during the audit, including
after the idempotent Object Storage setup recovery. Its objects were therefore
not treated as absent based on authenticated SDK errors. Instead, the audit
also tested the candidate URLs anonymously; all returned non-success
responses. The fallback bucket was fully listable and independently showed only
the expected preview and cover objects.

Once managed-bucket IAM is repaired, rerun the authenticated prefix listing and
metadata checks and compare them with this report. Any confirmed public full
take must first be matched to its private counterpart before removal.