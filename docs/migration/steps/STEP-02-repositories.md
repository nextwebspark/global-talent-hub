# STEP-02 — Repositories (replace the god-facade)

**Goal:** Per-domain Drizzle repositories reproducing every `DatabaseStorage` method, each file small and focused. No HTTP yet.

## Reference
- `server/storage/DatabaseStorage.ts` (1,199 LOC, 63 methods) — the behavior to reproduce.
- `server/storage/types.ts` (the `IStorage` interface — the method list/signatures).
- `server/storage/internal/case.ts` (camel↔snake — **not needed** with Drizzle; columns map via schema).
- `03-data-model.md` for the provenance/confidence merge rules.

## Build
Split into `lib/repositories/`:
- `companies.repo.ts`, `executives.repo.ts`, `career.repo.ts`, `education.repo.ts`, `remuneration.repo.ts`, `notes.repo.ts`, `searchQueries.repo.ts`, `searchSessions.repo.ts`, `searchResults.repo.ts`, `enrichedCompanies.repo.ts`, `pipelineLog.repo.ts`.
- Each method = a typed Drizzle query, same name/behavior as the `IStorage` method. Keep files ≤300–400 LOC.
- Port the merge logic carefully:
  - `upsertCompanyNonDestructive` (DatabaseStorage.ts:484-577) — locked-field skip, empty-fill, higher-confidence overwrite, provenance + `pipeline_log` write.
  - `enrichExecutiveEmptyFields`, `createExecutiveFromClockwork` (dedupe by clockworkId).
- No god-facade. If callers want one entry point, expose a thin `lib/repositories/index.ts` barrel — but no logic in it.

## Test (Vitest, test Postgres)
- One unit/integration suite per repo: create → read → update → delete round-trips; shapes match `Company`/`Executive`/… types.
- Table-driven tests for the merge rules (each branch in `03-data-model.md`).
- `getFullSearchResults` / `getExecutiveDetails` return the same nested shape as the old facade.

## Done when
All repo suites green on a seeded test DB; merge-rule cases pass. **Rollback:** none (no traffic cut yet).
