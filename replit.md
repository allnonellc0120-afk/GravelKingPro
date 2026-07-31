# GravelKingPro

A gravel-optimisation benchmarking tool with real Stripe subscription payments.

## User preferences

- **Big builds require explicit approval first**: For anything beyond a small fix, present the plan and get the user's sign-off BEFORE building, and check in during the work. Never run a large multi-part build silently end-to-end. (Set after the promo-code build was killed mid-way for being too much at once.)
- **No fake/demo content presented as real**: No canned before/after tracks, mock stats, or placeholder data shown as if functional. If something is a demo, label it or don't ship it.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed-products` — create products in Stripe (run once after connecting Stripe)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Payments: Stripe Checkout (subscriptions) via Replit integration + `stripe-replit-sync`
- Session tracking: `gk_session` cookie (no auth system)
- Build: esbuild

## Where things live

- DB schema: `lib/db/src/schema/users.ts` (public.users table — only app table; Stripe tables are in stripe.* schema managed by stripe-replit-sync)
- Stripe client: `artifacts/api-server/src/stripeClient.ts` and `scripts/src/stripeClient.ts`
- Payment routes: `artifacts/api-server/src/routes/stripe.ts`
- Subscription context: `artifacts/gravelkingpro/src/lib/context.tsx`

## Architecture decisions

- **Session-based subscriptions (no auth)**: Users are tracked via a `gk_session` cookie set on first checkout. The backend looks up the session → user → Stripe customer → subscription.
- **Stripe data lives in stripe.* schema**: `stripe-replit-sync` auto-creates and manages all Stripe tables. Never create product/price tables manually.
- **Webhook must precede express.json()**: Stripe webhooks require raw Buffer body. The webhook route in `app.ts` is registered before any body parsers.
- **Seed products once**: Run `pnpm --filter @workspace/scripts run seed-products` once in dev to create GravelKing Pro ($39.99/mo) and Node Auditor ($499/mo) products in Stripe.

## Product

- **Starter (free)**: basic analysis, standard report
- **Pro ($39.99/mo)**: full real-time metrics, unlimited runs, PDF reports, WAV downloads, priority support
- **Node Auditor ($499/mo)**: enterprise benchmarking, 1T scale, Morris Law V2 access

## Gotchas

- Connect Stripe via Integrations tab FIRST, then restart the API server — it logs an error on startup if Stripe isn't connected.
- Run `seed-products` AFTER connecting Stripe — products must exist in Stripe before the pricing page can start a checkout.
- `stripe` and `stripe-replit-sync` packages live at the workspace root (not in api-server package.json) — pnpm hoisting makes them accessible.
- `stripe` and `stripe-replit-sync` are marked `external` in `build.mjs` so esbuild doesn't bundle them. They must stay external: `stripe-replit-sync` resolves migration SQL files via `__dirname` at runtime; if bundled, `__dirname` points to our `dist/` folder and migrations silently skip, leaving the stripe schema empty.
- **Before publishing**: (1) run `pnpm install` so the working-tree `node_modules` is fully materialized — the deploy bundles the Expo app against working-tree `node_modules`, so a committed-but-unmaterialized dep fails Metro with "Unable to resolve module"; (2) delete regenerable Python caches with `rm -rf .cache/uv .cache/torch .cache/pip ~/.cache/audio-separator` — the deploy image bundles gitignored dirs, and the `uv` cache can grow to ~5 GB and the audio-separator model cache adds ~200 MB; both push the image past the 8 GiB limit.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
