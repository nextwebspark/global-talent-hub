# STEP-00 — Scaffold the Next.js app

**Goal:** A running Next.js App Router project with TypeScript, Tailwind 4, path aliases, env wiring, and a `/api/health` route that returns ok.

## Reference
- `vite.config.ts` (aliases `@`→`client/src`, `@shared`→`shared`), `tsconfig.json` (paths).
- `server/index.ts:64-66` (health), `:70-81` (error handler shape).
- `package.json` scripts (test runners already present).

## Build
1. `npx create-next-app@latest` — App Router, TypeScript, Tailwind, ESLint, `app/` dir, no `src/` (or `src/` — pick one and keep it). Import alias `@/*`.
2. Add `@shared/*` alias in `tsconfig.json` → `./lib/shared/*` (we relocate `shared/` content into the app under `lib/`).
3. Tailwind 4: use the native Next.js Tailwind setup (no `@tailwindcss/vite`). Port the global CSS (Tailwind layers, Shadcn theme vars) from `client/src/index.css`.
4. `app/api/health/route.ts` → `export async function GET() { return Response.json({ status: "ok" }); }`.
5. Add a tiny error helper `lib/http.ts`: `jsonError(message, status)` → `NextResponse.json({ error: message }, { status })`.
6. `.env.local` with the server-side vars from `00-target-architecture.md` (start with `DATABASE_URL`, `MAPBOX_ACCESS_TOKEN`).
7. Wire test scripts in `package.json`: `test:unit` → `vitest run`, `test` → `playwright test`, `check` → `tsc --noEmit`. Add `vitest.config.ts` (jsdom env) and `playwright.config.ts`.

## Test
- `npm run dev` → app boots, no errors.
- `curl localhost:3000/api/health` → `{"status":"ok"}`.
- `npm run check` → passes.
- `npm run test:unit` → runs (0 tests ok) — confirms Vitest wired.

## Done when
Dev server boots, health returns ok, typecheck + vitest run clean. **Rollback:** delete the new project folder; old app untouched.
