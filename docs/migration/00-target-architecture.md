# 00 — Target Architecture (Next.js full-stack)

## Project layout

```
app/
  layout.tsx                 Root layout: providers, theme, fonts, global CSS
  page.tsx                   "/"  → Landing screen
  dashboard/page.tsx         "/dashboard" → Dashboard screen
  not-found.tsx              404
  api/
    health/route.ts          GET /api/health
    config/route.ts          GET /api/config  (mapbox token, server-side)
    companies/route.ts       GET/POST /api/companies
    companies/[id]/route.ts  GET/PATCH/DELETE /api/companies/:id
    ...                      one folder per resource (see 02-api-contract.md)
    search/enhanced-stream/route.ts   SSE via ReadableStream
lib/
  db/                        Drizzle client + schema (from shared/schema.ts)
  repositories/              per-domain data access (replaces DatabaseStorage god-facade)
  services/                  pipeline, enrichment, validation, parsers (clean ports)
  llm/                       provider-agnostic LLM client (mockable)
  taxonomy.ts                from shared/taxonomy.ts (values byte-identical)
  api-client.ts              browser fetch wrappers (from client/src/lib/api.ts)
  query-client.ts            TanStack Query config
  hooks/                     useSearchStream, etc.
  store/                     Zustand slices (split from the 846-LOC store.ts)
components/
  landing/                   Landing panels, ModeSelector, UniverseView
  dashboard/                 shell, view switching, command palette
  data-table/                DataTable split into column defs / cells / state hook
  map/                       Map + ExecutiveSatellites (client-only)
  right-panel/               RightPanel split per section
  charts/                    DashboardView (Recharts)
  ui/                        Shadcn/Radix primitives (copy as-is)
tests/
  unit/                      Vitest
  integration/               Vitest against route handlers + test Postgres
  e2e/                       Playwright
  fixtures/                  golden LLM I/O recordings
drizzle/                     drizzle.config.ts + generated migrations (reused)
```

## Backend = route handlers

- Each Express route becomes a Next route handler. Express `(req, res)` → Next `Request`/`NextResponse`.
- Body parsing: `await req.json()` / `req.formData()` for uploads (replaces `multer`).
- **Raw body for webhooks** (Clockwork HMAC): read `await req.text()` before parsing JSON — replaces the `rawBody` middleware in `server/index.ts:16-21`.
- Validation: keep Zod (`insert*Schema` from the schema). `schema.parse(body)` in the handler.
- Errors: a small helper returning `NextResponse.json({ error }, { status })` mirrors the Express global handler (`server/index.ts:70-81`).

## SSE in Next.js

The streaming search endpoint returns a `ReadableStream`:

```ts
export async function GET(req: Request) {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      for await (const ev of runEnhancedStream(query, ...)) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
```

The event objects must match the shapes the client consumes (see `02-api-contract.md`). The generator logic ports directly from `server/services/pipeline/seedListSearch.ts:86-194`.

## Data access = Drizzle on the same Postgres

- Reuse `shared/schema.ts` verbatim in `lib/db/schema.ts`. Connection from `DATABASE_URL` (mirror `server/db.ts`).
- **Reimplement queries with Drizzle**, not the Supabase REST client the old `DatabaseStorage` uses. This drops `@supabase/supabase-js` and gives type-safe queries.
- Replace the single 1,199-LOC `DatabaseStorage` facade with **per-domain repositories** (`companies.repo.ts`, `executives.repo.ts`, …). Same method behavior, smaller files.
- `drizzle-kit` already configured (`drizzle.config.ts`); the existing `migrations/` SQL is the baseline. No new migrations unless the schema changes (it doesn't).

## Client components & browser-only libs

- Mapbox GL, EventSource, `window.*` globals → `'use client'` components, `next/dynamic` with `ssr: false` for Mapbox.
- Theme: `next-themes` (already a dep) replaces `document.documentElement.classList.toggle('dark')`.
- Keep Zustand + TanStack Query + TanStack Table unchanged (they work identically); just split the monolith store into slices.

## Environment variables

Server-side (no prefix — never exposed to the bundle):
`DATABASE_URL`, `MAPBOX_ACCESS_TOKEN`, `GOOGLE_API_KEY`, `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `ENRICHMENT_MODEL`, `FAST_MODEL`, `CLOCKWORK_API_KEY`, `CLOCKWORK_API_SECRET`, `CLOCKWORK_FIRM_KEY`, `CLOCKWORK_FIRM_SLUG`, `CLOCKWORK_API_URL`, `DATABASE_SSL_REJECT_UNAUTHORIZED`.

> Mapbox token is fetched at runtime from `/api/config` and applied via `mapboxgl.accessToken`. **Do not** move it to `NEXT_PUBLIC_*`.

## Deploy

- Target a **VM / container** (Railway, already in use) — **not** serverless. SSE and long-running enrichment have no function timeout there.
- Build: `next build`; run: `next start` (or `node` on the standalone output). Single process.
- For genuinely long jobs (multi-minute enrichment), prefer a **job-id + poll/SSE-progress** pattern over holding the request open. Document if introduced; not required for parity.
