-- Auth + organizations: workspace tables + owner tracking on projects.
-- Identity lives in Supabase auth.users; these tables hold org membership.
-- Idempotent: safe to run multiple times. Run against the Supabase Postgres DB
-- used by the app (tables are hak-prefixed at runtime).

-- An organization = a shared workspace. created_by is the auth.users id of the owner.
CREATE TABLE IF NOT EXISTS public.hak_organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  team_size   text,
  region      text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Membership: which user belongs to which org, and their role.
-- role: owner | admin | member | viewer (role enforcement lands next session).
CREATE TABLE IF NOT EXISTS public.hak_org_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.hak_organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  email       text,
  role        text NOT NULL DEFAULT 'member',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS hak_org_members_user_id_idx ON public.hak_org_members (user_id);

-- Projects (search queries) gain org visibility boundary + owner.
-- Nullable for backfill safety: existing rows stay null (invisible to new orgs).
ALTER TABLE public.hak_search_queries
  ADD COLUMN IF NOT EXISTS org_id uuid;

ALTER TABLE public.hak_search_queries
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS hak_search_queries_org_id_idx ON public.hak_search_queries (org_id);
