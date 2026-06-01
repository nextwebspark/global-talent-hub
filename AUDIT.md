# Understand Project + Audit Unwanted Code

## Context

User wants two outputs:
1. **Module-by-module map** of Global Talent Hub so they understand what each piece does.
2. **List-only audit** of unwanted/duplicate/dead stuff to remove later (user approves each removal — no auto-delete).

Repo is AI-powered executive search platform. Recent refactors split big monoliths (DataTable, routes, storage, clockworkEnrichment) — but cleanup leftover. User suspects dead code, unused deps, overlapping enrichment paths.

This plan = **read-only audit + explainer**. No code changes. User reviews list, picks what to delete in follow-up task.

---

## Part 1 — Module-by-Module Map

### Top-level

| Path | What it does |
|------|--------------|
| `client/` | React 19 + Vite 7 SPA. Entry `client/src/main.tsx` → `App.tsx`. Wouter routing. |
| `server/` | Express 5 API. Entry `server/index.ts`. Registers routes via `server/routes/index.ts` barrel. |
| `shared/` | `schema.ts` — Drizzle tables + Zod schemas. Used by both client + server. |
| `migrations/` | drizzle-kit generated SQL. Applied via `npm run db:push`. |
| `db-extent/` | Seed/reference SQL (`company_seed_list.sql`, `company_enrichment.sql`). |
| `script/build.ts` | esbuild (server CJS) + Vite (client) bundler. |
| `dist/` | Build output. **Not tracked in git.** 5.1MB. |
| `uploads/` | Runtime multer dest. Empty, gitignored. |

### Client modules (`client/src/`)

| Path | What it does |
|------|--------------|
| `pages/Landing.tsx` | 76KB / 1357 lines — search entry, history, query builder. **Too big — split candidate.** |
| `pages/Dashboard.tsx` | 20KB — DataTable + Mapbox globe results view. |
| `pages/not-found.tsx` | 404. |
| `components/DataTable/` | Already-split table (cells/, hooks/, dialogs/, utils/). Barrel preserved. |
| `components/panels/RightPanel.tsx` | 68KB / 1345 lines — model + enrichment config. **Too big — split candidate.** |
| `components/ui/` | Shadcn primitives. **4 unused** (see audit). |
| `lib/apiClient.ts` | Fetch wrapper. Source of truth for which server endpoints client calls. |
| `lib/` (Zustand store) | Global UI state. |

### Server modules (`server/`)

| Path | What it does |
|------|--------------|
| `index.ts` | Express bootstrap. dotenv, JSON middleware (keeps `rawBody` for webhooks), logging, route registration. |
| `db.ts` | Drizzle connection (Postgres). |
| `routes/index.ts` | Barrel — `registerRoutes(httpServer, app)`. |
| `routes/registrations/*.ts` | **18 domain route modules** (companies, executives, search, clockwork, enrichment, …). See audit below — many unused. |
| `routes/shared/upload.ts` | Multer middleware. |
| `services/discovery/` | Multi-phase Serper + LLM company discovery pipeline. Already split, barrel preserved. |
| `services/clockworkEnrichment/` | 11-module Clockwork CRM enrichment. Barrel preserved. |
| `services/pipeline/` | Pipeline orchestration. |
| `services/llmClient.ts` | Gemini + OpenAI fallback wrapper. |
| `services/validation/` + `postLlmValidation.ts` | Field validation. **`postLlmValidation.ts` is 56KB / 1507 lines — split candidate.** |
| `storage/DatabaseStorage.ts` (+ `types.ts`, `internal/`, `index.ts` barrel) | Drizzle facade. 45KB. |

### Data flow (high level)

```
Landing.tsx  ──(POST /api/search)──▶  routes/search.ts
                                          │
                                          ▼
                            services/discovery (Serper + Gemini)
                                          │
                                          ▼
                            services/pipeline + storage
                                          │
client/Dashboard.tsx ◀──(GET /api/companies, /api/executives)── routes/companies.ts + executives.ts
                                          │
                          (user clicks "enrich") ──▶ routes/enrichment.ts
                                          │
                                          ▼
                            services/clockworkEnrichment ──▶ Clockwork CRM
```

---

## Part 2 — Audit: Removal Candidates (list only)

### A. Unused npm dependencies (zero imports)

| Package | Notes |
|---------|-------|
| `tw-animate-css` | Zero imports. Probably stale. |
| `p-limit` | Zero imports. Concurrency limiter unused. |
| `p-retry` | Zero imports. Retry util unused. |
| `@jridgewell/trace-mapping` | Zero imports. Likely should be transitive only — remove from direct deps. |

Action: `npm uninstall tw-animate-css p-limit p-retry @jridgewell/trace-mapping` after user confirms.

### B. Orphaned client files (zero imports)

| File | Lines |
|------|-------|
| `client/src/components/ui/alert-dialog.tsx` | 139 |
| `client/src/components/ui/calendar.tsx` | 213 |
| `client/src/components/ui/carousel.tsx` | 260 |
| `client/src/components/ui/input-group.tsx` | 168 |

Total ~780 lines dead UI. Safe to delete after grep confirms zero refs at delete-time.

### C. Unused / dead route modules (registered, never called by client)

Cross-reference: `server/routes/registrations/*.ts` endpoints vs grep of `client/src` (apiClient + fetch).

**Fully unused (consider removal):**
- `career.ts` — PATCH/DELETE `/api/career-history/:id` never called.
- `dashboard.ts` — GET `/api/dashboard/:searchId` never called.
- `education.ts` — `/api/executives/:id/education` CRUD never called.
- `notes.ts` — `/api/{executives,companies}/:id/notes` never called.
- `remuneration.ts` — `/api/remuneration*` never called.
- `searchEnrich.ts` — POST `/api/search/:id/enrich-all` never called.
- `companyEnrichDeepseek.ts` — POST `/api/companies/:id/enrich-deepseek` never called.
- `companyEnrichMultipass.ts` — POST `/api/companies/:id/enrich-multipass` never called.

**Partial use (audit endpoint-by-endpoint):**
- `clockwork.ts` — only `/api/clockwork/projects` called. Diagnostics + `/explore/:id` + `/projects/:id/people` + project-name endpoints unused.

**Note on enrichment overlap:**
- `enrichment.ts` (active: `/match`, `/confirm`, `/create-from-clockwork`, `/import-candidate`)
- vs `companyEnrichDeepseek.ts` + `companyEnrichMultipass.ts` (both unused single-company variants)
- vs `searchEnrich.ts` (batch, unused)
- **Recommendation:** keep `enrichment.ts`. Delete the three unused variants.

### D. Unused DB columns / tables

**Not auditable from code alone safely.** Plan deferred: after removing dead routes (Section C), re-grep `shared/schema.ts` table fields against full codebase to find columns that are defined but never read or written. Risky — needs migration. Do as separate task once dead routes gone.

### E. Files too big to maintain (split candidates, not deletion)

| File | Size | Lines |
|------|------|-------|
| `client/src/pages/Landing.tsx` | 76KB | 1357 |
| `client/src/components/panels/RightPanel.tsx` | 68KB | 1345 |
| `server/services/postLlmValidation.ts` | 56KB | 1507 |

Follow existing barrel-export refactor convention.

---

## Critical files to inspect before any deletion

- `server/routes/index.ts` — confirm each "unused" route file is registered here; deletion needs removal from barrel too.
- `client/src/lib/apiClient.ts` — re-grep at delete-time to confirm no calls.
- `shared/schema.ts` — schema tables referenced by "dead" routes may still be in use elsewhere (don't drop tables).
- `package.json` + `package-lock.json` — uninstall together.

## Verification (after user picks items to delete, separate task)

1. After each deletion: `npm run check` → must pass type check.
2. `npm run build` → must produce `dist/` without errors.
3. `npm run dev` → smoke test: load Landing, run a search, view Dashboard, trigger enrichment.
4. Grep deleted exports across repo to confirm no stragglers.

## Out of scope

- Actual deletion (this plan = audit only).
- DB column drop (deferred until post-route-cleanup).
- Big-file splitting (separate refactor task).
