# Why local dev feels slow — latency map + per-step fixes

## Context

Every interaction in `npm run dev` (login, navigation, API calls) feels slow.

The new auth layer (branch `feat/auth-supabase-orgs`) added remote network hops to the hot
path of every interaction. Below is what actually happens on one interaction, where the time
goes, and the fix for each step — ranked by impact. None of these weaken auth; they remove
redundant network round-trips and add bounded caches.

## What one "click" costs today (the latency chain)

A single authed `/api/*` call walks this path:

```
CLIENT                                              SERVER
─ getSession() (lock-contended)  ──► /api/x ──► requireAuth:
  authFetch.ts:28                                 ├─ supabase.auth.getUser(token)  → HTTPS to Supabase Auth  ★
  AND/OR authHeaders()→getAccessToken()           └─ getOrgMembershipByUser(userId) → HTTPS to Supabase DB  ★
  queryClient.ts:13 / apiRequest:26               then the actual handler (its own DB calls)
```

★ = remote network round-trip that runs **on every request, serially**. That's the bottleneck.
Login feels worst because it fires several of these back-to-back (`/api/auth/me`,
`/api/auth/login-event`, first page data) while the Gate shows "Loading…".

## Per-step diagnosis & fix (ranked by impact)

### Step 1 — Server verifies JWT over the network on every request — BIGGEST WIN
`server/auth/middleware.ts:36` — `supabase.auth.getUser(token)` is a live HTTPS call to
Supabase's Auth API. The token is already a signed JWT with an `exp` claim, so a network call
to "trust" it is redundant until expiry. Two ways to fix:

- **A. Local JWT verify (fastest, zero network/request):** verify the signature offline with
  `SUPABASE_JWT_SECRET` + `jsonwebtoken`. Needs one new env var (JWT secret from Supabase
  dashboard → Settings → API). Removes the hop entirely.
- **B. Short-TTL token cache (no new env, simplest):** keep `getUser` but memoize by token in
  `Map<token,{user,expiresAt}>` ~60s. First request per token hits network, rest are instant.

Either keeps `extractToken` and `AuthedRequest` shape, so no downstream route edits.

### Step 2 — Org membership re-queried on every request — SECOND WIN
`middleware.ts:54` → `getOrgMembershipByUser` (`DatabaseStorage.ts:1279`) is a DB round-trip on
every gated request. Membership rarely changes. Cache `Map<userId,{membership,expiresAt}>`
~60s in the middleware; TTL eviction (best-effort) is fine for dev. Removes the second serial
remote hop.

### Step 3 — Client calls getSession() before every fetch — THIRD WIN
`supabase.auth.getSession()` is awaited in THREE places per call path:
`authFetch.ts:28`, `getAccessToken` in `authHeaders` (`queryClient.ts:13`), and `apiRequest`
(`queryClient.ts:26`). getSession contends on Supabase's navigator lock and stalls under
concurrent fetches. Fix: keep the live token in a module variable updated once via
`supabase.auth.onAuthStateChange`, expose a **synchronous** `getCachedToken()`, and use it in
all three spots (no await, no lock). Token already lives in memory after bootstrap
(`auth.tsx:86`).

### Step 4 — Vite cache-busts the entry module every navigation — MINOR
`server/vite.ts:47-50` rewrites `main.tsx?v=${nanoid()}` on every document load, forcing the
browser to refetch the module graph each navigation. Drop the `?v=` rewrite; keep reading
index.html from disk (so edits still hot-reload). Cheap latency on every page load.

### Step 5 — Login bootstrap is serial and gates the whole UI — PERCEIVED SPEED
`auth.tsx:90` awaits `loadOrg()` (→ `/api/auth/me`, itself 2 remote hops) before
`setLoading(false)`, so `App.tsx:38` shows "Loading…" until it finishes. Steps 1–3 already cut
`/api/auth/me` from ~3 remote hops to ~0–1, which fixes most of this. Optional extra polish:
render the app shell optimistically and resolve org in the background — only worth it if it
still feels slow after Steps 1–3.

## Out of scope (intentional, leave as-is)
- QueryClient `staleTime: Infinity` / `retry:false` — deliberate per CLAUDE.md.
- Mapbox import — already lazy-loaded.
- No change to auth correctness: still verify every token, still require org; we only delete
  redundant remote round-trips and add bounded in-memory caches.

## Verification
1. `npm run check` — type clean.
2. `npm run dev`, Network tab: log in, then click around `/`, `/dashboard`, `/projects`.
   - `/api/*` calls no longer each wait on an outbound Supabase Auth call; per-request server
     time drops on cache/local-verify hits. No `?v=` on the entry script.
3. Sign out → gated `/api` calls must 401 (cache keyed by token; client token clears on
   `SIGNED_OUT`). Tampered/expired token still 401s (local-verify) or re-checks after TTL (cache).

## Recommendation
Do Steps 1–4 (Step 1 = option A local-verify if you can grab the JWT secret, else B). Small,
isolated edits with the biggest payoff. Reassess Step 5 only if login still drags.
