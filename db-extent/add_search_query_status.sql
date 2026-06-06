-- Add project status (draft | active) + selectedCount to the live search-queries table.
-- Idempotent: safe to run multiple times. New rows default to 'draft'; a project
-- becomes 'active' when the user locks the universe (POST /api/search/add-to-project).
-- Run against the Supabase Postgres DB used by the app (table is hak-prefixed at runtime).

ALTER TABLE public.hak_search_queries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

ALTER TABLE public.hak_search_queries
  ADD COLUMN IF NOT EXISTS selected_count integer DEFAULT 0;
