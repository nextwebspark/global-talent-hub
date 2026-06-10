# Global Talent Hub — System Architecture

Two layers, one product. **Layer 1 (offline)** builds the company universe with a grounded Google
ADK agent. **Layer 2 (live)** lets recruiters search, score, visualize, and export it.

---

## Full system diagram

```
                                    GLOBAL TALENT HUB
══════════════════════════════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — DATA ENRICHMENT AGENT  (offline · Python · talent-mapping-data-agent)           │
│                                                                                            │
│   ┌────────────────────┐                                                                   │
│   │  zawya.com scrape  │  raw rows: name, coarse sector, country, contact                  │
│   │  → Supabase        │                                                                   │
│   │    public.companies│                                                                   │
│   └─────────┬──────────┘                                                                   │
│             │ fetch_unenriched_companies                                                   │
│             ▼                                                                               │
│   ┌──────────────────────────────────────────────────────────────┐                        │
│   │           GOOGLE ADK AGENT  (root_agent)                      │                        │
│   │  ┌────────────────────────────────────────────────────────┐  │                        │
│   │  │  Vertex AI · Gemini 2.5 Pro                             │  │   ┌────────────────┐   │
│   │  │  + google_search  (grounding tool) ────────────────────┼──┼──▶│  Live web      │   │
│   │  │  temperature 0.2 · system-prompt JSON contract         │◀─┼──┼── (revenue,     │   │
│   │  └────────────────────────────────────────────────────────┘  │   │  headcount,    │   │
│   │                            │                                  │   │  sector)       │   │
│   │                            ▼                                  │   └────────────────┘   │
│   │   Pydantic validate (EnrichmentResult)   tenacity retries    │                        │
│   │            │ ok                  │ fail                       │                        │
│   └────────────┼─────────────────────┼─────────────────────────────┘                        │
│                ▼                     ▼                                                       │
│   ┌──────────────────────────┐   ┌──────────────────────────────┐                          │
│   │ public.company_enrichment│   │ company_enrichment_failures  │                          │
│   │  primary_sector (1/22)   │   │  error_class, poison-pill    │                          │
│   │  sector_tags[]  (GIN)    │   │  protection on re-runs       │                          │
│   │  emp/revenue bands       │   └──────────────────────────────┘                          │
│   │  is_listed, hq_city      │                                                              │
│   │  confidence, sources[]   │  Entry points:                                              │
│   │  model, prompt_version   │   • batch-run CLI (bulk/scheduled)                          │
│   └────────────┬─────────────┘   • ADK agent → Vertex AI Agent Engine (app-triggered)      │
└────────────────┼───────────────────────────────────────────────────────────────────────────┘
                 │  seed list (plain SQL, no LLM at query time)
                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — SEARCH + DISPLAY APP  (live · React 19 / Express 5 · Global-Talent-Hub)          │
│                                                                                            │
│   ┌─────────────────┐                                                                      │
│   │  RECRUITER       │  "Top FMCG distributors in UAE"   ── or ──  upload brief.pdf         │
│   └────────┬─────────┘                                                                      │
│            │  GET /api/search/enhanced-stream  (EventSource)                                │
│            ▼                                                                                 │
│   ┌──────────────────────────────────────────────────────────────────────────────────┐    │
│   │  EXPRESS ORCHESTRATOR · runSeedListEnhancedStream  (SSE)                          │    │
│   │                                                                                    │    │
│   │  1. INTENT  ── Gemini (@google/genai, Pro→Flash fallback) ──▶ translator only      │    │
│   │     free text → fixed attribute checklist from APPROVED VOCABULARY                 │    │
│   │     (off-list values discarded · injection-safe)                                   │    │
│   │     confidential brief → names stripped before any external AI                     │    │
│   │                          │                                                         │    │
│   │  2. NET-WIDEN  ── adjacency map: primary sector → adjacent talent-sharing sectors  │    │
│   │                          │                                                         │    │
│   │  3. SEED QUERY ── queryEnrichedCompanies over company_enrichment (Supabase)        │    │
│   │     bounded pool · ANY crucial signal (sector/adjacent/specialism) pulls in        │    │
│   │                          │                                                         │    │
│   │  4. SCORE  ── companyScore: deterministic SQL+math · 0–100% confidence             │    │
│   │     nice-to-haves only move score, never exclude · same query → same score         │    │
│   │     label: Direct(green) / Adjacent(blue) / AI-Inferred(amber) + reason            │    │
│   │                          │                                                         │    │
│   │  5. PERSIST ── upsertCompanyNonDestructive (fill blanks · provenance · audit)      │    │
│   └──────────────────────────┼─────────────────────────────────────────────────────────┘    │
│                              │  SSE events stream live, one company at a time              │
│       search_created → intent_extracted → adjacent_sector_found                            │
│              → company_found → company_enriched → … → search_complete                       │
│                              │                                                              │
│                              ▼                                                              │
│   ┌──────────────────────────────────────────┐   useSearchStream → Zustand useAppStore     │
│   │  UNIVERSE VIEW  (live results)            │                                             │
│   │  table · confidence bars · accept/reject  │                                             │
│   └────────────────┬─────────────────────────┘                                             │
│                    │  POST /api/search/add-to-project (ownership check · draft→project)     │
│                    ▼                                                                         │
│   ┌──────────────────────────────────────────────────────────────────────────────────┐    │
│   │  DASHBOARD  (3 views — keys 1 / 2 / 3)                                            │    │
│   │  ┌────────────────┐  ┌──────────────────┐  ┌────────────────┐                     │    │
│   │  │ MAP / GLOBE    │  │ TABLE            │  │ ANALYTICS      │                     │    │
│   │  │ Mapbox GL 3D   │  │ TanStack Table   │  │ Recharts       │                     │    │
│   │  │ revenue/HC     │  │ grouped, inline  │  │ sector/geo     │                     │    │
│   │  │ bubbles +      │  │ editable, bulk   │  │ breakdowns     │                     │    │
│   │  │ exec satellites│  │ import (xlsx)    │  │                │                     │    │
│   │  │ drag→Nominatim │  │                  │  │                │                     │    │
│   │  └────────────────┘  └──────────────────┘  └────────────────┘                     │    │
│   │         all edits → PATCH (optimistic) → non-destructive persist + provenance      │    │
│   └──────────────────────────┬───────────────────────────────────────────────────────┘    │
│                              │  on-demand enrichment + export                              │
│                              ▼                                                              │
│   ┌──────────────────────────────────────────────────────────────────────────────────┐    │
│   │  ENRICH + EXPORT                                                                  │    │
│   │   AI enrich (Gemini): revenue, headcount, profile, discover execs (blanks only)   │    │
│   │   CLOCKWORK CRM round-trip:  match → review → confirm → create/import             │    │
│   │     fuzzy name+company+title · non-destructive contact fill · de-dup by CW id     │    │
│   └──────────────────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════════════════
 EXTERNAL SERVICES   Google Vertex AI (Gemini 2.5 Pro/Flash · Search grounding · Agent Engine)
                     Supabase Postgres · Mapbox GL · Clockwork Recruiting API · Serper · Nominatim
 DEPLOY              App → Railway        Agent → Vertex AI Agent Engine / Cloud Run
═══════════════════════════════════════════════════════════════════════════════════════════
```

---

## One-line data flow

```
zawya scrape → [ADK agent · Gemini 2.5 Pro + Google Search grounding · Pydantic] → company_enrichment
   → recruiter query → [Gemini intent (translator) → adjacency widen → SQL seed → deterministic score]
   → live SSE → globe + table → accept → dashboard → AI enrich + Clockwork export
```

## Design principles (the "why")

| Principle | Where it shows |
|---|---|
| **AI interprets, system decides** | Gemini only translates to approved vocab; scoring is deterministic SQL+math |
| **Grounded + validated** | Google Search citations + Pydantic schema = trustworthy, auditable enrichment |
| **Forgiving yet strict** | Any crucial signal includes a company; nice-to-haves only move the score |
| **Manual edits are sacred** | Non-destructive upsert, `manuallyEditedFields`, per-field provenance + audit |
| **Stream, don't spinner** | SSE pops companies one-by-one — reads as "the agent is working" |
| **No premature complexity** | Postgres GIN arrays, not a vector DB, until semantic matching lands |
```
```
