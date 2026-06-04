# STEP-14 — Map view (Mapbox — kept)

**Goal:** The Map view reproduces the Mapbox globe, company markers (draggable), executive satellite orbits, dark/light style switching, and the company-list side panel — Mapbox preserved, files split, client-only.

## Reference
- `client/src/components/map/Map.tsx` (839): token fetch from `/api/config` (:104-107), `mapboxgl.accessToken` (:115), map init (:113-211), `window.mapboxMap` global (:138, cleared :207), styles `dark-v11`/`light-v11` (:28-29), custom markers (`mapbox-company-marker`, draggable, :501-503), `MutationObserver` for dark mode.
- `client/src/components/map/ExecutiveSatellites.tsx` (646) — orbit/satellite layer.
- `client/src/components/layout/CompanyList.tsx` (338) — reads `window.mapboxMap`.
- Mapbox marker styles in `client/src/index.css`.
- Persistence: `PUT /api/search/:id/{map-positions,satellite-hierarchies,satellite-orders}`.

## Build (`components/map/`)
- Keep `mapbox-gl` + `import 'mapbox-gl/dist/mapbox-gl.css'`.
- `map-view.tsx` — `'use client'`; load via `next/dynamic` with `{ ssr: false }`. Fetch token from `/api/config` (ported in STEP-09) and set `mapboxgl.accessToken`. **No `NEXT_PUBLIC_`.**
- Split: `use-map.ts` (init/teardown, `window.mapboxMap`), `markers.ts` (company markers, drag → persist positions), `executive-satellites.tsx`, `map-styles.ts` (dark/light + theme observer; prefer subscribing to `next-themes` over `MutationObserver` if cleaner, but keep the same visual result).
- Port Mapbox marker CSS into the new global stylesheet.
- `CompanyList` → `company-list.tsx`, keep `window.mapboxMap` interaction.

## Test
- Unit: marker build helper; style selection by theme; drag→persist payload shape.
- Playwright (headed/CI with token): map renders, markers appear for seeded companies, dragging a marker fires the positions PUT, toggling theme switches style. Screenshot-diff (allow tile-render tolerance) vs old SPA.

## Done when
Map behavior + (tolerant) screenshots match; token still server-side via `/api/config`. **Rollback:** Map slot placeholder / old SPA.
