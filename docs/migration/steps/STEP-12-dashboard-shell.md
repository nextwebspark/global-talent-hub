# STEP-12 — Dashboard shell (views, command palette, panels)

**Goal:** The `/dashboard` frame reproduces view switching (Map/Table/Charts), keyboard shortcuts, command palette, resizable panels, and right-panel mounting — with child views stubbed until STEP-13..16.

## Reference
- `client/src/pages/Dashboard.tsx` (491) — view state, keys `1/2/3`, Cmd+K, panel resize, projects panel, match-review mounting, `__E2E_SEED__` check (:92).
- `components/layout/` (TopBar 253, Sidebar 101, CompanyList 338), `cmdk` command palette, `react-resizable-panels`.

## Build
- `components/dashboard/` — `dashboard-shell`, `top-bar`, `sidebar`, `view-switcher`, `command-palette`, `panel-layout`. `'use client'`.
- `app/dashboard/page.tsx` renders the shell; mounts view slots (Map/Table/Charts placeholders) + a `RightPanel` slot + `MatchReviewPanel` slot.
- Keyboard shortcuts via a `useEffect` keydown handler (port from Dashboard.tsx:52-69). Command palette wired to the same actions.
- Load project data via TanStack Query (`/api/search-history/:id/load`, `/api/dashboard/:searchId`).

## Test
- Unit (RTL): view-switcher changes active view; shortcut keys switch views; command palette opens/filters.
- Playwright: open `/dashboard` with seeded data; switch views via keys + UI; open/close command palette; resize panel. Screenshot-diff the shell + each empty view slot vs old SPA.

## Done when
Shell behavior + screenshots match (child views may be placeholders). **Rollback:** serve `/dashboard` from old SPA.
