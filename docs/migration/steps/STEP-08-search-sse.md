# STEP-08 — Discovery / search SSE stream (HIGHEST RISK)

**Goal:** `GET /api/search/enhanced-stream` emits the exact same SSE event sequence/shapes as today, driven by the same enrichment-filter + enriched-company query logic — verified deterministically against golden LLM fixtures.

## Reference
- `server/services/pipeline/seedListSearch.ts:86-194` — `runSeedListEnhancedStream` (the generator + `emit` shape + `StreamCompany` mapping).
- `server/services/pipeline/enrichmentFilter.ts:111` — `extractEnrichmentFilter` (model `gemini-2.5-flash`, temp 0, max_tokens 2048; prompt + `keepInSet` validation; empty-filter fallback).
- `server/services/llmClient.ts` — the OpenAI-compatible shim over `@google/genai`.
- `server/routes/registrations/search.ts` — the SSE route wiring (`?query=&sessionId=&limit=`, AbortController on disconnect).
- Repo: `queryEnrichedCompanies(filter, limit)` (STEP-02), `upsertCompanyNonDestructive`, `updateSearchQueryResultCount`.
- Event contract: `02-api-contract.md` (SSE table).

## Build
1. `lib/llm/client.ts` — provider-agnostic client mirroring the shim (`chat.completions.create`-style or a small `complete()`), reading `GOOGLE_API_KEY`/Vertex env. **Injectable** so tests replay fixtures.
2. `lib/services/pipeline/enrichment-filter.ts` — port `extractEnrichmentFilter` exactly: same prompt string, same `keepInSet` validation against taxonomy sets, same empty-filter fallback on parse/LLM failure. (Prompt text drives output — copy it verbatim.)
3. `lib/services/pipeline/seed-list-stream.ts` — port `runSeedListEnhancedStream` as an async generator yielding the same event objects (`status`, `intent_extracted`, `adjacent_sector_found`, `company_found`, `company_enriched`, `no_results`, `search_complete`), same `StreamCompany` mapping (seedListSearch.ts:162-181), same `isUnmappedFilter` no-results branch.
4. `app/api/search/enhanced-stream/route.ts` — `GET` returning a `ReadableStream` that serializes each yielded event as `data: <json>\n\n` (pattern in `00-target-architecture.md`). Wire `request.signal` to the generator's abort.

## Test (deterministic — no live LLM)
- Record golden fixtures: for ~3 fixed queries, capture `extractEnrichmentFilter`'s real input→output from the old app into `tests/fixtures/`.
- Unit: feed fixtures through the ported filter → exact same `EnrichmentFilter` (sectors, subTags, bands, adjacency, rationale).
- Integration: with the LLM client mocked to replay a fixture and a seeded enriched-companies table, consume the SSE stream → assert the **same ordered list of `type`s** and matching `data` shapes vs a recorded old-app stream. Test the no-results branch and mid-stream abort.

## Done when
Filter output matches fixtures exactly; SSE event sequence/shape parity holds; abort + no-results paths covered. **Rollback:** route `/api/search/enhanced-stream` back to Express (it's isolated).
