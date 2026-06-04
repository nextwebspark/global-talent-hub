# STEP-17 — Full cutover & decommission

**Goal:** The new Next.js app fully replaces the old stack: all 62 endpoints + all screens served by Next.js, deployed on a VM, old Express + Vite SPA retired.

## Pre-checks
- Every backend step (03–09) parity diff empty; every frontend step (11–16) behavior + screenshot parity green.
- `npm run check` clean; `npm run test:unit` + `npm run test` (Playwright) green against the new app.
- Dead deps removed (`express`, `vite`, `wouter`, `esbuild`, `@replit/*`, `multer`, `@supabase/supabase-js`, unused LLM SDKs). Confirm with repo-wide grep that nothing imports them.

## Build / deploy
1. Full E2E suite against the new app on a **staging copy** of the DB: search → universe → save → dashboard → table/map/right-panel/charts → Clockwork match/confirm → import. Compare screenshots to the old-SPA baselines one final time.
2. Configure VM/container deploy (Railway): `next build` → `next start` (or standalone `node`). Set all server env vars (`00-target-architecture.md`). Confirm SSE works through the platform (no proxy buffering, no timeout) and long enrichment runs complete.
3. Smoke `/api/health`, `/api/config`, one search stream, one dashboard load in the deployed env.
4. Flip production traffic to the new app. Keep the old app deployable for a short rollback window.

## Test / verify
- Production smoke: health, config token, a real search stream renders a universe, a dashboard loads with map+table+charts, one inline edit persists.
- Watch logs for errors over the rollback window.

## Done when
New app serves 100% of traffic on the VM with full behavior + look/feel parity; old Express/Vite removed after the rollback window. **Rollback:** repoint traffic to the old app (still on the same DB) until any regression is fixed.

## Optional follow-ups (out of migration scope)
- Long-running enrichment → job-id + poll/SSE-progress worker pattern.
- LLM provider swap (Gemini → Anthropic/OpenAI) now that the client is provider-agnostic.
- Auth (the `users` table exists but routes are currently unauthenticated).
