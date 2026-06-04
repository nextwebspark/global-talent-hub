# STEP-10 — Frontend shell (layout, providers, routing, theme)

**Goal:** App Router shell with providers, theme, file routing, and the clean client data layer — ready to host screens. Old SPA still serves screens until each is migrated.

## Reference
- `client/src/App.tsx` (Wouter routes → file routes), `client/src/main.tsx` (providers).
- `client/src/lib/queryClient.ts` (staleTime Infinity, no refetch on focus), `client/src/lib/api.ts` (fetch wrappers + hooks), `client/src/lib/useSearchStream.ts` (EventSource).
- `client/src/lib/store.ts` (846 LOC — split into slices), incl. dev hooks `window.__zustandStore` (:844) and `window.__E2E_SEED__`.
- Theme toggle: `client/src/pages/Landing/index.tsx:50-53` → `next-themes`.

## Build
- `app/layout.tsx`: `'use client'` provider tree (or a `Providers` client component) — `QueryClientProvider`, Radix `TooltipProvider`, `sonner` Toaster, `ThemeProvider` from `next-themes` (`attribute="class"`). Global CSS import.
- Routes: `app/page.tsx` (Landing — placeholder until STEP-11), `app/dashboard/page.tsx` (placeholder until STEP-12), `app/not-found.tsx` (port `not-found.tsx`).
- `lib/query-client.ts`, `lib/api-client.ts` (port fetch wrappers + TanStack hooks), `lib/hooks/use-search-stream.ts` (EventSource — `'use client'`).
- `lib/store/` — split the monolith into slices (`search-session.slice.ts`, `dashboard.slice.ts`, …) composed into one store. Preserve the exact state shape and the dev hooks (guarded by `process.env.NODE_ENV === 'development'`).
- Copy `components/ui/` (Shadcn primitives) as-is.

## Test
- `npm run check` green. App boots; theme toggle flips dark/light (Tailwind `class`).
- Unit (RTL): store slices (actions update state as before); a hook test for `useSearchStream` against a mock EventSource.
- Playwright smoke: `/` and `/dashboard` render the shell; 404 works.

## Done when
Shell renders, providers + theme + routing work, store slices pass, dev hooks present. **Rollback:** none (screens not cut yet).
