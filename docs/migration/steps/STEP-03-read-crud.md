# STEP-03 — Read CRUD route handlers

**Goal:** All GET endpoints for companies/executives/career/education/remuneration/notes/details return JSON identical to the old Express endpoints.

## Reference (modules under server/routes/registrations/)
`companies.ts`, `executives.ts`, `career.ts`, `education.ts`, `remuneration.ts`, `notes.ts`. Endpoint list: `02-api-contract.md`.

## Build (`app/api/.../route.ts`)
- `companies/route.ts` GET → companies each with `executives[]` (preserve the N+1 shape — do **not** silently optimize the response shape; you may batch internally as long as JSON is identical).
- `companies/search/route.ts` GET `?name=`.
- `companies/[id]/route.ts` GET; `companies/[id]/notes/route.ts` GET.
- `companies/[companyId]/executives/route.ts` GET.
- `executives/[id]/details/route.ts`, `.../career-history`, `.../education`, `.../remuneration`, `.../notes` GET.
- Each handler: call the repo, `Response.json(result)`, 404 via `jsonError` when missing.

## Test
- Integration: seed test DB, call each handler, assert status + deep-equal JSON vs the old Express endpoint on the same seed.
- Document any intentional diff (e.g. key ordering) and assert order-insensitive where appropriate.

## Cut over
Point the proxy / frontend `/api/companies*`, `/api/executives/:id/*`, child GETs to the new app once green.

## Done when
Read-endpoint parity diff empty. **Rollback:** route these paths back to Express.
