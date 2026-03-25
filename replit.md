# Global Talent Map

## Overview
Global Talent Map is an AI-driven market research web application designed for executive search firms. It allows users to input natural-language queries to identify and rank companies by revenue, visualizing results as interactive bubbles on a global map. The application enables users to discover executive details, and each search generates a persistent project where all edits and results are preserved. The primary goal is to provide a comprehensive and validated talent mapping solution for executive recruitment.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architectural Principle
The system operates on the principle: "THE LLM PROPOSES. THE APPLICATION DECIDES. THE UI ONLY SHOWS VALIDATED TRUTH." This means all LLM outputs undergo strict validation and potential modification by the application before being presented to the user.

### Source of Truth Hierarchy
The system follows a strict source-of-truth hierarchy for data:
1. **Manual edits are sacred** — fields in `manuallyEditedFields` are never overwritten by pipeline runs
2. **Confidence wins** — pipeline data only overwrites existing values when its confidence score is strictly higher
3. **Null fields always get filled** — any null/empty field accepts new pipeline data
4. **Executives are additive only** — pipeline never deletes executives, only adds new ones (matched by name + company)
5. **Every merge decision is logged** — the `pipeline_log` table records every update/kept/skipped decision with reasoning
6. **Full provenance tracking** — `data_provenance` JSONB on companies tracks the history of every field's source

### Confidence Score Semantics
Field-level confidence scores (0.0–1.0 scale from LLM, mapped to 0-10 for storage):
- **0.95 (→10)**: Official company documents, annual reports, regulatory filings
- **0.85 (→9)**: Industry curated lists or trade publications
- **0.70 (→7)**: Reputable news (Reuters, Bloomberg, Arabian Business)
- **0.60 (→6)**: Business directories or aggregators
- **0.40 (→4)**: Blogs or unverified sources
Missing confidence is treated as "unknown" (confidence = 3). Only `confidence >= 6` influences visual scaling.

### Core Data Principles & Non-Drop Rule
All search results, companies, and executives are persistently stored in a PostgreSQL database. Data modifications immediately update the database, ensuring that reloading a previous search restores the most recent information, including manual edits. The system prioritizes audited reports for data sourcing, especially for revenue figures, which require specific fields (value, currency, financial year, source, confidence). A critical "Non-Drop Rule" dictates that a company record is never omitted due to missing or low-confidence fields; data uncertainty applies only at the field level, and schema parsing failures for one field do not affect others.

### Frontend Architecture
The frontend is built with React 18 and TypeScript, utilizing Wouter for routing, Zustand for global state, and TanStack React Query for data fetching. UI components are sourced from shadcn/ui (Radix UI) and styled with Tailwind CSS v4. Interactive maps are rendered using Mapbox GL JS with globe projection (3D sphere view when zoomed out), and Vite serves as the build tool. The Mapbox access token is served via `/api/config` endpoint (stored in MAPBOX_ACCESS_TOKEN env secret). Dark/light styles auto-switch with the theme. Company bubbles are DOM markers with drag-to-reposition. Executive satellites use portal-based rendering anchored to Mapbox markers.

### Backend Architecture
The backend is a Node.js Express.js application written in TypeScript, providing a RESTful JSON API. Search supports two modes: **Quick Build** (default, LLM-direct via OpenRouter — single AI call generating companies + executives in ~5-10s) and **In-Depth Search** (Serper web search pipeline with multi-step extraction ~60s). The mode flag flows from the Landing page toggle → `useSearch`/`streamingSearch` → POST/GET `/api/search` routes → `runDiscoveryPipeline(query, limit, searchQueryId, mode)`. Quick Build is implemented in `server/services/pipeline/quickBuildSearch.ts`. Enrichment also uses Serper for targeted data lookups. Session management uses Express sessions with a PostgreSQL store.

### Data Storage
PostgreSQL is the primary database, managed with Drizzle ORM and drizzle-zod for schema validation. Key tables include `users`, `companies`, `executives`, `searchQueries`, `conversations`, `messages`, and `pipeline_log`.

### Satellite Hierarchy Persistence
Executive satellite parent-child hierarchies (created by drag-and-drop on the map) are stored in the `satellite_hierarchies` JSONB column on `search_queries`. The structure is `{companyId: {childExecId: parentExecId}}`. Changes are auto-saved to the backend with a 1-second debounce (via a Zustand subscription in Dashboard.tsx). Hierarchies are restored when loading a previous search via `loadFromAPI(results, data.satelliteHierarchies)`. The `loadFromAPI` function preserves existing hierarchies when called without the second argument (e.g., during data refreshes).

### Layered Architecture
The backend employs a strict layered architecture:
- **Serper Search Layer**: 2 parallel heuristic queries (curated lists + official sources) with URL scoring (Score 2: list articles & official company domains, Score 1: news & directories, Score 0: social/job sites — filtered out). Up to 8 pages fetched for full content extraction. Tavily adapter removed — Serper is the only search provider.
- **Discovery Pipeline**: 2-query parallel Serper search → URL scoring → parallel page fetching + list article pre-processing → LLM extraction with field-level confidence → batched intent validation (single LLM call for all companies) → persistence to DB → parallel executive extraction (batches of 4).
- **Enrichment Pipeline**: Targeted Serper searches for revenue, employees, and executives with LLM extraction from search results.
- **Enrichment Layer**: Integrates with Clockwork API for fuzzy matching and data enrichment, populating empty fields without overwriting existing data.
- **Persistence Layer**: Enforces write restrictions, confidence-based merging, manual edit protection, and audit logging. Single source of truth.
- **UI/Manual Layer**: Allows direct user creation and editing of records. Manual edits are tracked in `manuallyEditedFields` and are never overwritten by pipeline runs.
- **Routes Layer**: A thin orchestration layer.

### AI Research Engine
Server-side search uses Serper API for web discovery with a 3-pass search strategy:
- **Pass 1 (Curated lists)**: Adds "top list 2024 2025" framing for list articles
- **Pass 2 (Official sources)**: Adds "annual report official site revenue" framing
- **Pass 3 (News/trade press)**: Adds regional news outlet names (Arabian Business, Zawya, Reuters)
- **LLM-optimised queries**: Additional queries generated by the LLM based on query intent

Heuristic extraction (regex/pattern matching) runs first on search snippets. **Claude Opus 4.5** (`anthropic/claude-opus-4.5`) via OpenRouter is the primary LLM, tried first for all AI operations (intent extraction, query optimisation, article processing, enrichment, company validation). Gemini 2.5 Flash is the first fallback, followed by free OpenRouter models (Llama 3.3, Qwen3, Gemma 3, Mistral, Hermes 405B). The LLM uses a source-of-truth extraction prompt with per-field confidence scores and source URLs. Heuristic-only extraction is the final fallback — search always returns results even when all LLMs are unavailable. Executive extraction requires LLM and is skipped when unavailable. The landing page provides a simple search box without LLM model selection.

### Multi-Pass Enrichment Pipeline
An enrichment pipeline fills missing data post-discovery, including targeted searches for revenue, employees, and specific executives. Field-level source and confidence tracking are maintained.

### Remuneration System
The system supports executive remuneration data across four categories. An AI-powered parser extracts structured data from free-text remuneration notes, and currency conversion normalizes values to USD for dashboard analytics. A "latest-only" rule ensures only the most recent remuneration record per executive is stored, preventing stale data.

### Dashboard Analytics Layer
The Dashboard provides a professional Talent Mapping Report with:
- An Executive Summary Banner.
- Mapping Completion progress.
- Executive Universe analysis (level, geography, talent concentration).
- Revenue Distribution by bands, with sector and ownership breakdowns.
- Status & Interest analytics (Interested, Not Interested, Out of Scope, Off-Limits). Out of Scope and Off-Limits executives are visually greyed out across the map bubbles, satellite pills, CompanyList, and DataTable. Dashboard shows Out of Scope / Off-Limits counts and percentages.
- Comprehensive Compensation Analytics (median/min/max, level-to-level step-up, median compensation by revenue band & region).
- **Diversity & Inclusion Analytics**: Gender distribution (donut chart with percentages), gender by seniority level (stacked bars), ethnicity distribution (horizontal bars with diversity index), ethnicity by seniority level (stacked bars). Gender and ethnicity are stored as persistent fields on executives (`gender`, `genderConfidence`, `ethnicity`, `ethnicityConfidence` columns). Values are auto-inferred by the LLM on every executive creation path (manual add, bulk import, discovery, enrichment, project import) using `server/services/pipeline/diversityInference.ts`. Inference runs in background (fire-and-forget), only persists high-confidence values (8+/10), and respects manual edits via `manuallyEditedFields`. "Enrich All" also backfills missing diversity data. Gender and ethnicity columns are visible in the Table View and editable in the Right Panel. Data is exported with Excel exports.
All analytics are computed server-side.

## External Dependencies

### AI Services
- **OpenRouter**: Claude Opus 4.5 (primary), Gemini 2.5 Flash (fallback), free models (Llama 3.3, Qwen3, Gemma 3, Mistral, Hermes 405B) as further fallbacks.
- **Serper API**: Google search API for company discovery and enrichment searches. Primary data source — heuristic extraction from search results works without any LLM.

### Database
- **PostgreSQL**: Main relational database.
- **connect-pg-simple**: PostgreSQL session store.

### Third-Party Libraries
- **Leaflet**: Interactive map rendering.
- **Framer Motion**: Page animations.
- **Sonner**: Toast notifications.
- **date-fns**: Date formatting.

### Development Tools
- **Vite**: Development server and build tool.
- **Replit Vite Plugins**: Replit integration.
- **drizzle-kit**: Database migrations.
