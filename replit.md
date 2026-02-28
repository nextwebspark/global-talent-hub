# Global Talent Map

## Overview
Global Talent Map is an AI-driven market research web application designed for executive search firms. It allows users to input natural-language queries to identify and rank companies by revenue, visualizing results as interactive bubbles on a global map. The application enables users to discover executive details, and each search generates a persistent project where all edits and results are preserved. The primary goal is to provide a comprehensive and validated talent mapping solution for executive recruitment.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Architectural Principle
The system operates on the principle: "THE LLM PROPOSES. THE APPLICATION DECIDES. THE UI ONLY SHOWS VALIDATED TRUTH." This means all LLM outputs undergo strict validation and potential modification by the application before being presented to the user.

### Confidence Score Semantics
Confidence scores (0-10) influence ranking and visuals but never cause outright blocking. Missing confidence is treated as "unknown" (confidence = 3), while explicit low confidence (0 or 1) is preserved. Only `confidence >= 6` influences visual scaling.

### Core Data Principles & Non-Drop Rule
All search results, companies, and executives are persistently stored in a PostgreSQL database. Data modifications immediately update the database, ensuring that reloading a previous search restores the most recent information, including manual edits. The system prioritizes audited reports for data sourcing, especially for revenue figures, which require specific fields (value, currency, financial year, source, confidence). A critical "Non-Drop Rule" dictates that a company record is never omitted due to missing or low-confidence fields; data uncertainty applies only at the field level, and schema parsing failures for one field do not affect others.

### Frontend Architecture
The frontend is built with React 18 and TypeScript, utilizing Wouter for routing, Zustand for global state, and TanStack React Query for data fetching. UI components are sourced from shadcn/ui (Radix UI) and styled with Tailwind CSS v4. Interactive maps are rendered using Leaflet with React-Leaflet, and Vite serves as the build tool.

### Backend Architecture
The backend is a Node.js Express.js application written in TypeScript, providing a RESTful JSON API. Primary search discovery uses Serper API (Google search) with LLM-based extraction via the discovery pipeline. Enrichment also uses Serper for targeted data lookups. Session management uses Express sessions with a PostgreSQL store.

### Data Storage
PostgreSQL is the primary database, managed with Drizzle ORM and drizzle-zod for schema validation. Key tables include `users`, `companies`, `executives`, `searchQueries`, `conversations`, and `messages`.

### Layered Architecture
The backend employs a strict layered architecture:
- **Serper Search Layer**: Uses Serper API (Google search) for web retrieval with noise filtering, list-article parsing, and country-aware geo-targeting (`gl` parameter).
- **Discovery Pipeline**: Serper search → LLM extraction of structured company data (non-destructive) → persistence to DB. No LLM model selection needed — uses OpenAI integration.
- **Enrichment Pipeline**: Targeted Serper searches for revenue, employees, and executives with LLM extraction from search results.
- **Enrichment Layer**: Integrates with Clockwork API for fuzzy matching and data enrichment, populating empty fields without overwriting existing data.
- **Persistence Layer**: Enforces write restrictions and serves as the single source of truth.
- **UI/Manual Layer**: Allows direct user creation and editing of records, overriding imported data.
- **Routes Layer**: A thin orchestration layer.

### AI Research Engine
Server-side search uses Serper API for web discovery, followed by LLM extraction for structured company data. A simple heuristic (regex) extracts limits from queries. Results are ranked by revenue, then employees, with executive filtering support. The landing page provides a simple search box without LLM model selection.

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
- Status & Interest analytics.
- Comprehensive Compensation Analytics (median/min/max, level-to-level step-up, median compensation by revenue band & region).
All analytics are computed server-side.

## External Dependencies

### AI Services
- **OpenAI API**: Primary AI model access for data extraction.
- **OpenRouter**: Multi-model LLM support for enrichment extraction.
- **Serper API**: Google search API for company discovery and enrichment searches.

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