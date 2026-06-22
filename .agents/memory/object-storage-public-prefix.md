---
name: Object storage public-objects prefix mismatch
description: Public assets must physically live UNDER the PUBLIC_OBJECT_SEARCH_PATHS prefix; the serve route prepends it, naive bucket-root writes 404.
---

# Public assets must be written under the PUBLIC_OBJECT_SEARCH_PATHS prefix

The `/api/storage/public-objects/<key>` route resolves a file by **prepending**
the public search path: it looks for `<PUBLIC_OBJECT_SEARCH_PATHS-entry>/<key>`
(e.g. `<bucket>/public/<key>`). So DB keys are RELATIVE to the search path
(e.g. `releases/<slug>/cover.jpg`), and the physical object must live at
`<bucket>/public/releases/<slug>/cover.jpg`.

**Why:** A naive upload helper that does
`bucket(BUCKET_ID).file(key).save(...)` writes to **bucket root** (`<bucket>/<key>`),
NOT under the public prefix. Reads then 404 even though the object exists — the
write and read use different prefixes. This silently breaks every cover/preview
(covers blank, previews unplayable) while the DB rows look fine. Private full
audio is unaffected because the download route reads bucket-root `private/...`
directly (no search-path prepend).

**How to apply:** When uploading public assets, write under the public search
path prefix (mirror what the serve route prepends), not bucket root. To repair
mis-located existing objects WITHOUT a republish: object storage is a single
bucket shared across dev and prod, so copy `<bucket>/<key>` →
`<bucket>/public/<key>` (GCS `file.copy`) and both environments resolve
immediately. Diagnose by listing the bucket and comparing the object's real name
to `searchPath + "/" + key`.
