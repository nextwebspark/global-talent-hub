# Frontend architecture

## Routing (`app/`)

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | `LandingPage` | Natural-language search, brief upload, import |
| `/universe/:searchQueryId` | `UniversePage` | Review streamed companies, accept/reject |
| `/dashboard` | `DashboardPage` | Map, data table, analytics, enrichment |
| `/projects` | `ProjectsPage` | Browse and open saved projects |
| `/settings` | `SettingsPage` | Account and org settings |
| `/login`, `/signup` | Auth pages | Unauthenticated only |

`Gate.tsx` wraps routes with session + org checks. `CommandPalette` mounts globally when authenticated.

## Data flow

```
API (lib/api/)  →  transforms (lib/store/transforms.ts)  →  Zustand (lib/store/)  →  components
```

Search SSE bypasses TanStack Query: `features/search/useSearchStream.ts` writes directly into the search slice of the store.

## Naming conventions

| Suffix | Meaning | Example |
|--------|---------|---------|
| `*Page` | Route entry component | `DashboardPage` |
| `*View` | Sub-view within a page | `AnalyticsView` |
| `*Panel` | Slide-over or side panel | `RightPanel`, `ProjectsPanel` |

## Feature modules

### `features/dashboard/`

- `DashboardPage.tsx` — layout shell, view switching (map / table / analytics)
- `components/map/` — Mapbox globe + executive satellites
- `components/DataTable/` — TanStack table with inline editing
- `panels/` — RightPanel, match review, Clockwork selector
- `views/AnalyticsView.tsx` — charts and summary stats

### `features/landing/`

- `LandingPage.tsx` — mode selector (search / brief / import)
- `panels/`, `hooks/` — co-located landing UI logic
- `fixtures/sampleData.ts` — demo retail companies for globe previews

### `features/projects/`

Shared project picker used from landing, universe, dashboard, and projects page.
