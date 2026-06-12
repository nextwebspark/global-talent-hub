# Client (`client/src`)

React 19 + Vite frontend for Global Talent Hub.

## Folder structure

```
src/
├── app/              # Shell: providers, auth gate, routing
├── features/         # One folder per user-facing area
│   ├── landing/      # Search entry (brief, import, NL query)
│   ├── universe/     # Live search results + accept flow
│   ├── dashboard/    # Map / table / analytics workspace
│   ├── projects/     # Project list + shared ProjectsPanel
│   ├── search/       # SSE search hook (useSearchStream)
│   ├── settings/
│   └── auth/
├── components/       # Shared UI (layout shell, shadcn primitives)
├── lib/              # Cross-cutting infra (api, store, auth)
├── hooks/            # Global hooks (toast, mobile)
└── types/            # Re-exported domain types
```

**Rule:** code used by one screen/flow → `features/X`. Code shared by two+ screens → `components/` or `lib/`.

## Main user flows

| Flow | Route | Entry file |
|------|-------|------------|
| Search | `/` | `features/landing/LandingPage.tsx` |
| Universe | `/universe/:id` | `features/universe/UniversePage.tsx` |
| Workspace | `/dashboard` | `features/dashboard/DashboardPage.tsx` |

## State

- **Zustand** (`lib/store/`) — session UI, companies, search stream state
- **TanStack Query** (`lib/api/`) — server data fetching and mutations

## Adding a new page

1. Create `features/<name>/<Name>Page.tsx`
2. Register the route in `app/AppRouter.tsx`
3. Co-locate feature-specific hooks/panels under `features/<name>/`

## Refactor status

See [REFACTOR_CHECKLIST.md](./REFACTOR_CHECKLIST.md) for the full 10-point audit (what's done vs deferred).
