# STEP-11 — Landing + Search + Universe view

**Goal:** The `/` screen reproduces search/brief/import modes, PD upload, and the live-streaming Universe view (accept/reject, adjacent-sector banner, add-company, save→dashboard) with identical behavior and look.

## Reference
- `client/src/pages/Landing/index.tsx` + `ModeSelector.tsx` + `panels/{SearchPanel,BriefPanel,ImportPanel}.tsx` + `hooks/{usePdUpload,useImportMode,useBriefMode}.ts` + `results/UniverseView.tsx` (554) + `utils.ts`/`types.ts`/`constants.ts`.
- SSE consumption: `lib/hooks/use-search-stream.ts` (STEP-10) → events from STEP-08.
- Behavior spec: `01-functionality-spec.md` (Landing + Universe).

## Build
- `components/landing/` — `mode-selector`, `panels/`, `universe-view/` (split the 554-LOC view into card / sidebar / activity-feed / add-company-modal). `'use client'` where interactive.
- `app/page.tsx` renders the Landing composition.
- Wire submit → `useSearchStream` → store; render skeletons on `company_found`, fill on `company_enriched`, banner on `adjacent_sector_found`, end on `search_complete`/`no_results`.
- Framer Motion phase transitions preserved. Save → create/link project → `router.push('/dashboard')`.

## Test
- Unit (RTL): panels render per mode; accept/reject toggles store; add-company modal validation.
- Playwright: seed via `__E2E_SEED__` or a mocked SSE; run a full search → universe → accept → save flow; assert same outcomes as old SPA. Screenshot-diff Landing (input) and Universe (streaming + complete) vs old SPA baselines.

## Cut over
Serve `/` from the new app once parity holds.

## Done when
Behavior + screenshot parity for `/`. **Rollback:** serve `/` from old SPA.
