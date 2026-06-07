# Global Talent Hub — GCP Migration Plan (phased, 2 envs)

## Context

App currently runs on **Railway (nixpacks)** with **Supabase** for both data (Postgres,
`hak_*` tables accessed via the Supabase JS REST client) and **auth** (Supabase Auth: JWT,
OAuth Google/Azure). Goal: move everything to **GCP** with **two environments
(staging + production)**, done **stepwise** so the app keeps working at every step:
**app → DB → auth**, then decommission Supabase.

Locked decisions:
- **Compute:** Cloud Run (containerized), two services `-staging` / `-prod`.
- **Auth:** Replace Supabase Auth with **GCP Identity Platform (Firebase Auth)**, OAuth Google + Azure.
- **DB:** Supabase Postgres → **Cloud SQL for PostgreSQL**; rewrite storage layer from Supabase JS
  client (`supabase.from`) to **Drizzle/pg**; drop `@supabase/supabase-js` at the end.

**Is Drizzle right for Cloud SQL? Yes.** `server/db.ts` already runs Drizzle over `node-postgres`
`pg.Pool` + `DATABASE_URL`. Cloud SQL is plain Postgres — point `DATABASE_URL` at it, no new DB tech.
`shared/schema.ts` is already the Drizzle source of truth. We are *removing the Supabase REST client*,
not picking an ORM fresh — Drizzle is the natural target (alternatives = churn, no gain). Caveat:
tune `pg.Pool` `max` low (≈5–10) since Cloud Run scales many instances × pool → Cloud SQL connection blowout.

## Verified facts (confirmed in exploration)

- **Schema-name mismatch (BLOCKER for Phase 2):** `shared/schema.ts` `pgTable()` names are UNPREFIXED
  (`"companies"`, `"org_members"`, …) but physical tables are `hak_*` (queried via `supabase.from("hak_companies")`,
  ~44 `hak_*` call sites + 2 `company_enrichment`). Drizzle would hit wrong tables. Must rename pgTable names → `hak_*`
  before the storage rewrite. `company_enrichment` stays unprefixed.
- **esbuild externals (Docker risk):** `script/build.ts` bundles only an allowlist; most deps are `external`
  (`@supabase/supabase-js`, `@google/genai`, `mammoth`, `pdf-parse`, later `firebase-admin`, `@google-cloud/storage`).
  Runtime image MUST contain prod `node_modules` → `npm ci --omit=dev` in runtime stage. Missing → `MODULE_NOT_FOUND`.
- **Uploads ephemeral-fs problem:** `server/routes/shared/upload.ts` exec images use `multer.diskStorage` → `./uploads`;
  `server/static.ts` serves `/uploads`; `executives.ts` stores `imageUrl = "/uploads/<file>"`. Cloud Run fs is ephemeral
  → move exec images to **GCS**. PD/brief PDFs already use `memoryStorage` (fine).
- **SSE:** `server/routes/registrations/search.ts` long-lived stream, sets `X-Accel-Buffering: no`. Needs Cloud Run
  timeout 3600s, min-instances ≥1, modest concurrency, no buffering middleware.
- **Auth surface:** client `lib/supabase.ts` imported by `auth.tsx`, `authFetch.ts`, `queryClient.ts`,
  `useSearchStream.ts`, `pages/Auth/Signup.tsx`. Server `server/supabase.ts` + `server/auth/middleware.ts`
  (`supabase.auth.getUser(token)`), `orgGuard.ts`. Multi-tenancy is **app-level** (every query filters `org_id`),
  **no RLS**; role checks in middleware. SSE token passed as `?access_token=`.
- **Vertex AI path already exists** (`GOOGLE_GENAI_USE_VERTEXAI`, `server/credentials.ts`). On Cloud Run, prefer
  runtime service-account ADC over `GOOGLE_VERTEX_KEY_JSON` key file.
- **company_enrichment** (`db-extent/company_enrichment.sql`): physical table, 23 cols, FK→`hak_companies`, GIN on
  `sector_tags`. **Not** a Drizzle table — add a def in Phase 2.
- **Tests:** Vitest (`server/routes/__tests__/orgScoping.test.ts` = org IDOR; pipeline LLM tests). Playwright E2E exists.

## Cross-cutting: keep staging + prod parallel (every phase)

- **Two GCP projects** `gth-staging` / `gth-prod` (hard IAM/billing/quota isolation). Every resource env-suffixed.
- Two Cloud Run services, two Cloud SQL instances, two Identity Platform configs, two GCS buckets, two Secret sets,
  two Cloud Build triggers.
- **Promotion by image digest:** build once, verify on staging (health + smoke + E2E), promote the *same* image to prod;
  only env/secrets differ.
- **Rollback primitive:** Cloud Run keeps prior revisions → shift traffic to last-good. DB = PITR/snapshot. Per-phase notes below.

## Env-var → secret mapping

- **Runtime (Cloud Run env/Secret Manager):** `DATABASE_URL`, `NODE_ENV=production`, `DATABASE_SSL_REJECT_UNAUTHORIZED`,
  `MAPBOX_ACCESS_TOKEN`, `CLOCKWORK_*`, `OPENROUTER_API_KEY`, `ENRICHMENT_MODEL`, `FAST_MODEL`,
  `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`. (`PORT` injected by Cloud Run — don't set.)
  Temporary: `SUPABASE_URL`, `SUPABASE_KEY`.
- **Build-time (Vite, baked into client bundle):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Phases 1–2) →
  replaced by `VITE_FIREBASE_*` (Phase 3).

---

## Phase 0 — GCP foundation + verify schema names (no app change)

**Objective:** stand up GCP scaffolding; resolve schema-name blocker on paper.

**Steps**
1. Create projects `gth-staging`, `gth-prod`. Enable APIs: Cloud Run, Cloud Build, Artifact Registry, Secret Manager,
   Cloud SQL Admin, Identity Platform, Cloud Storage, IAM, Vertex AI.
2. Artifact Registry Docker repo per project.
3. Per-env runtime service accounts (least privilege: Secret Manager accessor, Cloud SQL Client, Storage object admin on
   env bucket, Vertex AI user). Cloud Build SA with deploy perms.
4. Create Secret Manager secrets (placeholders) per env per the mapping above (incl. temporary `SUPABASE_*`, `VITE_SUPABASE_*`).
5. **Confirm against live `information_schema.tables`** that the 16 tables are `hak_*` and `company_enrichment` is unprefixed;
   produce the exact `pgTable` rename list.

**Verify:** `gcloud` lists resources per env; CI SA pushes to Artifact Registry; secrets readable by run SA.
**Rollback:** none (additive infra; app still on Railway).

---

## Phase 1 — Containerize + deploy to Cloud Run (staging→prod), STILL on Supabase DB + auth

**Objective:** run current app on Cloud Run against live Supabase DB + auth. Only behavior change: uploads → GCS.

**Create**
- `Dockerfile` (multi-stage):
  - build: `node:22`, `npm ci`, accept `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` as `--build-arg` (export before
    `npm run build` so Vite bakes them) → `dist/`.
  - runtime: `node:22-slim`, copy `dist/` + `package.json`+`package-lock.json`, **`npm ci --omit=dev`** (required — esbuild
    externalizes deps), `CMD ["node","dist/index.cjs"]`. Server reads `process.env.PORT`, binds `0.0.0.0`. Health at `/api/health`.
- `.dockerignore` (exclude `node_modules`, `.env`, `dist`, `.git`, `uploads`, tests).
- `cloudbuild.staging.yaml` / `cloudbuild.prod.yaml` (or parameterized): build w/ `VITE_*` build-args, push, `gcloud run deploy`.

**Modify**
- `server/routes/shared/upload.ts`: exec-image upload `diskStorage` → `memoryStorage` (keep 5MB + mime filter).
- `server/routes/registrations/executives.ts` (~L334–346): upload `req.file` buffer to GCS (`@google-cloud/storage`),
  set `imageUrl` to object URL. Add `@google-cloud/storage` as prod dep.
- `server/static.ts`: drop disk `/uploads` static mount; store full GCS URL in `imageUrl` (recommended), or proxy `/uploads/:key`→GCS.
- One-off: migrate existing `/uploads/exec-*` files to GCS + rewrite `imageUrl` (do in Phase 2 data step, or accept broken legacy thumbs — decide).

**Cloud Run config (both envs):** request timeout `3600s`; min-instances ≥1; concurrency modest (≈40–80, SSE holds conns);
keep `X-Accel-Buffering: no`; secrets from Secret Manager; Vertex via runtime-SA ADC (leave `GOOGLE_VERTEX_KEY_JSON` +
`GOOGLE_APPLICATION_CREDENTIALS` unset so `server/credentials.ts` falls through to ADC — verify Vertex works, else keep JSON secret temporarily).

**Verify:** staging `/api/health` 200; Supabase login works; org-scoped page loads; exec upload → GCS + renders;
SSE search streams >60s without truncation; Vitest `orgScoping.test.ts` green; Playwright smoke vs staging. Promote image to prod, re-smoke. Railway kept live.
**Rollback:** shift Cloud Run traffic to prior revision, or fall back to Railway. Config-only (no DB/auth change).

---

## Phase 2 — DB: Supabase Postgres → Cloud SQL + rewrite storage to Drizzle (auth still Supabase)

**Objective:** move data to Cloud SQL; replace `supabase.from()` with Drizzle/pg.

**Steps & files**
1. **Provision Cloud SQL for PostgreSQL** (staging+prod), match Supabase PG major version. DB + app user. Connect Cloud Run via
   Cloud SQL connector/Auth Proxy (private IP). Set `DATABASE_URL` secret. Tune `pg.Pool` `max` ≈5–10 in `server/db.ts`. Enable needed extensions (array GIN for `sector_tags`).
2. **Fix schema names** in `shared/schema.ts`: rename every `pgTable("x", …)` → `hak_*` (users, companies, executives,
   career_history, education, remuneration, executive_notes, company_notes, search_queries, search_results, search_sessions,
   organizations, org_members, user_profiles, login_events, pipeline_log). Leave `company_enrichment` unprefixed.
3. **Add `company_enrichment` Drizzle def** mirroring `db-extent/company_enrichment.sql` (23 cols, FK→`hak_companies`, GIN on `sector_tags`).
4. **Rewrite `server/storage/DatabaseStorage.ts`** (92 methods, 46 call sites) `supabase.from(...)` → Drizzle `db`. Reuse `server/db.ts`.
   `keysToCamel/keysToSnake` (`internal/case.ts`) become unneeded (Drizzle maps cols) — verify return shapes still match the
   camelCase contract routes expect. Replace `internal/sb.ts` (`sb`/`sbOpt`) with Drizzle try/catch. **Preserve every `org_id`
   filter exactly** (IDOR safety). `.maybeSingle()`→`limit(1)`; preserve array returns.
5. **Create schema in Cloud SQL:** `drizzle-kit push` for Drizzle tables, then apply `db-extent/*.sql` for non-Drizzle bits +
   constraints/indexes/FKs/defaults not in Drizzle (verify GIN). Never auto-drop.
6. **Data migration:** `pg_dump` from Supabase (`--no-owner --no-privileges`, the `hak_*` + `company_enrichment` tables + sequences)
   → restore into Cloud SQL per env. Reset sequences. Verify row counts.
7. **Cutover:** flip `DATABASE_URL` secret on staging, redeploy, smoke; then prod. Supabase **auth** still in use (`SUPABASE_*` env stays).
8. Keep `server/supabase.ts` + `@supabase/supabase-js` (auth still imports server client); storage no longer does.

**Verify:** `orgScoping.test.ts` + pipeline tests green vs Cloud SQL; row-count parity Supabase↔Cloud SQL; full CRUD smoke;
enrichment writes `company_enrichment`; cross-org id → 404 (`orgGuard`); E2E staging→prod.
**Rollback:** keep the **pre-Phase-2 image** (still talks Supabase) as rollback target; revert `DATABASE_URL`. Treat Supabase as
read-only source of truth until verified — no destructive change during cutover.
**Risk (data freshness):** writes between `pg_dump` and cutover are lost → short write-freeze / final incremental dump for prod.

---

## Phase 3 — Auth: Supabase Auth → GCP Identity Platform (Firebase), preserve UIDs

**Objective:** replace Supabase Auth with Identity Platform (Google + Azure OIDC) **preserving user UUIDs** so
`hak_org_members.user_id` / `hak_user_profiles` FKs stay valid.

**Steps & files**
1. **Enable Identity Platform** per env; configure Google + Microsoft (Azure AD OIDC); authorized domains = Cloud Run URLs.
2. **Migrate users preserving UID (KEY RISK):** export Supabase `auth.users`; import to Identity Platform via Firebase Admin
   `importUsers()` with the **same `uid`** = Supabase UUID. Supabase password hashes are bcrypt → import with `BCRYPT`
   params; OAuth-only users need no hash. Where hash import infeasible → forced reset / OAuth-link. UID equality mandatory.
3. **Client rewrite:**
   - `client/src/lib/supabase.ts` → Firebase shim keeping the same export surface (`getAccessToken()` → `currentUser.getIdToken()`)
     to minimize churn in `queryClient.ts`, `useSearchStream.ts`, `Signup.tsx`. Add `client/src/lib/firebase.ts` (`VITE_FIREBASE_*`).
   - `client/src/lib/auth.tsx`: rewrite session/sign-in/out/`onAuthStateChanged` to Firebase; OAuth via popup/redirect (Google + Microsoft).
   - `client/src/lib/authFetch.ts`: send Firebase ID token as Bearer. SSE token query param = Firebase ID token.
   - `pages/Auth/Signup.tsx`: Firebase sign-up; org-bootstrap call unchanged.
   - Swap build secrets `VITE_SUPABASE_*` → `VITE_FIREBASE_*` in Dockerfile build-args + Secret Manager.
4. **Server rewrite** `server/auth/middleware.ts`: replace `supabase.auth.getUser(token)` with Firebase Admin `verifyIdToken(token)`
   (Admin SDK via runtime-SA ADC, no key file). Map `decoded.uid` → `req.userId`. Replace `User` type from `@supabase/supabase-js`
   with local/`DecodedIdToken`. `requireAuth`/`requireOrgAdmin`/`orgGuard` unchanged (UID preserved). Add `firebase-admin` prod dep.
   **JWT-format risk:** audit every `req.user.*`/claim read — Supabase `sub` → Firebase `uid`.
5. **Cutover:** staging first (deploy new auth + `VITE_FIREBASE_*`); test Google/Azure/email-pw login, session persist, SSE auth,
   org gating; then prod. `server/supabase.ts` present but unused.

**Verify:** migrated user logs in via Google/Azure → correct org (proves UID continuity); email/pw login (hash import) or reset;
`requireOrgAdmin` gates; cross-org IDOR 404 (update `orgScoping.test.ts` to Firebase tokens); SSE auth >60s; E2E staging→prod.
**Rollback:** redeploy Phase-2 image (Supabase auth) + restore `VITE_SUPABASE_*`. UIDs identical → both systems map to same
`user_id` rows, toggling back is safe. Keep Supabase Auth alive until Phase 4 soak.

---

## Phase 4 — Decommission Supabase + cleanup

**Objective:** remove all Supabase code/deps/secrets; finalize CI/CD.

**Steps**
1. Grep `supabase`/`SUPABASE_`/`VITE_SUPABASE_` → only dead code remains.
2. Delete `server/supabase.ts`; delete `server/storage/internal/sb.ts` (and `case.ts` if unused after rewrite); clean client shim remnants.
3. Remove `@supabase/supabase-js` from `package.json`; rebuild; confirm esbuild externals no longer reference it.
4. Remove `SUPABASE_URL/KEY`, `VITE_SUPABASE_*`, and (if ADC used) `GOOGLE_VERTEX_KEY_JSON` from Secret Manager + Cloud Run.
   Simplify `server/credentials.ts` to ADC-only.
5. Remove `railway.toml`/nixpacks; Cloud Build = sole CI/CD. Two triggers, branch protection, digest promotion, rollback runbook.
6. After retention window + final backup export: pause/delete Supabase project. Decommission Railway.

**Verify:** clean build + all Vitest + Playwright E2E green on both envs, zero Supabase refs; prod 100% on Cloud Run; Railway off; Supabase off.
**Rollback:** point of no return — gate on a 1–2 week stability soak post-Phase-3. Keep final Supabase backup + last Supabase-capable image archived.

---

## Risk register

1. **UID continuity (highest)** — Identity Platform import MUST reuse Supabase UUIDs (`org_members.user_id`/`user_profiles` FKs). Verify a sample user → correct org before broad cutover.
2. **Schema-name mismatch** — rename `pgTable` → `hak_*` in `shared/schema.ts` before storage rewrite (Phase 2 blocker).
3. **esbuild externals in Docker** — runtime image MUST have prod `node_modules` (`npm ci --omit=dev`).
4. **SSE on Cloud Run** — timeout 3600s, min-instances ≥1, `X-Accel-Buffering: no`, modest concurrency, no buffering middleware.
5. **JWT format change** — Supabase `sub` → Firebase `uid`; audit all claim reads.
6. **Uploads on ephemeral fs** — exec images → GCS; migrate or accept broken legacy `/uploads/...` URLs.
7. **Data freshness at cutover** — `pg_dump` snapshot loses interim writes; write-freeze/final sync for prod.
8. **Vertex auth swap** — `GOOGLE_VERTEX_KEY_JSON` → runtime-SA ADC; validate before removing key secret.

## Critical files

- `shared/schema.ts` — rename pgTable → `hak_*`; add `company_enrichment` def.
- `server/storage/DatabaseStorage.ts` — rewrite 92 methods / 46 `supabase.from` → Drizzle.
- `server/auth/middleware.ts` — `supabase.auth.getUser` → Firebase `verifyIdToken`.
- `client/src/lib/supabase.ts` + `auth.tsx` + `authFetch.ts` — Firebase rewrite/shim.
- `script/build.ts` + new `Dockerfile` / `cloudbuild.yaml` — containerize; ensure runtime `node_modules`.
- Secondary: `server/routes/shared/upload.ts`, `server/routes/registrations/executives.ts`, `server/static.ts` (GCS);
  `server/credentials.ts` (ADC); `server/db.ts` (reuse, tune pool `max`).

## Verification (end-to-end, per env)

- `npm run check` (tsc) + `npm run test:unit` (Vitest, incl. `orgScoping.test.ts`) green.
- `npm run build` → Docker build → Cloud Run deploy; `/api/health` 200.
- Manual smoke: login (Google/Azure/email-pw) → org loads → company/executive CRUD → exec image upload renders (GCS) →
  SSE search stream `/api/search/enhanced-stream` runs >60s → enrichment writes `company_enrichment` → cross-org id 404.
- Playwright E2E suite green on staging, then prod, after each phase cutover.
