# Global Talent Map — Search Feature Deep Dive

**Scope:** The first screen (Landing page) — AI Search mode only. Covers everything from the user typing a query to results being saved, plus the service layer, current state, and cleanup targets.

---

## 1. What the User Sees (First Screen)

The first screen is `Landing.tsx`. It has two top-level modes (tab switcher): **AI Search** and **Import Data**. This document focuses on **AI Search**.

### 1.1 Phase: `input` (before search starts)

URL: `/` (root route via Wouter)

Layout:
- Thin left sidebar (12px wide): Projects panel toggle + theme toggle
- Centred card (max-w-3xl): headline "Global Talent Map", subline "AI-driven market intelligence for executive search."
- Mode tabs: `AI Search` | `Import Data`
- The search card:
  - Header bar: "AI Intelligence" badge, **Upload PD** button (or filename chip if uploaded)
  - Body: example prompt chips (hidden once user types), `<Textarea>` for the query
  - If PD is loaded: PD preview toggle + **Mark as confidential** checkbox
  - Footer: `⌘Enter` hint, **Discover Companies** button

Key `data-testid` attributes:
| Element | testid |
|---------|--------|
| Sidebar | `landing-sidebar` |
| Projects button | `sidebar-projects` |
| Theme toggle | `landing-theme-toggle` |
| AI Search tab | `tab-search` |
| Import tab | `tab-import` |
| PD upload button | `button-upload-pd` |
| PD file input | `input-pd-file` |
| PD clear button | `button-clear-pd` |
| PD drag-drop zone | `dropzone-pd-upload` |
| PD confidential checkbox | `checkbox-pd-confidential` |
| PD preview toggle | `button-toggle-pd-preview` |
| PD preview text | `pd-extracted-preview` |
| Prompt chips container | `example-prompt-chips` |
| Individual chips | `chip-example-<slug>` |
| Query textarea | `input-search-query` |
| Submit button | `button-submit-search` |

### 1.2 Phase: `streaming` / `complete` (after search starts)

Once the user submits, the component transitions through `AnimatePresence` to a 3-column layout:

```
┌─────────┬─────────────────────────┬───────────────────┐
│ Sidebar │  Activity Feed (left)   │ Results (right)   │
│         │  + Intent card          │ Company cards     │
│         │  + Refinement input     │ w/ accept/reject  │
└─────────┴─────────────────────────┴───────────────────┘
```

Top bar shows:
- "Live Search" indicator with pulsing dot when `isStreaming === true`
- **Stop** button (destructive, calls `stopSearch()`)
- Query text + company count
- **Save Project** button (appears when `acceptedCount > 0`)
- **Go to Dashboard** button

Key `data-testid` attributes for streaming/results phase:
| Element | testid |
|---------|--------|
| Stop button | `button-stop-search` |
| Save project button | `button-save-project` |
| Go to dashboard | `button-go-to-dashboard` |
| Activity feed container | `activity-feed` |
| Completion screen | `completion-screen` |
| Completion summary | `completion-summary` |
| Completion rationale | `completion-rationale` |
| View project button | `button-completion-view-project` |
| New search button | `button-completion-new-search` |

### 1.3 Phase: Completion screen (after save)

Shown when `savedProjectSummary !== null`. Displays saved counts, AI rationale, and two buttons: "View Project" (→ `/dashboard`) and "Refine & Search Again" (resets state).

---

## 2. State Architecture

### 2.1 Zustand Store — `client/src/lib/store.ts`

The store is a monolith (`AppState`) combining two concerns:

**Search session state** (ephemeral, reset on each new search):
```typescript
searchPhase: 'input' | 'streaming' | 'complete'
searchSessionId: string | null       // UUID generated at Landing mount
searchIntent: InferredIntent | null  // AI-parsed intent from LLM
searchActivities: ActivityEvent[]    // Live feed (capped at 150 items)
searchCompanies: StreamCompany[]     // Enriched company results
pendingCompanyNames: string[]        // Skeleton cards (company_found before enrichment)
searchQueryId: number | null         // DB row ID for this search
selectedSearchCompanyIds: Set<number>
searchRefinementHistory: Array<{message, timestamp}>
searchPdContent: string | null
searchPdConfidential: boolean
isSearchStreaming: boolean
isSearchRefining: boolean
```

**Legacy project state** (persisted across navigation, loaded from DB):
```typescript
currentProject: Project | null
companies: Company[]          // Full company objects for the map/table
executives: Executive[]
selectedCompanyId, selectedExecutiveId, executiveDetails, ...
```

**Important:** `StreamCompany` (search results) and `Company` (dashboard/map) are **two different types**. After saving, `loadFromAPI()` transforms the search results into `Company[]` objects for the dashboard.

`StreamCompany` shape:
```typescript
{
  id: number
  name, sector, country, geography: string | null
  revenue: string | null         // stored as string in DB
  employees: number | null
  website, summary: string | null
  latitude, longitude: string | null
  relevanceType: 'Direct' | 'Adjacent' | 'AI Inferred'
  relevanceRationale: string
  confidenceScore: number        // 0.0–1.0
  isUserAccepted: boolean
  isUserRejected: boolean
  executives?: Array<{name, title}>
  accepted: boolean              // duplicate of isUserAccepted (legacy)
  rejected: boolean              // duplicate of isUserRejected (legacy)
}
```

Note: `accepted`/`rejected` and `isUserAccepted`/`isUserRejected` are redundant. Both are set together in `acceptSearchCompany`/`rejectSearchCompany`.

### 2.2 Session ID

`const [sessionId] = useState(() => crypto.randomUUID())` — created once at `Landing` mount. It ties the frontend EventSource stream to the backend `search_sessions` DB row. It is passed to every API call.

---

## 3. Frontend Flow

### 3.1 `useSearchStream` hook — `client/src/lib/useSearchStream.ts`

This hook owns all streaming logic. `Landing.tsx` calls it and destructures everything.

**`startSearch(query, sessionId)`:**
1. Closes any existing `EventSource`
2. Calls `resetSearchSession()` in Zustand
3. Sets `sessionId`, `phase = 'streaming'`, `isStreaming = true`
4. Opens `new EventSource('/api/search/enhanced-stream?query=...&sessionId=...')`
5. Registers listeners for these SSE event types:
   - `search_created` → stores `searchQueryId`
   - `intent_extracted` → stores `InferredIntent`
   - `company_found` → pushes name to `pendingCompanyNames` (shows skeleton card)
   - `company_enriched` → calls `addSearchCompany()`, removes skeleton
   - `adjacent_sector_found` → activity log only (no UI card yet)
   - `executive_found` → calls `addExecutiveToCompany(companyId, executive)`
   - `search_complete` / `done` → clears pending skeletons, `phase = 'complete'`
   - `status` → activity log only
   - `error` → activity log, stops streaming

**`stopSearch()`:** closes `EventSource`, clears pending names, sets `phase = 'complete'`.

**`startRefinement(sessionId, refinementMessage)`:**
- Uses `fetch()` + `ReadableStream` instead of `EventSource` (POST with SSE response)
- POST `/api/search/refine`
- Parses SSE lines from chunked response manually (handles chunk-boundary partial lines via `lineBuffer`)
- Same event handling as `startSearch` — parity is maintained manually (code duplication)
- Sets `isRefining = true` during execution

**`acceptCompany(id)` / `rejectCompany(id)`:** thin wrappers around Zustand actions.

### 3.2 Skeleton card pattern

When `company_found` arrives: name added to `pendingCompanyNames`.
When `company_enriched` arrives: `addSearchCompany()` is called, which atomically removes the matching name from `pendingCompanyNames` via case-insensitive comparison.
On `done`/`search_complete`: `clearPendingCompanyNames()` clears any leftover skeletons (companies found but not enriched, e.g. if pipeline skipped them).

---

## 4. API Endpoints (Search Slice)

All in `server/routes/registrations/search.ts`.

### 4.1 `GET /api/search/enhanced-stream` — Primary search

Query params: `query` (string), `sessionId` (UUID)

Response: SSE stream (`text/event-stream`, headers: `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`)

Server flow:
1. Load session from DB (for `pdContent` + `pdConfidential`)
2. **Confidentiality gate:** if `pdConfidential === true`, call Anthropic Claude (`claude-opus-4-5`) to extract structured search criteria; raw PD text is stripped. If extraction fails, PD context is dropped entirely.
3. Call `parseSearchQuery(query)` → `criteria` (limit, basic heuristics)
4. `generateSearchUniqueKey(...)` + `storage.upsertSearchQuery(...)` → DB row
5. `storage.createSearchSession(...)` + `storage.updateSearchSession(...)` → link session to query
6. Send `search_created` SSE with `searchQueryId`
7. `void pdContent` ← **suppresses TS lint warning; pdContent not forwarded to pipeline (mock mode TODO)**
8. `for await (event of runSeedListEnhancedStream(...))` → forward each event via `sendSSE()`
9. On stream end: update `resultCount` in DB, send `done` event

### 4.2 `POST /api/search/refine`

Body: `{ sessionId, refinementMessage }`

Server flow:
1. Load existing session, load last `searchQueryId` from session
2. Same confidentiality gate as enhanced-stream
3. `parseSearchQuery(refinementMessage)` → criteria
4. Update session with refinement history
5. `runSeedListEnhancedStream(refinementMessage, ...)` — same pipeline, same seed list

Note: refinement does not narrow results; it re-runs the full mock pipeline with the new query string. Actual filtering is a Phase 2 TODO.

### 4.3 `POST /api/search/upload-pd`

Accepts `multipart/form-data`: `file` (PDF/DOCX/TXT), `sessionId`, `pdConfidential`.

Extracts text using:
- PDF: `pdf-parse`
- DOCX: `mammoth`
- TXT: plain `buffer.toString('utf-8')`

Stores extracted text in `search_sessions.pdContent`. Returns `{ filename, charCount, extractedText }`.

### 4.4 `PATCH /api/search/session/:sessionId/confidential`

Body: `{ pdConfidential: boolean }` — updates flag in DB immediately.

### 4.5 `POST /api/search/add-to-project`

Body: `{ companyIds: number[], sessionId, query }`

Creates/updates project from accepted companies. Returns `{ searchQueryId }`. After this, Landing calls `GET /api/search-history/:id/load` to hydrate the dashboard store.

### 4.6 `POST /api/search` and `GET /api/search/stream` (legacy)

These route to `runDiscoveryPipeline` → `runSeedListSearch`. Emit different event shapes (`company`, `source`, `complete` instead of `company_found`, `company_enriched`, `search_complete`). Not used by the current UI. Candidates for removal when dead code is cleaned up.

---

## 5. Backend Pipeline

### 5.1 Active path: `runSeedListEnhancedStream`

File: `server/services/pipeline/seedListSearch.ts`

```
runSeedListEnhancedStream(query, searchQueryId, limit, signal?, sessionId?)
```

Steps:
1. `extractQueryIntent(query)` → `QueryIntent` (LLM call, Gemini 2.5 Pro/Flash)
2. Emit `intent_extracted` with `queryIntentToInferredIntent(qi)` → `InferredIntent`
3. `storage.getCompanySeedSample(limit)` → rows from `company_seed_list` table
4. For each row: emit `company_found` (name only)
5. For each row (second pass): `storage.upsertCompanyNonDestructive(...)` → persist to `companies` table, then emit `company_enriched` with full company object
6. `storage.updateSearchQueryResultCount(...)` → update DB
7. Emit `search_complete`

**Current limitation (mock mode):** Step 3 is a blind `LIMIT N` sample — no SQL filtering by intent. The `QueryIntent` object is extracted but never used to filter. See Phase 2 TODOs.

`emit()` helper (local to this file):
```typescript
function emit(type, message, data?): EnhancedEvent {
  return { type, message, data, timestamp: new Date().toISOString() };
}
```

`queryIntentToInferredIntent()` maps `QueryIntent` → `InferredIntent` (the shape the frontend expects). These are two parallel interfaces that represent the same concept:
- `QueryIntent` — internal pipeline shape, richer (includes examples, descriptions)
- `InferredIntent` — frontend-facing, stored in Zustand, includes `primarySectors`, `adjacentSectors`, `targetGeographies`, etc.

### 5.2 Intent extraction: `extractQueryIntent`

File: `server/services/pipeline/queryIntent.ts`

- Calls Gemini 2.5 Pro → falls back to Gemini 2.5 Flash if first fails
- Returns `QueryIntent` JSON parsed from LLM response
- `parseJsonSafe()` strips markdown fences + extracts first `{...}` block

### 5.3 LLM client: `getLLMClient`

File: `server/services/llmClient.ts`

- Returns an OpenAI-compatible client pointed at Google Gemini via Vertex AI
- `DEFAULT_MODEL = "gemini-2.5-pro"`, `FAST_MODEL = "gemini-2.5-flash"`

### 5.4 Coordinate fallback: `applyCoordinateFallback`

File: `server/services/coordinateFallback.ts`

Chain: exact coords → city centroid → country centroid → `{ lat: 0, lng: 0, precision: 'unknown' }`.

Used in `seedListSearch.ts` when building `streamCompany` objects.

Note: `store.ts` also has its own inline `COUNTRY_CENTROIDS` and `getCountryCentroid()` for the `transformAPICompany` path. This is a duplication but across different execution contexts (server vs client).

---

## 6. Data Model (Relevant Tables)

From `shared/schema.ts` and `migrations/`:

**`search_sessions`** — one per `sessionId` UUID
- `id` (UUID), `rawQuery`, `pdContent`, `pdConfidential`, `searchQueryId` (FK), `intent` (JSON), `refinementHistory` (JSON[])

**`search_queries`** — one per actual query execution
- `id`, `uniqueKey`, `query`, `parsedCriteria` (JSON), `resultCount`, `satelliteHierarchies`, `tableConfig`, `mapPositions`

**`companies`** — persisted during enrichment
- `id`, `name`, `sector`, `country`, `latitude`, `longitude`, `locationPrecision`, `revenue`, `employees`, `website`, `summary`, `confidence`, `searchSessionId` (FK), `relevanceType`, `relevanceRationale`, `confidenceScore`

**`company_seed_list`** — the mock search source
- `id`, `name`, `sector`, `country`, `website`, `description`

**`executives`** — linked to companies, populated by extraction pipeline

---

## 7. Dead Code (2,009 lines — safe to delete)

These files are never imported anywhere in the active codebase.

| File | Lines | Notes |
|------|-------|-------|
| `server/services/pipeline/enhancedSearchPipeline.ts` | 1,157 | Full Gemini grounded-search implementation. Blocked by Phase 2 TODO. Two `// TODO` comments in `search.ts` (lines 364, 542) reference it. |
| `server/services/pipeline/quickBuildSearch.ts` | 395 | Role-detection + LLM extraction. No imports found. Appears abandoned. |
| `server/services/pipeline/enrichment.ts` | 457 | Used only by `enhancedSearchPipeline`. Dead transitively. |

Also dead but part of the `pipeline/index.ts` barrel — verify before removing:
- `server/services/pipeline/geminiSearchAdapter.ts` — only imported by `enhancedSearchPipeline`
- `server/services/pipeline/serperAdapter.ts` — only imported by `enhancedSearchPipeline`

---

## 8. Duplicates & Inconsistencies (Cleanup Targets)

### 8.1 `parseJsonSafe()` defined twice in active code

| Location | Notes |
|----------|-------|
| `server/services/pipeline/queryIntent.ts:55` | Module-private function |
| `server/routes/registrations/search.ts:487` | Inline as `parseJsonSafeLocal` inside a route handler |

**Fix:** Extract to `server/services/pipeline/utils.ts`, export, import in both places.

### 8.2 `accepted` / `isUserAccepted` duplication on `StreamCompany`

`StreamCompany` has both `accepted: boolean` and `isUserAccepted: boolean` (same for `rejected`). They are set identically in `acceptSearchCompany` / `rejectSearchCompany`.

```typescript
// store.ts — both always set together:
searchCompanies.map(c => c.id === id
  ? { ...c, accepted: true, rejected: false }  // ← redundant pair
  : c
)
```

And in `seedListSearch.ts` the enriched company is built with:
```typescript
isUserAccepted: false,
isUserRejected: false,
// ... then in useSearchStream.ts:
addSearchCompany({ ...data.company, accepted: false, rejected: false })
```

**Fix:** Remove `accepted`/`rejected` from `StreamCompany`, use only `isUserAccepted`/`isUserRejected`. Check all filter calls in Landing (e.g. `companies.filter(c => c.accepted)`).

### 8.3 `startSearch` and `startRefinement` duplicate event-handling logic

In `useSearchStream.ts`, both `startSearch` (lines 80–115) and `startRefinement` (lines 192–214) contain near-identical `switch/if` trees for handling SSE event types. If a new event type is added, it must be handled in both places.

**Fix:** Extract a shared `applySearchEvent(type, data, store)` function called from both paths.

### 8.4 `runSeedListSearch` (lines 27–136) vs `runSeedListEnhancedStream` (lines 169–265) in same file

`runSeedListSearch` is only called by `runDiscoveryPipeline` → `POST /api/search` (legacy). It emits different event types (`company`, `source`, `complete`) than the enhanced stream. When the legacy endpoints are removed, this function goes with them.

### 8.5 `COUNTRY_CENTROIDS` defined in two places

- `server/services/coordinateFallback.ts` — used server-side during enrichment
- `client/src/lib/store.ts:379` — used client-side in `transformAPICompany()`

These are intentional (different environments) but should stay in sync. Currently the server version has more entries. Not a bug, just worth noting.

### 8.6 `void pdContent` suppression in `search.ts:365`

```typescript
void pdContent;  // TODO(mock-mode): restore runEnhancedSearchPipeline when intent->SQL ships
```

This is a TS linter suppression — `pdContent` is extracted from the session but not forwarded to the pipeline. Remove when Phase 2 wires up the real pipeline.

---

## 9. Phase 2 TODOs (Blocking Real Search)

These are the gaps between "mock mode" and a real AI-powered search:

| Location | TODO |
|----------|------|
| `seedListSearch.ts:51` | Translate `QueryIntent` → SQL filter (`WHERE country IN ...`, `sector ILIKE ...`) |
| `seedListSearch.ts:192` | Same for refinement path |
| `search.ts:364` | Restore `runEnhancedSearchPipeline` when intent→SQL ships |
| `search.ts:542` | Re-enable grounded-search path in refinement |

The `enhancedSearchPipeline.ts` (dead code) is the intended replacement — it does real Gemini web search + LLM enrichment. It needs to be wired up and its dead-code status reversed once SQL filtering is ready.

---

## 10. End-to-End Flow Summary

```
User types query in Textarea (data-testid="input-search-query")
  │
  ▼ handleEnhancedSearch() — Landing.tsx:418
  │  validates: needs input or PD file
  │
  ▼ startSearch(query, sessionId) — useSearchStream.ts:60
  │  resetSearchSession() → Zustand cleared
  │  phase → 'streaming'
  │  new EventSource('/api/search/enhanced-stream?query=...&sessionId=...')
  │
  ▼ GET /api/search/enhanced-stream — search.ts:293
  │  1. Load session (PD content + confidentiality flag)
  │  2. Confidentiality gate (Anthropic claude-opus-4-5 if flagged)
  │  3. parseSearchQuery() → criteria (heuristic, not LLM)
  │  4. upsertSearchQuery() → searchQueryId
  │  5. createSearchSession() / updateSearchSession()
  │  6. SSE: search_created { searchQueryId }
  │  7. runSeedListEnhancedStream(query, searchQueryId, limit, signal, sessionId)
  │
  ▼ runSeedListEnhancedStream() — seedListSearch.ts:169
  │  1. extractQueryIntent(query) → QueryIntent (Gemini LLM call)
  │  2. SSE: intent_extracted { intent: InferredIntent }
  │  3. storage.getCompanySeedSample(limit) → rows from company_seed_list
  │  4. For each row: SSE: company_found { companyName } → skeleton card in UI
  │  5. For each row: upsertCompanyNonDestructive() → companies table
  │     SSE: company_enriched { company: StreamCompany } → real card replaces skeleton
  │  6. updateSearchQueryResultCount()
  │  7. SSE: search_complete { totalCompanies }
  │
  ▼ Back in useSearchStream SSE handlers
  │  intent_extracted → setSearchIntent() → Zustand
  │  company_found → addPendingCompanyName() → skeleton appears
  │  company_enriched → addSearchCompany() → card appears, skeleton removed
  │  search_complete → clearPendingCompanyNames(), phase → 'complete'
  │
  ▼ User accepts companies (checkbox/button per card)
  │  acceptCompany(id) → acceptSearchCompany(id) in Zustand
  │
  ▼ User clicks "Save Project"
  │  handleSaveProject() — Landing.tsx:456
  │  POST /api/search/add-to-project { companyIds, sessionId, query }
  │  GET /api/search-history/:id/load → loadFromAPI() → Zustand (legacy store)
  │  savedProjectSummary set → completion screen shown
  │
  ▼ User clicks "View Project" → navigate('/dashboard')
```

---

## 11. Recommended Cleanup Order

Ordered by risk (lowest first):

### Step 1 — Delete dead files (zero risk, ~2,000 lines gone)
Verify no imports first: `grep -r "enhancedSearchPipeline\|quickBuildSearch\|enrichment" server/`

Files to delete:
- `server/services/pipeline/enhancedSearchPipeline.ts`
- `server/services/pipeline/quickBuildSearch.ts`
- `server/services/pipeline/enrichment.ts`
- `server/services/pipeline/geminiSearchAdapter.ts` (if only used by above)
- `server/services/pipeline/serperAdapter.ts` (if only used by above)

Verify after: `npm run check` must pass with zero errors.

### Step 2 — Extract `parseJsonSafe` to shared util (low risk)
Create `server/services/pipeline/utils.ts`:
```typescript
export function parseJsonSafe(content: string): any {
  let cleaned = content.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) cleaned = jsonMatch[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1) cleaned = cleaned.substring(start, end + 1);
  try { return JSON.parse(cleaned); } catch { return null; }
}
```
Update `queryIntent.ts` + `search.ts` to import from there.

### Step 3 — Deduplicate `StreamCompany.accepted`/`rejected` (medium risk — touches multiple files)
Remove `accepted`/`rejected` from `StreamCompany`, update all usage sites in `Landing.tsx` (filter calls, condition checks), `useSearchStream.ts`, and `seedListSearch.ts`.

### Step 4 — Extract shared SSE event handler in `useSearchStream.ts` (medium risk)
Extract `applySearchEvent(type, data, storeActions)` function; call from both `startSearch` and `startRefinement`.

### Step 5 — Remove legacy `/api/search` + `/api/search/stream` + `runSeedListSearch` (higher risk)
Only safe after confirming no other code (or tests) calls these. Removes one more layer of confusion.
