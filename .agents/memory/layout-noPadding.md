---
name: Layout noPadding prop
description: The Layout component supports noPadding for pages that need full viewport height/width
---

**Rule:** Pass `noPadding` to `<Layout>` when a page needs to fill the viewport (e.g. the DAW, any full-screen tool). The main element switches from `flex-1 container mx-auto px-4 py-8` to `flex-1 flex flex-col overflow-hidden`.

**Why:** Mix Studio / DAW pages need full height with no container max-width. The Layout component was extended to support this use case.

**How to apply:** `<Layout noPadding>` — inner content should use `flex-1 flex flex-col overflow-hidden min-h-0` to fill available space correctly.
