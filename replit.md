# Global Talent Map

## Overview
Global Talent Map is an AI-driven market research web application designed for executive search firms. It enables users to input natural-language queries (e.g., "Top 10 luxury watch distributors globally") to identify and rank companies by revenue. The application visualizes these companies as interactive bubbles on a global map, with the ability to reveal executive details upon selection. Each search generates a persistent project, allowing users to reopen and continue working on previous results with all edits preserved.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architectural Principle
The system strictly adheres to the principle: "THE LLM PROPOSES. THE APPLICATION DECIDES. THE UI ONLY SHOWS VALIDATED TRUTH." This means LLM outputs are treated as proposals, which the application validates and potentially modifies before displaying to the user.

### Confidence Score Semantics
Confidence scores follow strict semantic rules (DO NOT CONFLATE THESE CASES):

**CASE 1: MISSING CONFIDENCE (undefined, null, or not provided)**
- Meaning: "Unknown confidence due to missing justification"
- Value: Assign `confidence = 3`
- Action: Mark as degraded, allow entity to proceed
- Influence: ZERO influence on ranking and visuals (treated as neutral)
- This is NOT explicit unreliability - just unknown

**CASE 2: EXPLICIT LOW CONFIDENCE (LLM returned 0 or 1)**
- Meaning: "Explicitly unreliable as signaled by the model"
- Value: PRESERVE the returned value (do not upgrade)
- Action: Allow entity to exist, strip high-risk metrics
- Influence: ZERO influence on ranking and visuals
- This IS explicit unreliability - the model signals distrust

**CRITICAL RULES:**
- Missing confidence must NEVER be treated as explicit unreliability
- Explicit unreliability must NEVER be auto-upgraded
- Confidence affects influence only, NEVER existence
- No confidence value should ever cause wholesale blocking by itself
- Visual scaling requires `confidence >= 6` to have any influence
- Ranking includes ALL valid entities; confidence affects ORDER not INCLUSION

### Core Data Principles
All search results, companies, and executives are persistently stored in a PostgreSQL database with unique IDs and proper relational links. Data modifications immediately update the database. Reloading a previous search restores the most recent data including manual edits. Users can add, edit, and delete companies and executives, with all changes persisting. Data sourcing prioritizes audited reports and official statements, particularly for revenue data, which is strictly defined and validated. Revenue figures must explicitly state "revenue" and include value, currency, financial year, source, and confidence level. Conflicts are resolved by source priority (higher tier wins) or recency.

### Frontend Architecture
The frontend is built with React 18 and TypeScript, using Wouter for routing and Zustand for global state management. Data fetching is handled by TanStack React Query. UI components are from shadcn/ui (based on Radix UI), styled with Tailwind CSS v4. Interactive maps are rendered using Leaflet with React-Leaflet. Vite is used as the build tool.

### Backend Architecture
The backend uses Node.js with Express.js, written in TypeScript. It provides a RESTful JSON API. AI integration is managed via OpenAI API and OpenRouter. Session management utilizes Express sessions with a PostgreSQL session store.

### Data Storage
PostgreSQL is the primary database, with Drizzle ORM and drizzle-zod for schema validation. Key tables include `users`, `companies`, `executives`, `searchQueries`, `conversations`, and `messages`. `companies` store details like geo-coordinates, revenue, and `relevanceReason` (LLM's justification). `executives` are linked to companies.

### Project Structure
The project is divided into `client/` (React frontend), `server/` (Express backend), `shared/` (common code like schema definitions), and `migrations/` (Drizzle migrations).

### Layered Architecture
The backend employs a strict layered architecture:
- **Web Search Layer** (`server/services/webSearch.ts`): Retrieval-first architecture using Google Custom Search API. All searches start with web retrieval to find actual sources. Classifies sources into tiers: Tier 1 (regulatory filings, annual reports), Tier 2 (reputable business news), Tier 3 (general web - name discovery only). Stores all search results in `searchResults` table for audit trail.
- **Retrieval Discovery Layer** (`server/services/retrievalDiscovery.ts`): Hybrid architecture that retrieves sources first, then uses LLM only for extraction from retrieved content. LLM cannot invent company lists, revenues, or metrics from model memory. Includes per-company verification retrieval step and LLM retry/fallback logic without relaxing validation rules.
- **Discovery Layer** (`server/services/discovery.ts`): Legacy LLM-only fallback when web search is not configured. Processes natural language queries via OpenRouter and creates new company/executive records with self-verification (e.g., `relevanceReason`).
- **Enrichment Layer** (`server/services/enrichment.ts`): Integrates with Clockwork API for fuzzy matching and data enrichment. It runs on user trigger, is read-only, and only enriches empty fields without overwriting existing data. It orchestrates deterministic matching, handles Clockwork API specifics (pagination, rate limiting, position fetching), and can use AI to research company details for newly imported candidates.
- **Persistence Layer** (`server/storage.ts`): Serves as the single source of truth, enforcing write restrictions based on the calling layer (discovery, enrichment, manual).
- **UI/Manual Layer**: Allows users to create and edit records directly, with full create/update capabilities that override imported data.
- **Routes Layer** (`server/routes.ts`): A thin orchestration layer delegating to services without containing business logic.

### Source Tier Classification
- **Tier 1**: SEC filings, investor relations pages, annual reports, stock exchange filings (DFM, ADX, Tadawul, etc.) - Full metric extraction allowed
- **Tier 2**: Reuters, Bloomberg, Forbes, WSJ, regional business sources (Zawya, Gulf Business) - Full metric extraction with confidence reduction
- **Tier 3**: General web pages - Name discovery only, all metrics must be null/Unknown

### Entity Existence Requirements
Required fields for entity existence are limited to:
- **company name** (required)
- **country** (required)
- **primary activity** (sector OR businessType - required)

Rendering fields (coordinates, map zoom, icons) degrade gracefully:
- If lat/long missing → derive from city centroid
- If city unknown → derive from country centroid
- `location_precision` field tracks: `exact`, `city`, `country`, or `unknown`

Coordinate fallback service (`server/services/coordinateFallback.ts`) provides city/country centroids for major global cities and countries.

### AI Research Engine
Server-side AI processing (OpenAI, OpenRouter) parses natural language queries to extract industry, geography, and roles. Results are ranked by revenue, then employees. The LLM is instructed to find precise HQ locations and street addresses for accurate map placement. Executive filtering by role is supported, with 'all' being the default if no specific role is requested. Revenue, employees, and executives are always displayed.

### Audio/Voice Integration
Replit AI Integrations provide voice chat, speech-to-text, and text-to-speech functionalities, using AudioWorklet-based streaming and WebM/Opus recording.

## External Dependencies

### AI Services
- **OpenAI API**: For primary AI model access.
- **OpenRouter**: For multi-model LLM support.

### Database
- **PostgreSQL**: Main database.
- **connect-pg-simple**: For PostgreSQL session storage.

### Third-Party Libraries
- **Leaflet**: For interactive map rendering.
- **Framer Motion**: For page animations.
- **Sonner**: For toast notifications.
- **date-fns**: For date formatting.

### Development Tools
- **Vite**: Development server.
- **Replit Vite Plugins**: Specific plugins for Replit integration.
- **drizzle-kit**: For database migrations.