# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start Next.js dev server (port 3000)
- `npx convex dev` — start Convex dev backend (run alongside Next.js dev server)
- `npm run build` — production build
- `npm run lint` — run ESLint
- `npm run deploy:convex` — deploy the Convex backend to production
- `npm run deploy` — build the image here and deploy the frontend

Both `npm run dev` and `npx convex dev` must run concurrently during development.

## Deploying

**The frontend and the backend deploy separately.** The Docker image carries
Next.js only; nothing in Coolify runs `npx convex deploy`. Ship the backend
first — a frontend calling functions that are not deployed yet is what
`ae951f0` had to unbreak.

```bash
npm run deploy:convex   # only when convex/ changed
npm run deploy          # frontend; refuses to run if the backend is behind
```

`npm run deploy` builds the image on this machine, copies it to the deployment
server and then pushes. Coolify skips its own build when an image tagged
`<app-uuid>:<commit-sha>` is already on the server, so the deploy is just a
rolling restart — about 15-30s, against ~9 minutes when Coolify builds. It
needs a clean tree on `main`, and reads production build args from
`.env.production.local` (**not** `.env.local`, which points at a personal dev
Convex deployment).

The seeding has to happen before the push, not after: pushing first starts a
server-side build that the local one cannot overtake.

Pushing to `main` by any other route still works — a webhook fires and Coolify
builds from source as before. That is the path for work done away from the
build machine, and it is why `Dockerfile` keeps its BuildKit cache mounts. It
does **not** deploy Convex either.

`scripts/deploy-local.sh` blocks when the last commit touching `convex/` is not
the one recorded in `.convex-deployed` (gitignored, written by
`deploy:convex`). The marker is per-machine, so deploying Convex elsewhere
leaves it stale; re-run `deploy:convex`, or `SKIP_CONVEX_CHECK=1` for one run.

`NEXT_PUBLIC_*` vars are inlined by Next at build time, so they must be build
args — setting them in Coolify's runtime env does nothing. All three the code
reads are wired through `Dockerfile`.

Preview deployments are not configured. If they are ever enabled, give them a
Convex **preview deploy key** — never the production or personal dev
deployment.

## Architecture

**The Mantra** is an inventory and sales management app for a product business. It tracks products, manufacturing batches, stock movements, and sales across multiple channels.

### Stack
- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + shadcn/ui
- **Backend:** Convex (real-time backend-as-a-service) — no REST API, no database migrations
- **Auth:** `@convex-dev/auth` with Password provider, session managed via `ConvexAuthProvider`
- **Forms:** react-hook-form + zod validation
- **Deployment:** Docker (standalone Next.js output) on Coolify; see [Deploying](#deploying)

### Route Structure
- `src/app/(auth)/` — login, join (public routes)
- `src/app/(auth)/join/` — invite-based agent password setup (token in query param)
- `src/app/(protected)/` — all authenticated routes, wrapped by `AuthGuard` + sidebar layout
  - `dashboard/` — main pages: products, batches, inventory, stock, sales, record-sale, my-sales, agents

### Auth & Roles
- Two roles: `admin` and `agent`
- Admins are set up manually; agents are added by admins via invite system
- `AuthGuard` redirects unauthenticated users to `/login`
- `RoleGuard` restricts pages by role, redirects unauthorized users to `/dashboard`
- Current user fetched via `useCurrentUser()` hook from `src/hooks/useStoreUserEffect`
- No self-service signup — agents are invited by admins with a password-setup link

### Convex Backend (`convex/`)
- `schema.ts` — defines tables: users, products, batches, stockMovements, inventory, agentInvites
- `auth.ts` / `auth.config.ts` — Convex Auth setup with Password provider
- `products.ts`, `batches.ts`, `inventory.ts`, `stockMovements.ts`, `users.ts`, `agentInvites.ts` — queries and mutations
- `helpers/` — shared backend utilities
- Use `getAuthUserId(ctx)` from `@convex-dev/auth/server` for auth checks in backend functions
- **Always read `convex/_generated/ai/guidelines.md`** before writing Convex code

### Public storefront shares this backend

`../themantra-site` (The Mantra's public shop) talks to this same Convex
deployment. It has no `convex/` directory — **this repo owns the function
codebase**, and the storefront only calls into it.

These five must stay callable without auth, or the shop breaks:

`products:listSellable`, `products:get`, `products:listCollections`,
`productVariants:listAllPublic`, `productVariants:listPublicByProduct`

The storefront also vendors a copy of `convex/schema.ts`. After changing the
schema, run `npm run sync:schema` there.

### Convex functions are public by default

A function is reachable by anyone holding the deployment URL unless it checks
auth itself. The URL ships in the storefront's public JavaScript, so **assume
every new function is internet-facing until you add a guard.**

An audit in Aug 2026 found 41 endpoints open, including one that returned raw
`users` documents — leaking password-reset tokens and enabling account takeover.
They are now guarded. When writing a query or mutation:

- Call `requireAuth`, `requireRole` or `requireSeller` from `helpers/auth` unless
  the function is deliberately public.
- Never return a raw `users` document. Project it — see `publicUserFields()` in
  `convex/users.ts`.
- Never build an emailed link from a caller-supplied origin. Use
  `process.env.SITE_URL` (set in both deployments).

### Data Model
- **Products** → have many **Batches** (manufacturing runs with maturation tracking)
- **Batches** → have **Inventory** records (who holds how much) and **StockMovements** (transfer history)
- **StockMovements** track flow: business → agent → customer, with sale channel info (direct, agent, tiktok, shopee, other)
- **Inventory** is a denormalized running tally per batch per holder (business or agent)

### Key Conventions
- UI components in `src/components/ui/` are shadcn/ui primitives; domain components organized by feature (agents/, batches/, products/, sales/, stock/)
- `ConvexClientProvider` wraps the app; uses `NEXT_PUBLIC_CONVEX_URL` env var
- Next.js 16 has breaking changes from earlier versions — read guides in `node_modules/next/dist/docs/` before writing Next.js code

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
