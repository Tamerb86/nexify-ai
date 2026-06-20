# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`nexify-ai` (product name "Innlegg") — a Norwegian SaaS that generates AI social-media content. Single package, not a workspace: a Vite/React client and an Express + tRPC server share one `package.json`, the `drizzle/` schema, and the `shared/` folder. Package manager is **pnpm**.

## Commands

```bash
pnpm install              # install (lockfile is authoritative; CI uses --frozen-lockfile)
pnpm dev                  # tsx watch server/_core/index.ts — runs API + Vite middleware together
pnpm check                # tsc --noEmit — THE typecheck gate (see warning below)
pnpm test                 # vitest run (all server/**/*.test.ts)
npx vitest run server/telegram.actions.test.ts   # single test file
npx vitest run -t "should activate subscription"  # single test by name
pnpm build                # vite build + esbuild bundle of the server entry
pnpm db:push              # drizzle-kit generate && migrate (needs DATABASE_URL)
pnpm format               # prettier --write .
```

### ⚠️ The build does NOT typecheck
`pnpm build` is `vite build && esbuild ... --bundle` — neither runs `tsc`. A build can succeed with type errors. **`pnpm check` (`tsc --noEmit`) is the only thing that verifies types.** Always run it after changes; do not treat a green build as correctness.

### Server fails fast on missing config
`server/_core/index.ts` throws on boot if `JWT_SECRET` is missing or `< 32` chars. The dev server also needs a reachable `DATABASE_URL`. Webhook routes (Vipps, Telegram) reject requests when their secrets are unset (fail-closed by design). Minimum env to run: `JWT_SECRET`, `DATABASE_URL`, `OPENAI_API_KEY`. Payments/integrations additionally need `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `VIPPS_SECRET_KEY`, `TELEGRAM_WEBHOOK_SECRET`, `TOKEN_ENCRYPTION_KEY`, `PUBLIC_SITE_URL`.

## Architecture

### Two layers under `server/`
- **`server/_core/`** — the framework/runtime layer (auth, http, security, infra). Treat it as the platform: `index.ts` (Express bootstrap + all route/middleware wiring + Stripe/Vipps/Telegram webhooks), `trpc.ts` (procedure builders), `context.ts` (builds tRPC context), `sdk.ts` (session-token sign/verify via `jose`), `env.ts`, `rateLimiter.ts`, `securityHeaders.ts`, `abuseProtection.ts`, `cookies.ts`, `vite.ts`, `llm.ts`, `imageGeneration.ts`, `tokenCrypto.ts`, `oauthState.ts`.
- **`server/routers.ts`** — the large tRPC aggregator (~2000 lines) that composes `server/routers/*.ts` (17 feature routers: subscription, payment, vipps, social media, support, admin, scheduling, etc.) plus many inline procedures. This is the app layer. Start here to find an API endpoint.

### Auth model (important, easy to get wrong)
Authentication happens **inside tRPC `createContext`** (`context.ts` → `sdk.authenticateRequest`), not in Express middleware. The session is a JWT cookie; the user row (including `role`) is loaded from the DB, so `ctx.user.role` is server-trusted and **not** client-controllable. Procedure tiers in `_core/trpc.ts`: `publicProcedure`, `protectedProcedure` (requires `ctx.user`), `adminProcedure` (requires `role === "admin"`). Several routers redefine their own `adminProcedure` inline — keep that pattern. Express-level middleware that needs the user reads `req.user`, which is populated by an `attachUser` middleware on `/api/trpc` in `index.ts` (Express never sets it otherwise).

### Data layer
Drizzle ORM over MySQL/TiDB. **`getDb()` is async** (`server/db.ts`) — you must `await getDb()` before calling `.select()/.insert()/...`. Calling query methods on the un-awaited promise is a recurring bug. Schema lives in `drizzle/schema.ts` (single source of truth); migrations in `drizzle/*.sql` + `drizzle/meta/`. After editing the schema, run `pnpm db:push` (generates + applies). `server/db.ts` holds most reusable query helpers (`getUserById`, `updateSubscriptionFromStripe`, `markWebhookEventProcessed`, etc.).

### Payments & webhooks
Stripe and Vipps (Norwegian) both route through webhooks mounted in `_core/index.ts`. Stripe activation listens to `checkout.session.completed` and derives the plan from the trusted `product_key` (in `server/stripe/products.ts`), never a client-sent amount; Vipps verifies an HMAC over the **raw** request body (captured via `express.json({ verify })`) and validates the amount against a real plan price. All payment webhooks are idempotent via the `processed_webhook_events` table (`markWebhookEventProcessed`).

### LLM / integrations
Text + image generation go to OpenAI (`https://api.openai.com`, overridable via `BUILT_IN_FORGE_API_URL`); see `_core/llm.ts`, `server/openaiService.ts`, `_core/imageGeneration.ts` (DALL·E). OAuth tokens for LinkedIn/Telegram/etc. are **encrypted at rest** (AES-256-GCM in `_core/tokenCrypto.ts`) and OAuth `state` is HMAC-signed (`_core/oauthState.ts`) — when adding a new connected integration, reuse both. Background publishing/scheduling is in `server/schedulerService.ts`.

### Client
Vite + React + TypeScript in `client/`. Routing uses **wouter** with lazy pages in `App.tsx` (`client/src/pages/`). tRPC client in `client/src/lib/trpc`. Path aliases (from `vite.config.ts`): `@` → `client/src`, `@shared` → `shared`, `@assets` → `attached_assets`.

### Styling — Tailwind v4 (no JS config)
This uses **Tailwind v4 via `@tailwindcss/vite`** — there is **no `tailwind.config.js`**. All theme config lives in `client/src/index.css`: `@theme` for tokens/animations (`--color-*`, `--animate-*`), `@custom-variant dark (&:is(.dark *))` for class-based dark mode, and global `@keyframes`. To add a Tailwind animation, register `--animate-x` in `@theme` and define `@keyframes x` in the CSS — not a config file. shadcn/ui (new-york style) primitives live in `client/src/components/ui` (`components.json` aliases); `cn` is in `client/src/lib/utils.ts`.

## Conventions
- Procedures use `zod` `.input(...)` for validation; add `.max()` bounds on free-text fields (many feed LLM prompts).
- Scope every per-user query with `and(eq(table.id, id), eq(table.userId, ctx.user.id))` — ownership checks are enforced in-query, not by a separate guard.
- Tests mock `./db` with `vi.mock`. `vitest.config.ts` runs with `isolate: true` + `fileParallelism: false` (vitest 3); keep these — without isolation, per-file `vi.mock` leaks across files.
