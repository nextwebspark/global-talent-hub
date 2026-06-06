# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project: Global Talent Hub

AI-powered executive search & talent mapping platform. Natural-language queries → SSE-streamed discovery/enrichment pipeline → interactive Mapbox globe + DataTable results → export to Clockwork Recruiting CRM.

## Tech Stack

- **Client:** React 19, Vite 7, TypeScript 5.6, Tailwind 4, Wouter routing, Radix UI + Shadcn, TanStack Query + Table, Zustand, Mapbox GL, Recharts
- **Server:** Express 5, Node 20+, TypeScript via `tsx`
- **DB:** PostgreSQL 16 (runtime data access via Supabase client over `hak_*` tables; `shared/schema.ts` Drizzle defs are the typed/Zod source), Drizzle ORM 0.39 + `drizzle-zod`
- **AI/Search:** Google Gemini (`@google/genai`) is primary for intent + enrichment, with `gemini-2.5-pro` → `gemini-2.5-flash` fallback (`callLlmWithFallback`). An OpenAI-compatible client (`openai` SDK) is also used for OpenRouter/title-generation in some routes. Web search via Serper (referenced in `server/services/discovery/models.ts`); core seed results come from the local `company_enrichment` view, not a live web crawl.
- **Build:** esbuild (server CJS) + Vite (client) via `script/build.ts`
- **Deploy:** Railway (`railway.toml`)

## Layout

| Path | Purpose |
|------|---------|
| `client/src/` | React app — `pages/` (Landing, Dashboard), `components/DataTable/`, `lib/` (`api.ts`, `queryClient.ts`, `store.ts`, `useSearchStream.ts`) |
| `server/index.ts` | Express entry; dotenv + JSON middleware (preserves `rawBody` for webhooks), request logging, Vite middleware (dev) / static serve (prod) |
| `server/routes/registrations/` | 16 domain route modules (companies, executives, search, clockwork, enrichment, dashboard, etc.) |
| `server/routes/index.ts` | Barrel — `registerRoutes(httpServer, app)` wires the `register*` modules |
| `server/routes/shared/upload.ts` | Multer middleware (file + PD upload) |
| `server/services/discovery/` | Query parsing/intent (`queryParser.ts`), normalization, geo, prompts |
| `server/services/pipeline/` | SSE search orchestration — `seedListSearch.ts`, `enrichmentFilter.ts`, `enrichment.ts`, `geminiSearchAdapter.ts` |
| `server/services/clockworkEnrichment/` | Clockwork API integration — matching, people, projects, diagnostics |
| `server/services/llmClient.ts` | `getLLMClient()`, `callLlmWithFallback()` (Gemini Pro↔Flash) |
| `server/storage/` | `DatabaseStorage.ts` facade + `types.ts` + `internal/` (case + sb wrappers) + barrel `index.ts` |
| `shared/schema.ts` | Drizzle tables + Zod schemas (companies, executives, career, education, remuneration, notes, searchQueries, searchSessions, searchResults, pipelineLog) |
| `server/db.ts` | Drizzle connection (`DATABASE_URL`, SSL in prod) |
| `migrations/` | drizzle-kit generated SQL |
| `db-extent/` | Seed/reference SQL |
| `script/build.ts` | esbuild + Vite bundler (allowlist externals) |

## Scripts

- `npm run dev` — `tsx server/index.ts` (NODE_ENV=development, Vite middleware hot-reload)
- `npm run dev:client` — `vite dev --port 5000` (client only)
- `npm run build` — `tsx script/build.ts` (client → `dist/public/`, server → `dist/index.cjs`)
- `npm start` — `node dist/index.cjs` (NODE_ENV=production)
- `npm run check` — `tsc` (type check, no emit)
- `npm run db:push` — `drizzle-kit push` (apply migrations)
- `npm test` — Playwright E2E (`test:ui`, `test:headed`, `test:report` variants)
- `npm run test:unit` — Vitest unit run (`test:unit:watch` for watch mode)

## Environment

Required for local dev:
- `DATABASE_URL` — Postgres connection
- `GOOGLE_API_KEY` — Gemini (Google AI Studio). For Vertex instead: `GOOGLE_GENAI_USE_VERTEXAI=true` + `GOOGLE_CLOUD_PROJECT` (+ optional `GOOGLE_CLOUD_LOCATION`)
- `MAPBOX_ACCESS_TOKEN` — globe rendering

Optional: `CLOCKWORK_API_KEY` / `_API_SECRET` / `_FIRM_KEY` / `_FIRM_SLUG` (Clockwork integration), `ENRICHMENT_MODEL` / `FAST_MODEL` (override default Gemini models), `PORT` (default 5000).

## Search Pipeline (SSE)

The core flow is a server-sent-events stream, not request/response:

1. Client `useSearchStream.startSearch()` (`client/src/lib/useSearchStream.ts`) opens an `EventSource` to `GET /api/search/enhanced-stream?query=...&sessionId=...`.
2. Server orchestrator `runSeedListEnhancedStream()` (`server/services/pipeline/seedListSearch.ts`) runs phases: **intent extraction** (`extractEnrichmentFilter` → `InferredIntent`, persisted to the session) → **seed-list query** over the `company_enrichment` view (`queryEnrichedCompanies` in the storage facade) → **optional enrichment** (`enrichRevenue` / `enrichExecutives`, Gemini + LLM, non-destructive) → **completion**.
3. SSE events — `search_created`, `intent_extracted`, `company_found`, `company_enriched`, `adjacent_sector_found`, `executive_found`, `search_complete`, `no_results`, `error` — each mutate `useAppStore`.
4. On an unmapped filter (no sectors identified), the server emits `no_results`; the AI-thinking panel in `pages/Landing/results/UniverseView.tsx` shows the reason, and the store tracks `discoveryStatus` + `degradationReasons`.

After the stream, the user accepts companies and `POST /api/search/add-to-project` re-associates them to a new search-query record before navigating to `/dashboard`.

## Storage

`DatabaseStorage` (`server/storage/DatabaseStorage.ts`) implements `IStorage` over the Supabase client. `internal/case.ts` (`keysToCamel`/`keysToSnake`) converts DB snake_case ↔ JS camelCase; `internal/sb.ts` wraps queries with error handling. Tables are `hak_`-prefixed (`hak_companies`, `hak_executives`, `hak_search_sessions`, ...) plus the `company_enrichment` view used as the seed list.

**Non-destructive enrichment is a core invariant:** `upsertCompanyNonDestructive` and `enrichExecutiveEmptyFields` only fill null/empty fields, respect `manuallyEditedFields`, and record `dataProvenance`. Don't add code paths that overwrite manually-edited or already-populated fields.

## Client State

Single Zustand store `useAppStore` (`client/src/lib/store.ts`) holds search-session, dashboard, and map/table state. `transformAPICompany` / `transformAPIExecutive` map API models to internal ones (with country-centroid coordinate fallback); `persistCompanyUpdate` / `persistExecutiveUpdate` PATCH edits back. TanStack Query client (`client/src/lib/queryClient.ts`) is configured `staleTime: Infinity`, no refetch-on-focus, no retry. API calls use relative paths + `credentials: "include"` (`client/src/lib/api.ts`). Routing is Wouter: `/` → Landing, `/dashboard` → Dashboard, `*` → not-found.

`components/DataTable/` (barrel `index.tsx`) is a TanStack Table with company grouping + executive expansion + in-place editing; `cells/`, `utils/`, `hooks/` subdirs; persists `tableConfig` per project to the store.

## Aliases

- `@/*` → `client/src/*` (tsconfig + vite)
- `@shared/*` → `shared/*` (tsconfig + vite)
- `@assets/*` → `attached_assets/*` (**vite.config.ts only — not in tsconfig.json**)

## Refactor Convention

Recent splits (DataTable, clockworkEnrichment, discovery, storage, routes) **preserve barrel exports** — public import path unchanged. Follow same pattern: folder + `index.ts` re-export when splitting large modules.

## Health Check

`GET /api/health` → `{ status: "ok", timestamp }`.

## Production Serving

Dev: Vite middleware. Prod: static serve from `dist/public/`.
