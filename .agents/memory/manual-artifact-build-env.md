---
name: Manual artifact build environment
description: Auxiliary Vite artifacts require the same PORT and BASE_PATH values injected by their managed workflow.
---

Managed artifact workflows provide required `PORT` and `BASE_PATH` environment variables automatically. Manual production-build checks for path-routed Vite artifacts must supply both values explicitly; missing them is an environment error, not a deployment configuration failure.

**Why:** The Vite configs intentionally fail closed when either value is missing, while the managed publish/workflow environment supplies them.

**How to apply:** For manual checks, use the artifact's configured port and preview path as `PORT` and `BASE_PATH`; do not weaken the config's required-variable checks.