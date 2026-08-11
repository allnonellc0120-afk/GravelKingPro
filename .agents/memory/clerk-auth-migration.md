---
name: Clerk auth migration
description: Durable constraints from the Replit Auth → Clerk migration — bridge rule, session fallbacks that must survive, and managed proxy env vars
---

# Clerk auth (migrated from Replit Auth)

## Bridge rule
- `users.id` is the bridge: Clerk `sessionClaims.userId` = original Replit Auth sub for migrated users, Clerk native ID for new sign-ups. DB lookups MUST use `sessionClaims.userId`; Clerk-native `auth.userId` is only for Clerk API calls.

## Parallel session paths that must NOT be removed
- `gk_session` cookie: anonymous Stripe checkout attribution — entitlement/stripe/tracks fall back to it after `req.dbUser`.
- `sid` server-side session (cookie **or** `Authorization: Bearer <sid>`): the Play reviewer demo account AND the in-process test suites auth this way. Removing the Bearer path breaks the api-server test suite with 403s.

## Managed proxy env vars — hands off
- `VITE_CLERK_PROXY_URL` / `CLERK_PROXY_URL` are intentionally EMPTY in dev and auto-populated at publish by the managed Clerk system. Do not set, request, or hardcode them (skill lists this as a dangerous fix). A code review flagging the "missing" proxy var in dev is a false positive.
- Clerk proxying does not work for dev instances at all — production sign-in can only be end-to-end verified after Publish.

## Frontend gotchas
- ClerkProvider wiring (publishableKeyFromHost, unconditional proxyUrl, `/sign-in/*?` routes) must stay verbatim from the skill — no PROD/NODE_ENV gates.
- Tailwind v4 needs the `clerk` layer declared before imports + `tailwindcss({ optimize: false })` or Clerk UI breaks in prod only.
- Don't wrap shadcn `<Button>` in a raw `<button>` for signOut — nested-button hydration errors.
