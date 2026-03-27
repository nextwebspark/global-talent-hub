-- Fully idempotent migration: creates tables on fresh DBs (CREATE TABLE IF NOT EXISTS),
-- and safely adds new columns/constraints to existing DBs (ALTER TABLE ... IF NOT EXISTS).

-- users table (prerequisite for search_sessions FK)
CREATE TABLE IF NOT EXISTS "users" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" text NOT NULL,
  "password" text NOT NULL,
  CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint

-- search_queries table (prerequisite for companies and search_sessions FKs)
CREATE TABLE IF NOT EXISTS "search_queries" (
  "id" serial PRIMARY KEY NOT NULL,
  "unique_key" text NOT NULL,
  "query" text NOT NULL,
  "parsed_criteria" text,
  "result_count" integer DEFAULT 0,
  "clockwork_project_id" text,
  "satellite_hierarchies" jsonb DEFAULT '{}'::jsonb,
  "satellite_orders" jsonb DEFAULT '{}'::jsonb,
  "table_config" jsonb,
  "map_positions" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "search_queries_unique_key_unique" UNIQUE("unique_key")
);
--> statement-breakpoint

-- search_sessions table (full definition for fresh DBs)
CREATE TABLE IF NOT EXISTS "search_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "raw_query" text NOT NULL,
  "pd_content" text,
  "pd_confidential" boolean DEFAULT false,
  "inferred_intent" jsonb,
  "status" text DEFAULT 'pending' NOT NULL,
  "search_query_id" integer,
  "refinement_history" jsonb DEFAULT '[]'::jsonb,
  "user_id" varchar,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

-- companies table (full definition for fresh DBs — includes search_session_id)
CREATE TABLE IF NOT EXISTS "companies" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "sector" text,
  "sector_category" text,
  "business_type" text,
  "ownership_type" text,
  "entity_type" text,
  "is_operating_company" boolean DEFAULT true,
  "region" text,
  "country" text,
  "street_address" text,
  "latitude" numeric(10, 7),
  "longitude" numeric(10, 7),
  "location_precision" text DEFAULT 'unknown',
  "revenue" numeric(15, 2),
  "revenue_source" text,
  "revenue_source_url" text,
  "revenue_confidence" integer,
  "revenue_currency" text,
  "revenue_fiscal_year" integer,
  "revenue_converted_from_currency" text,
  "revenue_fx_rate" numeric(10, 6),
  "revenue_fx_policy" text,
  "revenue_last_updated" timestamp,
  "employees" integer,
  "employees_source" text,
  "employees_source_url" text,
  "employees_confidence" integer,
  "employees_last_updated" timestamp,
  "geographic_footprint" integer,
  "customer_model" text,
  "core_activity" text,
  "operating_model" text,
  "revenue_drivers" text,
  "summary" text,
  "website" text,
  "last_verified_year" integer,
  "confidence" integer DEFAULT 5,
  "relevance_reason" text,
  "status" text DEFAULT 'Active',
  "color" text DEFAULT '#1e3a8a',
  "manually_edited_fields" text[] DEFAULT '{}'::text[],
  "data_provenance" jsonb DEFAULT '{}'::jsonb,
  "search_query_id" integer,
  "relevance_type" text,
  "relevance_rationale" text,
  "confidence_score" integer,
  "sub_sector" text,
  "company_size" text,
  "revenue_range" text,
  "is_user_accepted" boolean DEFAULT false,
  "is_user_rejected" boolean DEFAULT false,
  "geography" text,
  "search_session_id" text,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint

-- For existing DBs: add pd_content column to search_sessions if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='search_sessions' AND column_name='pd_content'
  ) THEN
    ALTER TABLE "search_sessions" ADD COLUMN "pd_content" text;
  END IF;
END $$;
--> statement-breakpoint

-- For existing DBs: add pd_confidential column to search_sessions if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='search_sessions' AND column_name='pd_confidential'
  ) THEN
    ALTER TABLE "search_sessions" ADD COLUMN "pd_confidential" boolean DEFAULT false;
  END IF;
END $$;
--> statement-breakpoint

-- For existing DBs: add all new companies columns if missing

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='relevance_type') THEN
    ALTER TABLE "companies" ADD COLUMN "relevance_type" text;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='relevance_rationale') THEN
    ALTER TABLE "companies" ADD COLUMN "relevance_rationale" text;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='confidence_score') THEN
    ALTER TABLE "companies" ADD COLUMN "confidence_score" integer;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='sub_sector') THEN
    ALTER TABLE "companies" ADD COLUMN "sub_sector" text;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='company_size') THEN
    ALTER TABLE "companies" ADD COLUMN "company_size" text;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='revenue_range') THEN
    ALTER TABLE "companies" ADD COLUMN "revenue_range" text;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='is_user_accepted') THEN
    ALTER TABLE "companies" ADD COLUMN "is_user_accepted" boolean DEFAULT false;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='is_user_rejected') THEN
    ALTER TABLE "companies" ADD COLUMN "is_user_rejected" boolean DEFAULT false;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='geography') THEN
    ALTER TABLE "companies" ADD COLUMN "geography" text;
  END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='search_session_id') THEN
    ALTER TABLE "companies" ADD COLUMN "search_session_id" text;
  END IF;
END $$;
--> statement-breakpoint

-- FK: companies.search_session_id -> search_sessions.id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='companies_search_session_id_search_sessions_id_fk'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_search_session_id_search_sessions_id_fk"
      FOREIGN KEY ("search_session_id")
      REFERENCES "search_sessions"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

-- FK: search_sessions.search_query_id -> search_queries.id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='search_sessions_search_query_id_search_queries_id_fk'
  ) THEN
    ALTER TABLE "search_sessions"
      ADD CONSTRAINT "search_sessions_search_query_id_search_queries_id_fk"
      FOREIGN KEY ("search_query_id")
      REFERENCES "search_queries"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

-- FK: search_sessions.user_id -> users.id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='search_sessions_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "search_sessions"
      ADD CONSTRAINT "search_sessions_user_id_users_id_fk"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

-- FK: companies.search_query_id -> search_queries.id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='companies_search_query_id_search_queries_id_fk'
  ) THEN
    ALTER TABLE "companies"
      ADD CONSTRAINT "companies_search_query_id_search_queries_id_fk"
      FOREIGN KEY ("search_query_id")
      REFERENCES "search_queries"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
