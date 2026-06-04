# STEP-09 — Multipass / Deepseek enrichment + remaining services + config

**Goal:** The remaining LLM enrichment endpoints, the post-LLM validation layer, profile/remuneration extraction, and `/api/config` are ported; this closes the backend.

## Reference
- `server/routes/registrations/companyEnrichMultipass.ts` (`/api/companies/:id/enrich-multipass`).
- `server/routes/registrations/companyEnrichDeepseek.ts` (`/api/companies/:id/enrich-deepseek`).
- `server/routes/registrations/searchEnrich.ts` (`/api/search/:id/enrich-all`).
- `server/routes/registrations/executives.ts` — `:id/extract-profile`, `:id/remuneration/parse`.
- `server/services/postLlmValidation.ts` (~1,400 LOC) — restructure into composable validators.
- `server/services/remunerationParser.ts`, `currencyConversion.ts`, `fieldClassification.ts`, `queryValidation.ts`.
- `server/routes/registrations/config.ts` (`/api/config`).

## Build
- `app/api/config/route.ts` GET → `{ mapboxToken: process.env.MAPBOX_ACCESS_TOKEN ?? "" }` (needed before the map step — do it now if not already).
- `lib/services/validation/` — split `postLlmValidation` into small validators (one concern per file), composed by a runner. Same accept/reject/normalize outcomes.
- `lib/services/remuneration-parser.ts`, `lib/services/currency.ts`, `lib/services/field-classification.ts`.
- Handlers: `companies/[id]/enrich-multipass`, `companies/[id]/enrich-deepseek`, `search/[id]/enrich-all`, `executives/[id]/extract-profile`, `executives/[id]/remuneration/parse` — all inject the LLM client (mocked in tests).
- **Prune** now-unused LLM SDKs (`openai`, `@anthropic-ai/sdk`, `@supabase/supabase-js`) once nothing imports them. Confirm with a repo-wide grep.

## Test
- Unit: each validator (input → accept/reject/normalized); remuneration parser fixtures; currency conversion.
- Integration: each enrichment endpoint with mocked LLM → expected field updates (respecting the empty/higher-confidence merge), parity vs Express. `/api/config` returns the token.

## Done when
All backend endpoints (62) now served by the new app with parity; validators unit-green; dead deps removed; `npm run check` clean. **Rollback:** per-path back to Express. Backend cutover complete after this step.
