# 04 — Test Strategy

One runner family, already present in the repo: **Vitest** (unit + integration) and **Playwright** (E2E). `@testing-library/react` + `jsdom` are already deps. No new test frameworks.

## Layers

### Unit (Vitest) — `tests/unit/`
Pure logic, no network/DB:
- Repository query builders (mock Drizzle or use an in-memory/sqlite shim where practical).
- Services: sector inference, coordinate fallback, remuneration parser, Clockwork fuzzy matching (`findBestMatch`/`classifyMatch`), post-LLM validators.
- The provenance/confidence merge rules (`upsertCompanyNonDestructive`, `enrichExecutiveEmptyFields`) — table-driven cases: locked field, empty fill, higher-confidence overwrite, lower-confidence keep, clockwork dedupe.
- Zustand store slices, formatters, hooks (with RTL).

### Integration (Vitest) — `tests/integration/`
Hit the Next route handlers against a **throwaway Postgres** (docker or testcontainers), seeded to a known state:
- Invoke the handler (import the `GET`/`POST` function or run against `next start` on a test port).
- Assert status + JSON shape matches the contract in `02-api-contract.md`.
- **Parity diff:** for any endpoint not yet cut over, run the same request against the old Express app on the same seed and assert deep-equal JSON (document accepted diffs).

### E2E (Playwright) — `tests/e2e/`
Per screen, reuse the existing seed hooks (`window.__E2E_SEED__`, `window.__zustandStore` — preserve them in the new app):
- Drive the real UI (search → universe → accept → dashboard → table/map/right-panel/charts).
- **Behavior parity:** run the same script against old SPA and new app; assert same observable outcomes.
- **Look/feel parity:** `toHaveScreenshot()` diffs per screen. Establish baselines from the old SPA first.

### LLM steps — golden fixtures — `tests/fixtures/`
- Record real request→response pairs for LLM calls (primarily `extractEnrichmentFilter`, model `gemini-2.5-flash`, temp 0) from the old app.
- The LLM client (`lib/llm/`) is injected/mocked in tests to replay fixtures → deterministic, offline, no API cost.
- One optional **nightly** live smoke test hits the real model to catch drift; never gates a step.

## Per-step gate (every STEP file repeats this)

A step is **done** only when all hold:
1. `npm run test:unit` green for the slice.
2. `npm run test` (Playwright) green for any UI in the slice; screenshots match.
3. Integration/parity diff vs the old app is **empty**, or every diff is listed and explicitly accepted in the step's notes.
4. Rollback noted (what to revert / which route to point back at the old app).

## Commands (mirror existing `package.json`)
```
npm run test:unit         # vitest run  (unit + integration)
npm run test:unit:watch   # vitest
npm run test              # playwright test (e2e)
npm run test:ui           # playwright --ui
npm run check             # tsc typecheck
```

## How the user verifies a step
After the agent finishes a step:
1. `npm run check && npm run test:unit` → all green.
2. For UI steps: `npm run test` → screenshots/behavior match.
3. Optional manual parity: run old app and new app pointed at the **same DB**, open the same screen / call the same endpoint, compare. Move to the next step only when satisfied.
