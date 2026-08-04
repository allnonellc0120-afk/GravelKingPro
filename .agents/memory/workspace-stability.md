---
name: Workspace stability
description: Keep optional artifact workflows stopped during normal work to avoid CPU contention and preview instability
---
The project can run several artifact workflows at once, but Expo plus multiple Vite previews create avoidable CPU pressure and make the workspace feel frozen or reboot-prone. Keep only the active product web app and API running unless another artifact is being actively tested.

**Why:** During a stability investigation, Expo and the main Vite process were the largest CPU users while all eight workflows were running; no application crash or out-of-memory error was found.

**How to apply:** Stop pitch deck, licensing, promo, mobile, and mockup workflows by default; restart only the exact managed workflow needed for the current task.