# CLAUDE.md

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

AI-powered executive search & talent mapping platform. Natural-language queries → multi-phase discovery/enrichment pipeline → interactive Mapbox globe + DataTable results → export to Clockwork Recruiting CRM.

## Tech Stack

- **Client:** React 19, Vite 7, TypeScript 5.6, Tailwind 4, Wouter routing, Radix UI + Shadcn, TanStack Query + Table, Zustand, Mapbox GL, Recharts
- **Server:** Express 5, Node 20+, TypeScript via `tsx`
- **DB:** PostgreSQL 16, Drizzle ORM 0.39, `drizzle-zod`
- **AI/Search:** Google Gemini (`@google/genai`), OpenAI fallback, Serper API
- **Build:** esbuild (server CJS) + Vite (client) via `script/build.ts`
- **Deploy:** Railway (`railway.toml`)

## Layout

| Path | Purpose |
|------|---------|
| `client/src/` | React app — `pages/` (Landing, Dashboard), `components/DataTable/`, `lib/apiClient.ts`, Zustand store |
| `server/index.ts` | Express entry; dotenv + JSON middleware (preserves `rawBody` for webhooks) |
| `server/routes/registrations/` | 18 domain route modules (companies, executives, search, clockwork, enrichment, etc.) |
| `server/routes/index.ts` | Barrel — `registerRoutes(httpServer, app)` |
| `server/routes/shared/upload.ts` | Multer middleware |
| `server/services/` | discovery, clockworkEnrichment, pipeline, llmClient, validation |
| `server/storage/` | `DatabaseStorage.ts` facade + `types.ts` + `internal/` + barrel `index.ts` |
| `shared/schema.ts` | Drizzle tables + Zod schemas (companies, executives, career, education, remuneration, notes, search history) |
| `server/db.ts` | Drizzle connection |
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

No test runner configured.

## Aliases

- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`
- `@assets/*` → `attached_assets/*`

Defined in both `tsconfig.json` and `vite.config.ts` — keep in sync.

## Refactor Convention

Recent splits (DataTable, clockworkEnrichment, discovery, storage, routes) **preserve barrel exports** — public import path unchanged. Follow same pattern: folder + `index.ts` re-export when splitting large modules.

## Health Check

`GET /api/health`

## Production Serving

Dev: Vite middleware. Prod: static serve from `dist/public/`.
