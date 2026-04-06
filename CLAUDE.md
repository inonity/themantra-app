# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — start Next.js dev server (port 3000)
- `npx convex dev` — start Convex dev backend (run alongside Next.js dev server)
- `npm run build` — production build
- `npm run lint` — run ESLint

Both `npm run dev` and `npx convex dev` must run concurrently during development.

## Architecture

**The Mantra** is an inventory and sales management app for a product business. It tracks products, manufacturing batches, stock movements, and sales across multiple channels.

### Stack
- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + shadcn/ui
- **Backend:** Convex (real-time backend-as-a-service) — no REST API, no database migrations
- **Auth:** `@convex-dev/auth` with Password provider, session managed via `ConvexAuthProvider`
- **Forms:** react-hook-form + zod validation
- **Deployment:** Docker (standalone Next.js output)

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

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
