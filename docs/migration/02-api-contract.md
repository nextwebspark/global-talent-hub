# 02 — API Contract (the backend behavior spec)

62 endpoints across 16 Express modules (`server/routes/registrations/*.ts`, registered in `server/routes/index.ts`). The new route handlers must preserve **path, method, request shape, response shape, and status codes**. Validate parity by diffing JSON against the old endpoint on the same DB.

> Each new handler reads its old module for exact behavior. Module path = `server/routes/registrations/<name>.ts`.

## Config & health
| Method | Path | Module | Notes |
|--------|------|--------|-------|
| GET | `/api/health` | server/index.ts:64 | `{ status: "ok" }` |
| GET | `/api/config` | config.ts | `{ mapboxToken }` from `MAPBOX_ACCESS_TOKEN` |

## Companies
| Method | Path | Module |
|--------|------|--------|
| GET | `/api/companies` | companies.ts — returns companies, each with `executives[]` (N+1; preserve shape) |
| GET | `/api/companies/search` | companies.ts — `?name=` |
| GET | `/api/companies/:id` | companies.ts |
| GET | `/api/companies/:id/notes` | notes.ts |
| GET | `/api/companies/:companyId/executives` | executives.ts |
| POST | `/api/companies` | companies.ts — coordinate fallback → Zod validate → sector inference → create |
| POST | `/api/companies/infer-sectors` | companies.ts — batch sector inference |
| POST | `/api/companies/:id/enrich-deepseek` | companyEnrichDeepseek.ts |
| POST | `/api/companies/:id/enrich-multipass` | companyEnrichMultipass.ts |
| PATCH | `/api/companies/:id` | companies.ts |
| PUT | `/api/companies/:id/notes` | notes.ts |
| DELETE | `/api/companies/:id` | companies.ts |

## Executives
| Method | Path | Module |
|--------|------|--------|
| POST | `/api/executives` | executives.ts |
| POST | `/api/executives/bulk-import` | executives.ts — Excel upload (`upload` multer) |
| POST | `/api/executives/:id/image` | executives.ts — image upload |
| POST | `/api/executives/:id/extract-profile` | executives.ts — LLM profile extraction |
| GET | `/api/executives/:id/details` | executives.ts — exec + company + career + education + remuneration + notes |
| GET | `/api/executives/:id/career-history` | career.ts |
| GET | `/api/executives/:id/education` | education.ts |
| GET | `/api/executives/:id/remuneration` | remuneration.ts |
| GET | `/api/executives/:id/notes` | notes.ts |
| POST | `/api/executives/:id/career-history` | career.ts |
| POST | `/api/executives/:id/education` | education.ts |
| POST | `/api/executives/:id/remuneration` | remuneration.ts |
| POST | `/api/executives/:id/remuneration/parse` | remuneration.ts — NL → structured comp |
| PATCH | `/api/executives/:id` | executives.ts |
| PUT | `/api/executives/:id/notes` | notes.ts |
| DELETE | `/api/executives/:id` | executives.ts |

## Career / Education / Remuneration (child records)
| Method | Path | Module |
|--------|------|--------|
| PATCH/DELETE | `/api/career-history/:id` | career.ts |
| PATCH/DELETE | `/api/education/:id` | education.ts |
| PATCH/DELETE | `/api/remuneration/:id` | remuneration.ts |

## Search & history
| Method | Path | Module |
|--------|------|--------|
| GET | `/api/search/enhanced-stream` | search.ts — **SSE** (see below). `?query=&sessionId=&limit=` |
| POST | `/api/search/upload-pd` | search.ts — PD doc upload (pdf/docx/txt), `pdUpload` multer |
| POST | `/api/search/add-to-project` | search.ts |
| POST | `/api/search/:id/enrich-all` | searchEnrich.ts |
| PATCH | `/api/search/:searchId/name` | search.ts |
| PATCH | `/api/search/:searchId/clockwork-project` | search.ts |
| PATCH | `/api/search/session/:sessionId/confidential` | search.ts |
| PUT | `/api/search/:id/table-config` | search.ts |
| PUT | `/api/search/:id/map-positions` | search.ts |
| PUT | `/api/search/:id/satellite-hierarchies` | search.ts |
| PUT | `/api/search/:id/satellite-orders` | search.ts |
| GET | `/api/search-history` | searchQueries.ts |
| GET | `/api/search-history/:id/load` | searchQueries.ts — full results for a query |
| GET | `/api/search-results/:id` | searchQueries.ts |
| POST | `/api/search-queries/bulk-delete` | searchQueries.ts |
| DELETE | `/api/search-queries/:id/results` | searchQueries.ts |

## Dashboard
| Method | Path | Module |
|--------|------|--------|
| GET | `/api/dashboard/:searchId` | dashboard.ts — country/title/revenue breakdowns; report-title gen (OpenAI, optional) |

## Clockwork CRM
| Method | Path | Module |
|--------|------|--------|
| GET | `/api/clockwork/projects` | clockwork.ts |
| GET | `/api/clockwork/projects/:projectId/people` | clockwork.ts |
| GET | `/api/clockwork/diagnostics` | clockwork.ts |
| GET | `/api/clockwork/diagnostics/project/:clockworkProjectId` | clockwork.ts |
| GET | `/api/clockwork/explore/:clockworkProjectId` | clockwork.ts |

## Enrichment (Clockwork matching)
| Method | Path | Module |
|--------|------|--------|
| POST | `/api/enrichment/match` | enrichment.ts — `?searchId=&clockworkProjectId=` → `{ confirmed, possible, noMatch }` |
| POST | `/api/enrichment/confirm` | enrichment.ts — persist enriched exec fields |
| POST | `/api/enrichment/create-from-clockwork` | enrichment.ts |
| POST | `/api/enrichment/import-candidate` | enrichment.ts |

## Import
| Method | Path | Module |
|--------|------|--------|
| POST | `/api/import-project` | importProject.ts — Excel/CSV column-mapped bulk insert |

---

## SSE contract — `GET /api/search/enhanced-stream`

Emitter: `server/services/pipeline/seedListSearch.ts:86-194` (`runSeedListEnhancedStream`). Consumer: `client/src/lib/useSearchStream.ts`. Each SSE message is `data: <json>\n\n` where json = `{ type, message?, data?, timestamp }`.

**Event types the client handles (the contract — reproduce exactly):**

| `type` | `data` payload | Client effect (useSearchStream.ts) |
|--------|----------------|-------------------------------------|
| `status` | `{}` (message only) | progress text |
| `search_created` | `{ searchQueryId }` | store searchQueryId |
| `intent_extracted` | `{ intent: InferredIntent }` | set search intent |
| `adjacent_sector_found` | `{ adjacentSectors: string[] }` | universe banner |
| `company_found` | `{ companyName \| name, sector, relevanceType }` | skeleton placeholder |
| `company_enriched` | `{ company: StreamCompany }` | add/replace company card |
| `executive_found` | `{ executive, companyId }` | attach exec to company |
| `no_results` | `{ totalCompanies:0, searchQueryId, noResultsReason }` | end + show reason |
| `search_complete` / `done` | `{ totalCompanies, searchQueryId }` | finalize |
| `error` | `{}` (message) | error state |

`StreamCompany` shape: see `seedListSearch.ts:162-181` (id, name, sector, country, geography, revenue, employees, website, summary, latitude, longitude, relevanceType, relevanceRationale, confidenceScore, isUserAccepted, isUserRejected, executives[], isNew).

**Parity test:** record the full event stream for a fixed query from the old endpoint; assert the new endpoint emits the same `type` sequence and matching `data` shapes (LLM filter mocked from fixtures — see STEP-08).
