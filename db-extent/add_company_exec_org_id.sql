-- Denormalize org_id onto companies + executives to close the multi-tenant IDOR.
-- Companies/executives were reachable cross-org by integer id; this adds the
-- tenant boundary column that every storage query now filters on.
-- Identity lives in Supabase auth.users; org_id is an hak_organizations id.
-- Idempotent: safe to run multiple times. Run against the Supabase Postgres DB
-- used by the app (tables are hak-prefixed at runtime).

ALTER TABLE public.hak_companies  ADD COLUMN IF NOT EXISTS org_id uuid;
ALTER TABLE public.hak_executives ADD COLUMN IF NOT EXISTS org_id uuid;

-- Backfill companies from their search query's org.
UPDATE public.hak_companies c
SET org_id = sq.org_id
FROM public.hak_search_queries sq
WHERE c.search_query_id = sq.id AND c.org_id IS NULL;

-- Backfill executives from their (now-stamped) company.
UPDATE public.hak_executives e
SET org_id = c.org_id
FROM public.hak_companies c
WHERE e.company_id = c.id AND e.org_id IS NULL;

-- Orphans stay org_id = NULL: companies with search_query_id NULL (added with no
-- active project) or whose query has a null org. A NULL org_id never matches
-- .eq("org_id", <uuid>), so these rows are invisible to every org — the safe
-- default (same posture add_auth_orgs.sql chose for legacy search queries).
-- No NOT NULL constraint yet; assign legacy orphans manually if needed.

CREATE INDEX IF NOT EXISTS hak_companies_org_id_idx  ON public.hak_companies (org_id);
CREATE INDEX IF NOT EXISTS hak_executives_org_id_idx ON public.hak_executives (org_id);
