# STEP-15 — Right panel (split the 1,345-LOC monolith)

**Goal:** The company/executive detail panel reproduces all inline-editable sections — career, education, remuneration, custom fields, notes — saving via the same PATCH/PUT endpoints, as small per-section components.

## Reference
- `client/src/components/panels/RightPanel.tsx` (1,345).
- Endpoints: `GET /api/executives/:id/details`, career/education/remuneration POST + `/:id` PATCH/DELETE, notes PUT, `PATCH /api/executives/:id`, `PATCH /api/companies/:id`, `:id/extract-profile`, `:id/remuneration/parse`, `:id/image`.
- Behavior spec: `01-functionality-spec.md`.

## Build (`components/right-panel/`)
- `right-panel.tsx` — shell + section orchestration (≤300 LOC), `'use client'`.
- `sections/` — `company-details`, `executive-details`, `career-section`, `education-section`, `remuneration-section`, `custom-fields-section`, `notes-section`. Each owns its accordion + inline edit + its mutation.
- Reuse TanStack Query mutations from `lib/api-client.ts`. Same validation + optimistic/refetch behavior.

## Test
- Unit (RTL): each section — edit a field → correct mutation fires with correct payload; add/delete career/education/remuneration rows; notes save; remuneration "parse" populates fields (mocked LLM); image upload.
- Playwright: open panel for a seeded exec; edit across sections; assert persistence (reopen shows saved values). Screenshot-diff each section vs old SPA.

## Done when
Panel behavior + screenshots match; sections all ≤~300 LOC. **Rollback:** RightPanel slot placeholder / old SPA.
