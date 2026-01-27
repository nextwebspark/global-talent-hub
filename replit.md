# Global Talent Map

## Overview

Global Talent Map is an AI-driven market research web application for executive search firms. Users enter natural-language search queries (e.g., "Top 10 luxury watch distributors globally") and the system uses AI to identify and rank companies by revenue, then visualizes them as interactive bubbles on a global map. Clicking on companies reveals executive details. Each search creates a persistent project that can be reopened with all edits intact.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: Zustand for global app state
- **Data Fetching**: TanStack React Query for server state management
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **Map Visualization**: Leaflet with React-Leaflet for interactive global maps
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript compiled with tsx for development, esbuild for production
- **API Pattern**: RESTful JSON API under `/api/*` routes
- **AI Integration**: OpenAI API (via Replit AI Integrations) and OpenRouter for multi-model support
- **Session Management**: Express sessions with PostgreSQL session store (connect-pg-simple)

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-zod for schema validation
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Key Tables**:
  - `users` - User accounts
  - `companies` - Research results with geo-coordinates, street address, revenue, employees
  - `executives` - Company leadership data linked to companies
  - `searchQueries` - Search history and parsed criteria (supports loading previous results)
  - `conversations` / `messages` - Chat functionality for AI interactions

### Search History Feature
- All searches are persisted in the database with linked companies and executives
- Users can view recent searches from the dropdown in the search bar
- **Load Previous Results**: Click "Load" button to restore a previous search with all companies and executives
- History shows company count for each past search
- Data updates (additions/deletions) are reflected in the stored search results

### Project Structure
```
├── client/           # React frontend
│   ├── src/
│   │   ├── components/  # UI components (shadcn + custom)
│   │   ├── pages/       # Route pages (Landing, Dashboard)
│   │   ├── lib/         # API hooks, store, utilities, orchestration
│   │   └── hooks/       # Custom React hooks
├── server/           # Express backend
│   ├── routes.ts     # API route orchestration (thin layer)
│   ├── storage.ts    # Database access layer (Persistence Layer)
│   ├── db.ts         # Database connection
│   └── services/     # Service layer modules
│       ├── discovery.ts    # Discovery Layer: LLM search logic
│       └── enrichment.ts   # Enrichment Layer: Clockwork integration (placeholder)
├── shared/           # Shared code between client/server
│   └── schema.ts     # Drizzle database schema
└── migrations/       # Database migrations (drizzle-kit)
```

### Layered Architecture (CRITICAL - Maintain Separation)
The backend follows a clean layered architecture with strict ownership rules:

1. **Discovery Layer** (`server/services/discovery.ts`): 
   - All LLM-related search logic (OpenAI/OpenRouter clients, model management, query parsing)
   - Runs ONCE per search, never re-runs unless user explicitly re-searches
   - Contains: parseSearchQuery, discoverCompaniesAndExecutives, fetchAvailableModels
   - **OWNERSHIP**: May CREATE records only, never updates existing executives/companies after creation
   - Uses: `storage.createCompanyFromDiscovery()`, `storage.createExecutiveFromDiscovery()`

2. **Enrichment Layer** (`server/services/enrichment.ts`):
   - Clockwork API integration with fuzzy matching orchestration
   - Runs ONLY when user explicitly triggers enrichment
   - **OWNERSHIP**: May enrich EMPTY fields only, never overwrites existing data, never deletes records
   - Uses: `storage.enrichExecutiveEmptyFields()`, `storage.enrichCompanyEmptyFields()`
   - **Orchestration**: `orchestrateEnrichmentMatching(searchId, clockworkProjectId)` - deterministic, side-effect free matching
   - **Match Classification**: confirmed (>85% name match), possible (60-85%), no_match (<60%)
   - **API Endpoint**: `POST /api/enrichment/match` - returns structured match results without persisting

3. **Persistence Layer** (`server/storage.ts`):
   - Database is single source of truth
   - **ENFORCES** write restrictions per layer via layer-aware methods
   - All edits persist permanently via Drizzle ORM
   - Layer-specific methods: `createFromDiscovery`, `enrichEmptyFields`, `updateManual`

4. **UI/Manual Layer** (via routes.ts POST/PATCH endpoints):
   - User-initiated creates and edits always override imported data
   - No field restrictions - full create/update capability
   - Uses: `storage.createCompanyManual()`, `storage.createExecutiveManual()`, `storage.updateCompanyManual()`, `storage.updateExecutiveManual()`

5. **Routes Layer** (`server/routes.ts`):
   - Thin orchestration layer that coordinates services
   - No business logic - delegates to discovery/enrichment/storage

### AI Research Engine
- Server-side AI processing using OpenAI for natural language parsing
- Multi-model support via OpenRouter (GPT-4, Claude, Gemini, Llama, Mixtral)
- Search string parsing extracts: industry, geography, company count, executive roles
- Results ranked primarily by revenue (USD), secondarily by employee count
- **Precise HQ Location**: LLM is instructed to find exact street address and GPS coordinates of company headquarters
- Street address is stored in database for accurate map placement

### Executive Filtering (CRITICAL - Do Not Change Default Behavior)
- `filterExecutivesByRole()` in `server/routes.ts` filters executives based on search criteria
- **Default roleLevel is 'all'** - when no specific role level is requested, ALL executives are returned
- Only filter executives when explicit role criteria are specified in the search query
- Revenue, employees, and executives must always be displayed in both LeftPanel and RightPanel
- The `transformAPICompany()` and `transformAPIExecutive()` in `client/src/lib/store.ts` handle data transformation
- Never add overly aggressive exclude patterns that filter out valid executive titles

### Audio/Voice Integration
- Replit AI Integrations provide voice chat capabilities
- AudioWorklet-based streaming audio playback
- Speech-to-text and text-to-speech functionality
- WebM/Opus recording with ffmpeg conversion support

## External Dependencies

### AI Services
- **OpenAI API**: Primary AI model access via Replit AI Integrations (`AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`)
- **OpenRouter**: Multi-model routing for alternative LLMs (`OPENROUTER_API_KEY`)

### Database
- **PostgreSQL**: Primary data store (`DATABASE_URL` environment variable required)
- **connect-pg-simple**: Session storage in PostgreSQL

### Third-Party Libraries
- **Leaflet**: Interactive map rendering
- **Framer Motion**: Page animations
- **Sonner**: Toast notifications
- **date-fns**: Date formatting

### Development Tools
- **Vite**: Development server with HMR
- **Replit Vite Plugins**: Cartographer, dev banner, runtime error overlay
- **drizzle-kit**: Database migrations (`npm run db:push`)