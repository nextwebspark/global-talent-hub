# STEP-04 — Write CRUD + inference + fallback

**Goal:** POST/PATCH/DELETE for companies, executives, and child records behave identically, including coordinate fallback, sector inference, and the non-destructive upsert.

## Reference
- `server/routes/registrations/companies.ts` (POST: coordinate fallback → Zod → sector inference → create; PATCH; DELETE; `infer-sectors`).
- `executives.ts` (POST, PATCH, DELETE).
- `career.ts` / `education.ts` / `remuneration.ts` (POST + PATCH/DELETE on `/:id`).
- `notes.ts` (PUT company/executive notes).
- Services: `server/services/coordinateFallback.ts`, `server/services/sectorInference.ts` (`normalizeOrInferSector`).
- Merge: `upsertCompanyNonDestructive` (already ported in STEP-02).

## Build
- Port `coordinateFallback.ts` → `lib/services/coordinate-fallback.ts` (pure; country/city centroids).
- Port `sectorInference.ts` → `lib/services/sector-inference.ts` (uses LLM client — inject it; mock in tests).
- Route handlers:
  - `companies/route.ts` POST: `applyCoordinateFallback` → `insertCompanySchema.parse(body)` → `normalizeOrInferSector` → `createCompanyManual`. Same 201 + body.
  - `companies/[id]/route.ts` PATCH/DELETE; `companies/infer-sectors/route.ts` POST.
  - `executives/route.ts` POST; `executives/[id]/route.ts` PATCH/DELETE.
  - `career-history/[id]`, `education/[id]`, `remuneration/[id]` PATCH/DELETE; `executives/[id]/career-history` etc. POST.
  - `companies/[id]/notes` + `executives/[id]/notes` PUT.
- Validation errors → 400 with the same body shape as the old handler (Zod error → message).

## Test
- Unit: coordinate fallback (known city/country → expected lat/long + precision); sector inference with mocked LLM.
- Integration: POST→GET round-trips; PATCH respects `manuallyEditedFields`; DELETE cascades; parity diff vs Express for each.

## Done when
Write-endpoint parity empty; merge/fallback/inference unit tests green. **Rollback:** route these paths back to Express.
