create table public.company_seed_list (
  id bigserial not null,
  name text not null,
  slug text not null,
  country text not null,
  sector text not null,
  website text null,
  description text null,
  source_url text not null,
  source_title text null,
  source_query text null,
  harvest_version text not null default 'v1'::text,
  captured_at timestamp with time zone not null default now(),
  raw_context jsonb not null default '{}'::jsonb,
  constraint company_seed_list_pkey primary key (id),
  constraint company_seed_list_slug_country_sector_harvest_version_key unique (slug, country, sector, harvest_version),
  constraint company_seed_list_country_check check (
    (
      country = any (
        array[
          'United Arab Emirates'::text,
          'Saudi Arabia'::text,
          'Qatar'::text,
          'Kuwait'::text,
          'Bahrain'::text,
          'Oman'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists company_seed_list_country_sector_idx on public.company_seed_list using btree (country, sector) TABLESPACE pg_default;

create index IF not exists company_seed_list_slug_idx on public.company_seed_list using btree (slug) TABLESPACE pg_default;

create index IF not exists company_seed_list_sector_idx on public.company_seed_list using btree (sector) TABLESPACE pg_default;