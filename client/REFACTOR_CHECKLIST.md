# Frontend refactor checklist (10 points)

Status of the readability refactor. **No UI or behavior changes** were made intentionally — only file moves, renames, and logic extracted into hooks with identical behavior.

| # | Recommendation | Status | Notes |
|---|----------------|--------|-------|
| 1 | **Feature-based folder layout** (`features/`, `app/`, shared `components/`) | ✅ Done | `pages/` removed; routes use `features/*` |
| 2 | **Fix confusing naming** | ✅ Done | `DashboardPage`, `AnalyticsView`, `UniverseResults`, `NotFound`, `*Page` suffix on route components |
| 3 | **Unify panels & hooks** | ✅ Done | Panels under `features/<area>/panels/` or `features/projects/`; landing hooks in `features/landing/hooks/`; global hooks stay in `hooks/` |
| 4 | **Split god files** | ⚠️ Partial | `lib/store/` and `lib/api/` split. **Not split** (to avoid UI regressions): `RightPanel.tsx` (~1.3k lines), `DataTable/index.tsx` (~1k), `AnalyticsView.tsx` (~978), `Map.tsx` (~878) — safe follow-up phase |
| 5 | **Split `lib/api.ts`** | ✅ Done | `lib/api/{companies,executives,search,enrichment,types}.ts` |
| 6 | **Obvious routing** | ✅ Done | `app/AppRouter.tsx`, `app/Gate.tsx`, `app/providers.tsx` |
| 7 | **Document user flows** | ✅ Done | `client/README.md`, `client/ARCHITECTURE.md`, comment in `AppRouter.tsx` |
| 8 | **Separate domain types** | ✅ Done | `lib/store/types.ts`, `types/index.ts` re-exports |
| 9 | **Thin page components** | ⚠️ Partial | `DashboardPage` hooks extracted (`useDashboardKeyboard`, `useRightPanelResize`, `useDashboardProjectPersist`). Full layout split deferred to avoid risk |
| 10 | **Small cleanup** | ✅ Done | `sampleData` → `features/landing/fixtures/`; `replit_integrations/` removed; shims at `lib/useSearchStream.ts`, `lib/sampleData.ts`. `@assets` alias unused (no imports); `index.css` kept at entry (vite convention) |

## Verification

```bash
npm run check      # TypeScript
npm run test:unit  # Vitest (includes store tests)
```

## For new developers

1. Read `client/README.md` (structure)
2. Read `client/ARCHITECTURE.md` (routes + data flow)
3. Open `app/AppRouter.tsx` (all routes)
