-- Settings: user profiles, login activity log, extra org/member columns.
-- Idempotent: safe to run multiple times. Run against the Supabase Postgres DB.

-- Per-user profile (identity stays in auth.users; this holds editable fields + prefs).
CREATE TABLE IF NOT EXISTS public.hak_user_profiles (
  user_id     uuid PRIMARY KEY,
  full_name   text,
  job_title   text,
  phone       text,
  avatar_url  text,
  timezone    text,
  language    text,
  preferences jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Login activity log — one row per sign-in.
CREATE TABLE IF NOT EXISTS public.hak_login_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  org_id      uuid,
  at          timestamptz NOT NULL DEFAULT now(),
  ip          text,
  user_agent  text
);

CREATE INDEX IF NOT EXISTS hak_login_events_user_at_idx ON public.hak_login_events (user_id, at DESC);

-- Last-login convenience column on membership.
ALTER TABLE public.hak_org_members
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Org general-settings columns.
ALTER TABLE public.hak_organizations
  ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE public.hak_organizations
  ADD COLUMN IF NOT EXISTS default_role text NOT NULL DEFAULT 'member';
ALTER TABLE public.hak_organizations
  ADD COLUMN IF NOT EXISTS require_2fa boolean NOT NULL DEFAULT false;
