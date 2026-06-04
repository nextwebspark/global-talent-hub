# STEP-05 — Search queries, history, dashboard analytics

**Goal:** Search-query CRUD/history, the per-project persistence endpoints, and the dashboard analytics endpoint behave identically. All deterministic (no LLM except optional report-title).

## Reference
- `server/routes/registrations/searchQueries.ts` — history, load, results, bulk-delete, delete-results.
- `server/routes/registrations/search.ts` — `:searchId/name`, `:searchId/clockwork-project`, `session/:sessionId/confidential`, and the PUT persistence routes (`table-config`, `map-positions`, `satellite-hierarchies`, `satellite-orders`), `add-to-project`.
- `server/routes/registrations/dashboard.ts` — breakdowns + report-title via OpenAI (`gpt-4o-mini`, optional, fails gracefully).
- Repo methods: `getSearchHistoryWithResults`, `getFullSearchResults`, `saveTableConfig`, `saveMapPositions`, `saveSatelliteHierarchies`, `saveSatelliteOrders` (STEP-02).

## Build
- `app/api/search-history/route.ts` GET; `search-history/[id]/load/route.ts` GET; `search-results/[id]/route.ts` GET.
- `search-queries/bulk-delete/route.ts` POST; `search-queries/[id]/results/route.ts` DELETE.
- `search/[searchId]/name`, `search/[searchId]/clockwork-project` PATCH; `search/session/[sessionId]/confidential` PATCH.
- `search/[id]/table-config|map-positions|satellite-hierarchies|satellite-orders` PUT; `search/add-to-project` POST.
- `dashboard/[searchId]/route.ts` GET — aggregations. Report-title: inject the LLM client; if absent/fails, fall back to the same default the old code uses (keep the graceful path).

## Test
- Unit: aggregation functions (country/title/revenue breakdown) on fixed input → fixed output.
- Integration: history list shape, load returns nested companies+execs, persistence PUTs round-trip, dashboard breakdown parity vs Express. Report-title with mocked LLM + with LLM disabled (fallback).

## Done when
Parity empty across these endpoints; aggregation units green. **Rollback:** route these paths back to Express.
