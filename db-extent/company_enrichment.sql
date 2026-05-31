create table public.company_enrichment (
  id bigserial not null,
  company_pk bigint not null,
  company_id text not null,
  primary_sector text not null,
  sector_tags text[] not null default '{}'::text[],
  adjacent_sectors text[] not null default '{}'::text[],
  tagline text null,
  business_description text null,
  employee_band text null,
  employee_count_estimate integer null,
  revenue_band text null,
  revenue_estimate_usd bigint null,
  is_listed boolean null,
  hq_city text null,
  confidence numeric(3, 2) not null,
  sources jsonb not null default '[]'::jsonb,
  model text not null,
  prompt_version text not null,
  enriched_at timestamp with time zone not null default now(),
  raw_response jsonb null,
  website text null,
  phone text null,
  email text null,
  address text null,
  sector_mix jsonb not null default '[]'::jsonb,
  sub_tags text[] not null default '{}'::text[],
  proposed_tags text[] not null default '{}'::text[],
  keywords text[] not null default '{}'::text[],
  constraint company_enrichment_pkey primary key (id),
  constraint company_enrichment_company_id_prompt_version_key unique (company_id, prompt_version),
  constraint company_enrichment_company_pk_fkey foreign KEY (company_pk) references companies (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists company_enrichment_company_pk_idx on public.company_enrichment using btree (company_pk) TABLESPACE pg_default;

create index IF not exists company_enrichment_company_id_idx on public.company_enrichment using btree (company_id) TABLESPACE pg_default;

create index IF not exists company_enrichment_primary_sector_idx on public.company_enrichment using btree (primary_sector) TABLESPACE pg_default;

create index IF not exists company_enrichment_sector_tags_gin on public.company_enrichment using gin (sector_tags) TABLESPACE pg_default;

create index IF not exists company_enrichment_adjacent_sectors_gin on public.company_enrichment using gin (adjacent_sectors) TABLESPACE pg_default;

create index IF not exists company_enrichment_sub_tags_gin on public.company_enrichment using gin (sub_tags) TABLESPACE pg_default;

create index IF not exists company_enrichment_sector_mix_gin on public.company_enrichment using gin (sector_mix jsonb_path_ops) TABLESPACE pg_default;