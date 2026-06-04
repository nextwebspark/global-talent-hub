# STEP-01 — Shared layer (schema, taxonomy, DB client)

**Goal:** Drizzle schema + taxonomy + DB client live in the new app and connect to the same Postgres; a read test returns real rows.

## Reference
- `shared/schema.ts` (14 tables, Zod insert schemas, exported types) — copy verbatim.
- `shared/taxonomy.ts` (SECTORS, ADJACENCY, SUB_TAGS_BY_SECTOR, *_SET, bands, `adjacentSectorsFor`) — copy verbatim; **values must stay byte-identical** (LLM validation matches exact strings).
- `server/db.ts` (pg Pool + drizzle init, SSL logic).
- `drizzle.config.ts`.

## Build
1. `lib/db/schema.ts` = exact copy of `shared/schema.ts`. Keep all exports.
2. `lib/taxonomy.ts` = exact copy of `shared/taxonomy.ts`.
3. `lib/db/client.ts`: create the `pg` Pool from `DATABASE_URL` (port SSL logic from `server/db.ts`), `export const db = drizzle({ client, schema })`.
4. `drizzle.config.ts` in the new app pointing at `lib/db/schema.ts` and `DATABASE_URL`. Do **not** run `db:push` — the schema already exists; this is only for type generation / future diffs.
5. Update `@shared/*` alias to resolve to `lib/` so copied imports keep working, or rewrite imports to `@/lib/...`.

## Test
- `npm run check` passes (schema + taxonomy typecheck).
- Unit: a taxonomy test asserting `SECTORS.length` and a few exact strings match the old file (guard against drift).
- Integration: a one-off test that runs `db.select().from(companies).limit(1)` against the real DB and returns without error (or rows if present).

## Done when
Typecheck green, taxonomy values verified identical, live DB read succeeds. **Rollback:** none needed (additive).
