# STEP-16 — Charts, Match Review, Import panels

**Goal:** The Charts view (Recharts), the Clockwork match-review panel, and the import/brief UI flows reproduce identically. Completes the frontend.

## Reference
- `client/src/components/DashboardView.tsx` (978) — Recharts country/title/revenue breakdowns from `GET /api/dashboard/:searchId`.
- `client/src/components/panels/MatchReviewPanel.tsx` (804) — confirmed/possible/no-match from `POST /api/enrichment/match`; confirm → `POST /api/enrichment/confirm`; create-from-clockwork; import-candidate.
- Landing import/brief: `panels/ImportPanel.tsx`, `panels/BriefPanel.tsx` (most wiring done in STEP-11; finalize end-to-end here).

## Build
- `components/charts/` — split `DashboardView` into `dashboard-charts.tsx` + per-chart components (country, title, revenue). `'use client'` (Recharts is client-only). Data via TanStack Query.
- `components/match-review/` — `match-review-panel.tsx` + `match-row.tsx` + buckets; wire match/confirm/create/import mutations.
- Finalize import-project + bulk-import flows against the STEP-06 endpoints.

## Test
- Unit (RTL): chart components render for fixed breakdown data; match buckets render; confirm fires `/enrichment/confirm` with correct payload.
- Playwright: open Charts view → charts match seeded breakdown (screenshot-diff); run a Clockwork match → review → confirm flow (mocked Clockwork) and assert the exec is enriched; import a fixture file end-to-end.

## Done when
Charts + match-review + import behavior/screenshots match. All 3 dashboard views + panels now on the new app. **Rollback:** respective slot placeholders / old SPA.
