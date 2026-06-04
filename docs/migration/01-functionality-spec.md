# 01 — Functionality Spec (the screen/behavior contract)

What each screen does today. Behavior + look/feel are **frozen**. Reference files are under `client/src/`. Verify with Playwright (behavior + screenshot) against the old SPA.

## Screens / routes
| Route | Screen | Reference |
|-------|--------|-----------|
| `/` | Landing | `pages/Landing/index.tsx` (+ `panels/`, `results/`, `hooks/`) |
| `/dashboard` | Dashboard | `pages/Dashboard.tsx` |
| 404 | Not found | `pages/not-found.tsx` |

## Landing (`/`)

Three modes via `ModeSelector` (`pages/Landing/ModeSelector.tsx`):
1. **Search** (`panels/SearchPanel.tsx`) — natural-language query box. On submit → opens SSE to `/api/search/enhanced-stream` via `useSearchStream` → streams the "universe".
2. **Brief** (`panels/BriefPanel.tsx`, `hooks/useBriefMode.ts`) — structured brief input.
3. **Import** (`panels/ImportPanel.tsx`, `hooks/useImportMode.ts`) — upload Excel/CSV project.

**PD upload** (`hooks/usePdUpload.ts`): attach a position-description doc (pdf/docx/txt) → `POST /api/search/upload-pd`; stored on the search session, can be flagged confidential.

### Universe view (`results/UniverseView.tsx`, 554 LOC)
- Grid of company cards streamed in live (skeletons on `company_found`, filled on `company_enriched`).
- Sector sidebar; **adjacent-sector banner** when AI suggests adjacent sectors.
- Per-company **accept / reject** toggle (forms the project).
- Search rationale + activity feed (intent, events).
- **Add company manually** modal.
- Framer Motion phase transitions: input → streaming → complete.
- Save → creates/links a project (searchQuery) and navigates to `/dashboard`.

## Dashboard (`/dashboard`, `pages/Dashboard.tsx`, 491 LOC)

Three views, switchable (keys `1`/`2`/`3` + UI):
1. **Map** — `components/map/Map.tsx` (Mapbox globe) + `ExecutiveSatellites.tsx`. Company markers (draggable), exec satellite orbits, dark/light styles. `components/layout/CompanyList.tsx` side list reads `window.mapboxMap`.
2. **Table** — `components/DataTable/` (TanStack Table, 40+ cols, grouping/sorting/expansion, editable cells, density modes; config persisted per project).
3. **Charts** — `components/DashboardView.tsx` (Recharts: country/title/revenue breakdowns), data from `GET /api/dashboard/:searchId`.

Shared:
- **Right panel** (`components/panels/RightPanel.tsx`, 1,345 LOC): company/executive detail with inline-editable accordion sections — career, education, remuneration, custom fields, notes. Saves via PATCH endpoints.
- **Command palette** (Cmd+K).
- **Match review panel** (`components/panels/MatchReviewPanel.tsx`): Clockwork enrichment — shows confirmed/possible/no-match, user confirms → `POST /api/enrichment/confirm`.
- Resizable panels (`react-resizable-panels`).
- Theme toggle (dark/light) — drives Mapbox style + Tailwind.

## State & data flow
- **Zustand store** (`lib/store.ts`, 846 LOC) — search-session state + dashboard state (companies, executives, selection, panel view, hidden countries, table config, map positions). Split into slices on migration; keep the same shape and the dev hooks `window.__zustandStore` / `window.__E2E_SEED__`.
- **TanStack Query** (`lib/api.ts`, `lib/queryClient.ts`) — REST reads/mutations; `staleTime: Infinity`, no refetch on focus.
- **SSE** (`lib/useSearchStream.ts`) — EventSource → applies events to the store.

## Look/feel parity checklist (per screen)
- Same layout, spacing, colors (Tailwind 4 + Shadcn theme — copy `ui/` + global CSS).
- Same interactions (accept/reject, drag markers, inline edit, command palette, view switching, keyboard shortcuts).
- Same empty/loading/error states (skeletons, no-results reason, toasts via `sonner`).
- Framer Motion transitions preserved on Landing/Universe.
- Screenshot-diff each screen vs the old SPA in STEP-11..16.
