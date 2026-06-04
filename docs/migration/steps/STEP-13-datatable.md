# STEP-13 — DataTable (rebuild the 1,073-LOC monolith clean)

**Goal:** The Table view reproduces all columns, sorting/grouping/expansion, editable cells, density modes, and per-project config persistence — as clean, split modules.

## Reference
- `client/src/components/DataTable/index.tsx` (1,073) + the rest of `components/DataTable/`.
- Cell types: `EditableCell`, `SearchableSelectCell`, `CompanyAutocompleteCell`, `SelectCell`.
- Persistence: `tableConfig` in the store + `PUT /api/search/:id/table-config`.

## Build (`components/data-table/`)
- `columns/` — column definitions grouped by concern (company cols, executive cols, formatters for revenue/employees).
- `cells/` — one file per cell component.
- `use-table-state.ts` — sorting/visibility/grouping/expansion/density hook (TanStack Table row models).
- `data-table.tsx` — thin composition (≤300 LOC). `'use client'`.
- Persist config to store + PATCH on change, exactly as before.

## Test
- Unit (RTL): each cell type (edit commits via the right mutation; select/autocomplete behavior); formatters; grouping/sort toggles update table state.
- Playwright: render table with seeded project; sort, group, expand, edit a cell (assert PATCH fired + value persists), change density; reload → config restored. Screenshot-diff vs old SPA.

## Done when
Table behavior + screenshots match; no file over ~400 LOC. **Rollback:** previous dashboard build (Table slot placeholder) / old SPA.
