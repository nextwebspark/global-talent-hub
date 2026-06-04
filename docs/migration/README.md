# Global Talent Hub → Next.js Migration

This folder is a **self-contained migration manual**. A fresh Claude Code session (or any engineer) in a **new project folder** can execute the migration step-by-step using only these docs plus read access to this repo as the reference implementation.

## What we are doing

Migrate the current app to **Next.js (App Router) full-stack — one app, one language (TypeScript), frontend + backend together.**

| Today | Target |
|-------|--------|
| React 19 + Vite SPA | Next.js App Router (RSC + client components) |
| Separate Express 5 backend | Next.js route handlers (`app/api/**/route.ts`) |
| Wouter routing | File-based routing |
| Vite + esbuild dual build | Single Next.js build |
| Express SSE generator | `ReadableStream` in a route handler |
| Postgres + Drizzle | **Same Postgres, same Drizzle schema** (no data migration) |

**Dropped:** Express, Vite, Wouter, esbuild server build, `@replit/*` Vite plugins, the `metaImagesPlugin`, manual theme toggle, and unused LLM SDKs (`openai`, `@anthropic-ai/sdk` — confirm per step before removing). **Also drop `@supabase/supabase-js`**: the current storage layer queries via the Supabase REST client; the new app reimplements those queries with Drizzle against the same Postgres (`DATABASE_URL`). One fewer dependency, full type-safety.

## The one rule

**Functionality and look/feel stay identical. The code is rebuilt clean.** Behavior is the frozen contract (see `01-functionality-spec.md` + `02-api-contract.md`). Internal structure is free to change — in fact it *must*, so the unmaintainable parts (giant files, god-facade) don't follow.

## How to use these docs

1. Read `00-target-architecture.md` once — the shape of the new app.
2. Read `01`–`03` as the behavior/data spec. Keep them open.
3. Read `04-test-strategy.md` once — how every step is verified.
4. Execute `steps/STEP-00` → `STEP-17` **in order**. Each step is independently testable. Do not start a step until the previous one is green.
5. Every step file has: **Goal · Reference · Build · Test · Done when**. The "Reference" section points at the exact old files to read as the source of truth.

## Ground rules for the executing agent

- **Same DB, both apps live.** The new Next.js app points at the same `DATABASE_URL`. Keep the old app runnable so you can diff behavior side-by-side. No schema changes, no data migration.
- **Minimize dependencies.** Don't add a library when the framework or an existing dep covers it. Prune dead SDKs as you encounter them.
- **No file over ~300–400 LOC.** Split as you rebuild. The named monoliths (`RightPanel.tsx`, `DataTable/index.tsx`, `postLlmValidation.ts`, `store.ts`, `Map.tsx`) must come out as feature folders.
- **Deterministic tests.** LLM calls are mocked from recorded golden fixtures. Never gate a step on a live LLM response.
- **A step is done only when:** its tests pass, the behavior/contract diff vs the old app is empty (or every diff is documented and accepted), and rollback is noted.

## Reference repo

The current implementation lives at the repo root (`client/`, `server/`, `shared/`). Treat it as read-only truth. File paths in step "Reference" sections are relative to that repo root.
