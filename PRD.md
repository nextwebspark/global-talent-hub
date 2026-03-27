# Global Talent Map — Product Requirements Document

**Version:** 1.0
**Last Updated:** March 2026
**Product Type:** AI-Driven Executive Search & Talent Mapping Platform

---

## 1. Executive Summary

Global Talent Map is a web application designed for executive search professionals that automates the discovery, validation, and mapping of target companies and executives across global markets. It combines real-time web search, AI-powered classification, and interactive visualization to replace the manual research process that typically takes weeks with an automated pipeline that delivers validated results in minutes.

The core value proposition: enter a natural language search like *"FMCG distributors in the UAE"* and receive a validated, tiered list of real companies with executive profiles, revenue data, and geographic visualization — ready for outreach.

---

## 2. Problem Statement

Executive search firms spend significant time on manual market mapping — identifying which companies exist in a specific sector, geography, and commercial function, then researching their leadership teams. This process involves:

- Manually searching Google, LinkedIn, and industry directories
- Building spreadsheets of target companies from fragmented sources
- Researching each company individually for revenue, headcount, and key executives
- Maintaining these lists across multiple mandates with overlapping targets
- No structured way to visualize market concentration or talent distribution

Global Talent Map eliminates this manual work by automating discovery, validation, enrichment, and visualization into a single integrated workflow.

---

## 3. Target Users

| User Type | Description | Primary Use Case |
|-----------|-------------|-----------------|
| Executive Search Consultant | Manages client mandates, builds target lists | Run searches, review results, export to Clockwork |
| Research Associate | Supports consultants with market mapping | Enrich company data, identify executives, build reports |
| Practice Lead | Oversees sector-specific search mandates | Review dashboards, analyze market concentration |

---

## 4. Core Features

### 4.1 AI-Powered Search & Discovery

**Natural Language Search**
Users enter plain English queries describing their target market. The system extracts structured intent (sectors, geographies, commercial roles) and executes a multi-phase discovery pipeline.

*Examples:*
- "FMCG distributors in the UAE"
- "Pharmaceutical companies in Saudi Arabia with revenue over $100M"
- "Technology companies across GCC with strong distribution operations"

**Position Description Upload**
Users can upload a PDF, DOCX, or TXT job description. The system extracts requirements (sector, geography, seniority level, functional expertise) and uses them to drive a targeted search.

**Search Pipeline Architecture**

| Phase | Source | Purpose |
|-------|--------|---------|
| Phase 1 — Web Discovery | Serper API (Google) | 6 varied search queries targeting industry directories, LinkedIn, and trade publications. Top 3 listicle pages are fetched in full and mined for company names. |
| Phase 2 — AI Classification | Claude (via OpenRouter) | Single Claude call per company returns include/exclude decision, tier (Direct/Adjacent/Exclude), confidence score, and reasoning. |
| Phase 3 — Adjacent Sectors | Claude seed generation | Explores related sectors for companies with transferable executive expertise (e.g., Personal Care distribution for an FMCG distributor search). |

**Company Name Extraction**
The system extracts company names from three sources per search result:

1. **Page title** — strips taglines after pipe/dash characters
2. **Domain name** — converts company website domains to proper names
3. **Snippet first sentence** — identifies the leading proper noun

Full page content is fetched from industry directory and listicle pages, with extraction of numbered lists, bullet lists, company name suffixes, bold text, and comma-separated lists.

**Three-Tier Classification**

| Tier | Label | Criteria | Confidence Range |
|------|-------|----------|-----------------|
| Tier 1 | Direct | Primary business matches the searched commercial role and sector | 70–100 |
| Tier 2 | Adjacent | Operates in sector or role but not both as primary; executives would have transferable expertise | 50–69 |
| Tier 3 | Exclude | No meaningful connection; manufacturers, pure retailers, or unrelated entities | Excluded from results |

**Real-Time Streaming**
Search results stream to the UI via Server-Sent Events (SSE) as companies are discovered and classified. Users see activity updates, company cards appearing progressively, and filtering status in real-time.

---

### 4.2 Company Management

**Company Records**
Each company record includes:
- Name, sector, sector category
- Country, headquarters geography
- Revenue (value, currency, financial year, source, confidence)
- Employee count
- Website
- Latitude/longitude coordinates
- Relevance type (Direct / Adjacent / AI Inferred)
- Confidence score and relevance rationale
- Custom fields (JSONB)
- Data provenance tracking

**Non-Destructive Data Model**
- Manual edits are tracked in `manuallyEditedFields` and are never overwritten by pipeline runs
- Pipeline data only overwrites existing values when its confidence score is strictly higher
- Null/empty fields always accept new data
- Every merge decision is logged in the `pipeline_log` table

**Company Status Values:** Active, Off-Limits

---

### 4.3 Executive Management

**Executive Records**
Each executive profile includes:
- Name, title, seniority level
- Company association
- LinkedIn URL, email, phone
- Gender and ethnicity (AI-inferred with confidence tracking)
- Status: Interested, Not Interested, Out of Scope, Off-Limits
- Career history (multiple entries with company, title, dates)
- Education (institution, degree, field, dates)
- Remuneration (base salary, allowances, bonus, LTIP with currency and year)

**AI-Powered Profile Extraction**
Paste a LinkedIn profile or CV text and the system extracts structured data (career history, education, contact details) automatically.

**Remuneration Parsing**
Free-text compensation notes are parsed into structured salary components (base, bonus, allowances, LTIP) with automated currency conversion to USD.

**Diversity Inference**
Gender and ethnicity are automatically inferred for every executive using AI. Only high-confidence values (8+/10) are persisted. Manual edits always take precedence.

**Executive Status Values:** Interested, Not Interested, Out of Scope, Off-Limits

---

### 4.4 Interactive Map Visualization

**Mapbox Globe View**
Companies are displayed as interactive markers on a 3D Mapbox globe. Features include:
- Globe projection (3D sphere when zoomed out, flat map when zoomed in)
- Company markers sized by revenue
- Cluster aggregation at low zoom levels
- Dark/light theme auto-switching
- Drag-to-reposition markers

**Satellite Hierarchies**
Executives appear as "satellite" pills orbiting their company marker on the map. Users can:
- Drag executives between companies
- Create parent-child hierarchies
- Hierarchies persist to the database and restore when loading a project

---

### 4.5 Data Table View

A comprehensive grid view of all companies and executives with:
- Column sorting, filtering, and search
- Inline editing of any field
- Bulk selection and operations
- Excel/CSV export
- Column visibility toggles
- Status indicators with color coding

---

### 4.6 Intelligence Dashboard

**Executive Summary Banner**
High-level project statistics: total companies, executives identified, mapping completion percentage.

**Mapping Completion**
Visual progress indicator showing what percentage of target companies have been fully mapped (executives identified and profiled).

**Market Concentration Analysis**
Geographic distribution of the talent pool showing concentration by country and region.

**Revenue Distribution**
Companies segmented by revenue bands with sector and ownership breakdowns.

**Compensation Analytics**
- Median, minimum, and maximum compensation by seniority level
- Level-to-level step-up analysis
- Compensation by revenue band and region
- Origin vs. GCC vs. International comparisons

**Diversity & Inclusion Analytics**
- Gender distribution (donut chart with percentages)
- Gender by seniority level (stacked bars)
- Ethnicity distribution (horizontal bars with diversity index)
- Ethnicity by seniority level (stacked bars)

**Availability Tracking**
Statistics on candidate engagement status: Interested, Not Interested, Out of Scope, Off-Limits.

---

### 4.7 Clockwork Integration

**Project Sync**
- Browse and select existing Clockwork Recruiting projects
- Link Global Talent Map projects to Clockwork projects

**Match & Review**
- Compare discovered candidates against existing Clockwork project candidates
- Identify "New," "Existing," or "Duplicate" profiles
- Side-by-side comparison view

**Import**
- One-click import of candidates from web search results into Clockwork
- Automatic field mapping between systems

---

### 4.8 Data Import & Export

**Bulk Import**
- Excel/CSV file upload with automated column mapping
- Clipboard paste support
- Preview and validation before import

**Export**
- Excel export of companies and executives
- All fields including diversity data, remuneration, and custom fields

---

## 5. Technical Architecture

### 5.1 Frontend

| Technology | Purpose |
|-----------|---------|
| React 18 + TypeScript | UI framework |
| Wouter | Client-side routing |
| Zustand | Global state management |
| TanStack React Query | Server data fetching and caching |
| Mapbox GL JS | Interactive globe visualization |
| Radix UI (shadcn/ui) | Component library |
| Tailwind CSS v4 | Styling |
| Vite | Build tooling |
| Framer Motion | Animations |

### 5.2 Backend

| Technology | Purpose |
|-----------|---------|
| Node.js + Express | API server |
| TypeScript | Type safety |
| PostgreSQL | Primary database |
| Drizzle ORM | Database queries and schema management |
| drizzle-zod | Schema validation |
| connect-pg-simple | Session store |

### 5.3 AI & Search Services

| Service | Purpose |
|---------|---------|
| OpenRouter | LLM gateway (Claude Sonnet 4 primary, Gemini Flash fallback) |
| Serper API | Google search for company discovery and enrichment |
| Clockwork API | Executive search platform integration |

### 5.4 Database Schema (Core Tables)

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `users` | Authentication | — |
| `search_queries` | Search projects | — |
| `search_sessions` | Streaming search sessions | → users, search_queries |
| `companies` | Company records | → search_queries, search_sessions |
| `executives` | Executive profiles | → companies (cascade delete) |
| `career_history` | Executive work history | → executives |
| `education` | Executive education | → executives |
| `remuneration` | Compensation data | → executives |
| `company_notes` | Internal notes | → companies |
| `executive_notes` | Internal notes | → executives |
| `search_results` | Raw search result links | → search_queries, companies |
| `pipeline_log` | Audit trail for data changes | → search_queries |
| `conversations` / `messages` | Chat interface | — |

### 5.5 Design Principles

1. **"The LLM proposes. The Application decides. The UI only shows validated truth."** — All AI outputs undergo strict validation before being presented.
2. **Non-Drop Rule** — A company record is never omitted due to missing or low-confidence fields. Uncertainty applies at the field level only.
3. **Manual Edits Are Sacred** — User-modified fields are tracked and never overwritten by automated pipelines.
4. **Confidence-Based Merging** — Pipeline data only overwrites when confidence is strictly higher.
5. **Full Provenance Tracking** — Every field's source history is recorded in `data_provenance` JSONB.

---

## 6. User Flows

### 6.1 Discovery Flow

```
Landing Page → Enter query or upload PD
    ↓
Intent Extraction (Claude) → Structured criteria
    ↓
Phase 1: Web Search (Serper) → Company name extraction
    ↓
Phase 2: AI Classification (Claude) → Direct / Adjacent / Exclude
    ↓
Phase 3: Adjacent Sector Exploration → AI Suggested companies
    ↓
Streaming Results → Accept/Reject companies
    ↓
Save to Project → Navigate to Dashboard
```

### 6.2 Enrichment Flow

```
Dashboard → Select companies → Trigger "Enrich All"
    ↓
Targeted web searches per company
    ↓
Extract: Revenue, Employee Count, Key Executives
    ↓
Merge with confidence-based rules
    ↓
Updated company records + executive profiles
```

### 6.3 Clockwork Integration Flow

```
Dashboard → Select Clockwork Project
    ↓
Match Review → Compare candidates
    ↓
Review: New / Existing / Duplicate
    ↓
Confirm Import → Sync to Clockwork
```

---

## 7. Search Query Construction

The web search phase uses short, natural queries that mirror how industry pages are actually written:

| Query Pattern | Example |
|--------------|---------|
| `{sector} {role} {geography}` | "FMCG distributors UAE" |
| `{sector} {role} {geography}` (lowercase) | "fmcg distributors UAE" |
| `{sector} trading companies {geography}` | "FMCG trading companies UAE" |
| `{sector} distribution companies {city}` | "FMCG distribution companies Dubai" |
| `{sector} wholesalers {geography}` | "fmcg wholesalers UAE" |
| `{sector} {role} {geography} site:linkedin.com` | "FMCG distributors UAE site:linkedin.com" |

Sector names are shortened ("FMCG" not "Fast-Moving Consumer Goods"). Geography names are shortened ("UAE" not "United Arab Emirates").

---

## 8. Sector Taxonomy

Companies are classified using a two-level taxonomy:

**13 Broad Categories:**
Energy, Materials, Industrials, Consumer Discretionary, Consumer Staples, Health Care, Financial Services, Information Technology, Communication Services, Utilities, Real Estate, Conglomerates & Holding Companies, Sovereign Wealth & Government

**~40 Specific Sub-Sectors:**
e.g., Oil Gas & Pipelines, Software & SaaS, Sovereign Wealth Funds, FMCG Distribution, Pharmaceutical Distribution, Luxury Retail

---

## 9. API Endpoints

### Search & Pipeline
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/search` | Start a new discovery session |
| GET | `/api/search/stream` | SSE endpoint for real-time results |
| GET | `/api/search/enhanced-stream` | Enhanced streaming search |
| POST | `/api/search/upload-pd` | Upload position description |
| POST | `/api/search/refine` | Refine active search with follow-up |
| POST | `/api/search/add-to-project` | Save stream results to project |

### Companies
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/companies` | List companies in a project |
| PATCH | `/api/companies/:id` | Update company fields |
| DELETE | `/api/companies/:id` | Remove a company |

### Executives
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/executives` | List executives |
| POST | `/api/executives` | Create executive |
| PATCH | `/api/executives/:id` | Update executive |
| POST | `/api/executives/bulk-import` | Bulk create from data mapping |
| POST | `/api/executives/:id/extract-profile` | AI extraction from text |
| POST | `/api/executives/:id/remuneration/parse` | Parse compensation text |

### Dashboard & Analytics
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/dashboard/:searchId` | Computed analytics for a project |

### Configuration
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/config` | Client configuration (Mapbox token) |

---

## 10. Environment & Secrets

| Secret | Purpose |
|--------|---------|
| `OPENROUTER_API_KEY` | LLM access via OpenRouter |
| `SERPER_API_KEY` | Google search via Serper |
| `MAPBOX_ACCESS_TOKEN` | Map rendering |
| `DATABASE_URL` | PostgreSQL connection |
| `CLOCKWORK_API_KEY` | Clockwork Recruiting integration |

---

## 11. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Search response time | First results within 5s, full pipeline within 60s |
| Concurrent users | Single-tenant (per deployment) |
| Data persistence | All search results, companies, and executives permanently stored |
| Browser support | Modern browsers (Chrome, Firefox, Safari, Edge) |
| Theme support | Light and dark mode |
| Export formats | Excel (.xlsx), CSV |

---

## 12. Future Considerations

- **Claude seed generation re-introduction**: Once classification is stable, Claude can supplement web search for sectors with limited online presence
- **Multi-user collaboration**: Real-time collaborative editing of project data
- **Automated pipeline scheduling**: Periodic re-enrichment of existing projects
- **API access**: RESTful API for third-party integrations beyond Clockwork
- **Mobile-responsive design**: Optimized layouts for tablet and mobile devices
