# STEP-07 — Clockwork CRM enrichment + webhook

**Goal:** Clockwork project/people endpoints, the match orchestration, and confirm/create-from-clockwork behave identically; raw-body webhook verification preserved.

## Reference
- `server/routes/registrations/clockwork.ts` — projects, people, diagnostics, explore.
- `server/routes/registrations/enrichment.ts` — `match`, `confirm`, `create-from-clockwork`, `import-candidate`.
- `server/services/clockworkEnrichment/` — `apiClient.ts` (Base64 auth), `people.ts`, `matching.ts` (`findBestMatch`, `classifyMatch`), `orchestrate.ts` (`orchestrateEnrichmentMatching`, side-effect-free).
- Raw-body: `server/index.ts:16-21` (webhook signature).
- Repo: `enrichExecutiveEmptyFields`, `createExecutiveFromClockwork`, `checkExecutiveClockworkEnrichment` (STEP-02).

## Build
- `lib/services/clockwork/client.ts` — HTTP client + Base64 Bearer from `CLOCKWORK_API_KEY/SECRET`, firm key/slug, base URL (env in `00-target-architecture.md`). Use `fetch`; drop axios if it was only used here.
- `lib/services/clockwork/matching.ts` — port `findBestMatch` / `classifyMatch` (name/title/company scoring). **Keep the scoring identical** — pin with golden tests.
- `lib/services/clockwork/orchestrate.ts` — `orchestrateEnrichmentMatching(searchId, clockworkProjectId)` → `{ confirmed, possible, noMatch }`.
- Handlers: `clockwork/projects`, `clockwork/projects/[projectId]/people`, `clockwork/diagnostics*`, `clockwork/explore/[id]` GET; `enrichment/match` POST (`?searchId=&clockworkProjectId=`), `enrichment/confirm` POST, `enrichment/create-from-clockwork` POST, `enrichment/import-candidate` POST.
- If a Clockwork webhook handler exists, read raw body via `await req.text()` before JSON-parsing; verify HMAC with `crypto` (`hmac.compare_digest` equivalent: `crypto.timingSafeEqual`).

## Test
- Unit (golden): fixed candidate lists → `findBestMatch`/`classifyMatch` produce the exact same ranks/classifications as the old code (record expected from old impl).
- Integration: `match` with mocked Clockwork client + seeded execs → expected buckets; `confirm` fills only empty/higher-confidence fields and dedupes by clockworkId; webhook accepts valid signature, rejects bad.

## Done when
Matching golden tests green; enrichment parity empty; webhook verification proven. **Rollback:** route Clockwork/enrichment paths back to Express.
