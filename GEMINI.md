# GravelKing Pro Workspace Instructions

## Architecture

- Full-stack pnpm workspace.
- Backend: Node.js 24, TypeScript, Express 5, and Drizzle/PostgreSQL in `artifacts/api-server`.
- Frontend: GravelKing Pro web application in `artifacts/gravelkingpro`.
- Audio AI: `artifacts/api-server/src/replicateClient.ts` provides Replicate access for RVC voice conversion, Demucs separation, and related audio inference.
- Audio processing remains separate from the Morris Law Kernel Python service; do not bypass the established service boundaries.

## Development standards

- Prefer fast, targeted builds and the smallest change that satisfies the request.
- Use pnpm workspace commands; do not introduce npm or yarn lockfiles.
- Keep verification atomic: typecheck/build the affected package, run the narrowest relevant test, and report failures explicitly.
- Do not expose secrets, tokens, credentials, or private URLs in output.
- Preserve existing product decisions and avoid reintroducing deprecated cloud-AI or voice-removal flows without an explicit request.
- Use zero-fluff execution: state the action, evidence, result, and any blocker directly.

## Run completion output

End every terminal-driven run with a copy-pasteable JSON status block in this format:

```json
{
  "status": "passed",
  "summary": "Short factual result",
  "checks": [
    {"name": "check-name", "result": "passed"}
  ],
  "blockers": []
}
```

Use `"failed"` or `"blocked"` when appropriate, and include actionable blocker details in the `blockers` array.