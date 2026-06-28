---
name: Splitter state persistence (iPad survival)
description: Why the Voice Splitter's state + processing live above the router and in IndexedDB, and the race guards that go with it.
---

# Splitter state persistence

Tool state for the Voice Splitter (and any heavy audio tool) must NOT live purely
in the page component's `useState`. On iPad/iOS Safari that causes two reported
failures:

1. Navigating to another tool unmounts the page → all in-progress / finished
   work is wiped ("clears the queue every time").
2. iOS reloads or kills a backgrounded tab (split screen, app switch) under
   memory pressure → everything is lost and the in-flight upload dies.

**The pattern that fixes it:**
- Hoist BOTH the state and the async processing routine into an app-level
  context provider mounted ABOVE the router. An in-flight fetch then keeps
  running while the user browses other tools, instead of dying on unmount.
- Mirror only the COMPLETED result (raw Blobs + metadata) to IndexedDB and
  rehydrate on mount. Recreate object URLs on rehydrate; revoke on reset/replace.
  Treat IDB as crash *recovery*, not crash *prevention* — it does not lower peak
  memory, so it won't stop iOS from killing the tab mid-process.

**Why:** component-local state has no lifetime beyond the mounted page; iOS is
aggressive about reclaiming backgrounded tabs.

**Race guards that are mandatory with this pattern (do not skip):**
- A late async `idbGet` rehydrate can resolve AFTER the user starts a new run
  and overwrite it. Guard with a `startedRef` flag set on first user action.
- `reset()` / a new run must invalidate any in-flight run: bump a monotonic
  `runId`, `abort()` the previous `AbortController`, and check
  `runId === myRun` after EVERY await before calling setState (and before
  creating object URLs), or a stale completion clobbers newer state.
- Prefer a manual `AbortController` + `setTimeout(abort, …)` over
  `AbortSignal.timeout()` so the same controller also cancels on reset/new run.

**How to apply:** see `artifacts/gravelkingpro/src/lib/splitterStore.tsx` and
`idbStore.ts`. Guard all IndexedDB access with `typeof indexedDB === "undefined"`
because the static SPA SEO prerender runs without it.
