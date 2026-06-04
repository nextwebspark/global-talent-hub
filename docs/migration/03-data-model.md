# 03 — Data Model

Source of truth: `shared/schema.ts` (Drizzle tables + Zod insert schemas). **Reuse this file verbatim** in the new app's `lib/db/schema.ts`. Same Postgres, same migrations (`migrations/`), no data migration.

## Tables (14)

| Table | Drizzle export | Line | Purpose |
|-------|----------------|------|---------|
| `users` | `users` | schema.ts:81 | Basic auth (id, username, password) — currently unused by routes |
| `companies` | `companies` | :87 | Core entity. ~56 cols incl. revenue, employees, sector, lat/long, confidence, `manuallyEditedFields` (text[]), `dataProvenance` (jsonb) |
| `search_sessions` | `searchSessions` | :146 | Active search session: rawQuery, inferredIntent (jsonb), status, refinementHistory (jsonb), pdContent, pdConfidential |
| `executives` | `executives` | :160 | People in companies. name, title, contact, gender/ethnicity (+confidence), enrichment metadata, clockwork ids, custom fields (jsonb) |
| `search_queries` | `searchQueries` | :194 | Saved searches: query text, result count, clockworkProjectId, config (jsonb) |
| `search_results` | `searchResults` | :209 | Web search results: url, title, snippet, domain, tier, companyId |
| `conversations` | `conversations` | :227 | Chat history (title, timestamps) |
| `messages` | `messages` | :233 | Chat messages (conversationId, role, content) |
| `career_history` | `careerHistory` | :278 | Executive positions (company, title, dates, sortOrder) |
| `education` | `education` | :291 | Executive education (institution, degree, field, year) |
| `remuneration` | `remuneration` | :302 | Compensation (base, allowances, bonus, LTI, currency, year) |
| `executive_notes` | `executiveNotes` | :319 | Notes on a person |
| `company_notes` | `companyNotes` | :327 | Notes on a company |
| `pipeline_log` | `pipelineLog` | :69 | Audit trail of field-update decisions (old/new, reason, confidence) |

## Relationships (FKs)

- `executives.companyId` → `companies.id` (cascade delete)
- `careerHistory.executiveId` / `education.executiveId` / `remuneration.executiveId` / `executiveNotes.executiveId` → `executives.id` (cascade)
- `companyNotes.companyId` → `companies.id` (cascade)
- `searchResults.companyId` → `companies.id` (nullable)
- `companies.searchQueryId` → `searchQueries.id` (nullable, set null)
- `companies.searchSessionId` → `searchSessions.id` (nullable, set null)
- `searchSessions.userId` → `users.id`; `searchSessions.searchQueryId` → `searchQueries.id`
- `messages.conversationId` → `conversations.id`

## Zod insert schemas

`createInsertSchema(...)` derives validation from each table (schema.ts:241–403). Use the exported `insertCompanySchema`, `insertExecutiveSchema`, etc. in route handlers for body validation. Types: `Company`/`InsertCompany`, `Executive`/`InsertExecutive`, … exported at schema.ts:370–403.

## Provenance / confidence merge (critical business logic — port exactly)

`companies.dataProvenance` (jsonb) maps `fieldName → { value, confidence, source, updatedAt, history[] }`. `manuallyEditedFields` (text[]) lists user-locked fields.

`upsertCompanyNonDestructive` (`server/storage/DatabaseStorage.ts:484-577`) decides, per field:
1. Skip if field is in `manuallyEditedFields`.
2. Fill if currently empty.
3. Overwrite if the new value's confidence > stored confidence.
4. Otherwise keep existing.
5. Record every decision in `pipeline_log` and update `dataProvenance`.

`enrichExecutiveEmptyFields` and `createExecutiveFromClockwork` follow the same fill-empty / higher-confidence / dedupe-by-clockworkId pattern. These merge rules are the riskiest behavior to port — cover them with unit tests in STEP-02/04/07.

## Data access note

The old `DatabaseStorage` uses the Supabase REST client with camelCase↔snake_case converters (`server/storage/internal/case.ts`). The new app uses **Drizzle**, which maps columns via the schema definition — no manual case conversion needed. Verify each repository method returns the same JSON shape the old endpoint did (see `02-api-contract.md`).
