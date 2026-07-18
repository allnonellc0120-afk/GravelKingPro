---
name: Tailwind v4 + legacy @tailwind directives
description: Why an artifact's UI can render invisible (0x0 clipped) even though most utilities work — and the ?still/?scene QA pattern for video artifacts
---

**Rule:** Under `@tailwindcss/vite` (v4 engine), a CSS entry that still uses v3-style `@tailwind base; @tailwind components; @tailwind utilities;` compiles only a PARTIAL utility set — silently. Some classes generate (`bg-cover`, arbitrary values like `text-[4.6vw]`, `inset-[-2%]`), others never do (`inset-0`, gradient stops `from-*/via-*/to-*`, `text-[#hex]` colors). Must be `@import 'tailwindcss';` instead.

**Why:** Cost hours in the gravelkingpro-promo pitch video: every scene mounted correctly (React fine, framer-motion fine, opacity animated to 1) but `.inset-0` was missing, so the scene root shrink-wrapped to 0×0 and `overflow-hidden` clipped the whole subtree — including inline-styled debug children. Looked exactly like a framer/AnimatePresence or screenshot-timing bug. The partial compile is the trap: enough classes work that Tailwind seems fine.

**How to apply:**
- Any invisible-but-mounted layout in a monorepo artifact → first check the CSS entry for legacy `@tailwind` directives, and grep the compiled CSS (`curl <dev-url>/src/index.css?direct`) for a load-bearing class like `.inset-0`.
- Debug ladder that isolates this fast: (1) inline-styled control element at a HIGHER level — if it paints, pipeline is fine; (2) inline-styled marker INSIDE the invisible subtree — if it does NOT paint despite being in the DOM, suspect zero-size ancestor + overflow clip, i.e. missing positioning utilities.
- Video-artifact QA pattern (kept permanently in gravelkingpro-promo): `/?still=1` adds a `.poster-mode` class whose CSS forces `opacity:1 !important` on the scene layer (CSS !important beats framer-motion inline styles), `&scene=<key>` rotates playback to start at any scene. Screenshots otherwise capture the first ~1s fade-from-black. Do NOT use framer's `MotionGlobalConfig.skipAnimations` for posters — it freezes elements at their `initial` (invisible) state, not their final state.
