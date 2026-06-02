import { storage, type EnrichedCompanyMatch } from "../../storage";
import type { InferredIntent, InsertCompany } from "@shared/schema";
import { applyCoordinateFallback } from "../coordinateFallback";
import { extractEnrichmentFilter, type EnrichmentFilter } from "./enrichmentFilter";

// Map a revenue band (e.g. "$250M-1B") or numeric estimate to a revenue string
// the rest of the app stores. Prefer the estimate; fall back to the band label.
function revenueValue(row: EnrichedCompanyMatch): string | null {
  if (row.revenueEstimateUsd != null) return String(row.revenueEstimateUsd);
  return row.revenueBand ?? null;
}

function enrichedRowToInsertCompany(row: EnrichedCompanyMatch): InsertCompany {
  const fallback = applyCoordinateFallback({ city: row.hqCity ?? undefined, country: row.country });
  return {
    name: row.companyName,
    sector: row.primarySector,
    businessType: null,
    country: row.country,
    region: row.hqCity ?? null,
    streetAddress: row.address ?? null,
    latitude: fallback.latitude?.toString() ?? null,
    longitude: fallback.longitude?.toString() ?? null,
    locationPrecision: fallback.locationPrecision,
    revenue: row.revenueEstimateUsd != null ? String(row.revenueEstimateUsd) : null,
    revenueRange: row.revenueBand ?? null,
    revenueCurrency: "USD",
    revenueFiscalYear: null,
    employees: row.employeeCountEstimate ?? null,
    companySize: row.employeeBand ?? null,
    website: row.website ?? null,
    summary: row.businessDescription ?? row.tagline ?? null,
    // company_enrichment.confidence is 0-1; companies.confidence is a 1-10 scale.
    confidence: Math.max(1, Math.round(row.confidence * 10)),
  };
}

function filterToInferredIntent(filter: EnrichmentFilter): InferredIntent {
  return {
    primarySectors: filter.primarySectors,
    adjacentSectors: filter.adjacentSectors,
    inferredSectors: [],
    targetGeographies: filter.countries,
    commercialRole: "any",
    searchRationale: filter.searchRationale,
    confidenceScore: 0.85,
    keyInclusions: filter.subTags,
    keyExclusions: [],
  };
}

function relevanceRationale(row: EnrichedCompanyMatch, filter: EnrichmentFilter): string {
  if (row.relevanceType === "Adjacent") {
    return `Adjacent sector (${row.primarySector}) to the target. ${filter.searchRationale}`;
  }
  return filter.searchRationale;
}

export async function* runSeedListSearch(
  query: string,
  limit: number,
  searchQueryId: number,
): AsyncGenerator<any> {
  yield { type: "status", data: { message: "Understanding your query...", progress: 5 } };

  const filter = await extractEnrichmentFilter(query);
  console.log("[EnrichedSearch] Filter:", JSON.stringify(filter, null, 2));
  yield {
    type: "status",
    data: {
      message: `Sectors: ${filter.primarySectors.join(", ") || "any"}`,
      progress: 15,
      intent: filterToInferredIntent(filter),
    },
  };

  yield { type: "status", data: { message: "Querying enriched companies...", progress: 30 } };

  let rows: EnrichedCompanyMatch[] = [];
  try {
    rows = await storage.queryEnrichedCompanies(filter, limit);
    console.log(`[EnrichedSearch] Fetched ${rows.length} enriched rows`);
  } catch (err: any) {
    console.error(`[EnrichedSearch] Query failed: ${err?.message ?? err}`);
    yield {
      type: "error",
      data: { message: `Failed to load companies: ${err?.message ?? err}`, code: "ENRICHED_QUERY_FAILED" },
    };
    return;
  }

  if (rows.length === 0) {
    yield { type: "status", data: { message: "No matching companies found", progress: 100 } };
    yield {
      type: "complete",
      data: { status: "complete", companiesFound: 0, companiesPersisted: 0, newCompanies: 0, searchQueryId },
    };
    return;
  }

  yield { type: "source", data: { count: rows.length } };
  yield { type: "status", data: { message: "Saving results...", progress: 60 } };

  let persistedCount = 0;
  let newCount = 0;

  const BATCH_SIZE = 5;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (row) => {
        try {
          const companyData = enrichedRowToInsertCompany(row);
          const { company, isNew } = await storage.upsertCompanyNonDestructive(
            companyData,
            searchQueryId,
            { country: 7, sector: 7 },
          );
          return { company, isNew };
        } catch (err: any) {
          console.error(`[EnrichedSearch] Failed to persist "${row.companyName}":`, err?.message ?? err);
          return null;
        }
      }),
    );

    for (const r of results) {
      if (!r) continue;
      persistedCount++;
      if (r.isNew) newCount++;
      yield {
        type: "company",
        data: {
          id: r.company.id,
          name: r.company.name,
          country: r.company.country,
          sector: r.company.sector,
          revenue: r.company.revenue,
          employees: r.company.employees,
          latitude: r.company.latitude,
          longitude: r.company.longitude,
          isNew: r.isNew,
        },
      };
    }
  }

  await storage.updateSearchQueryResultCount(searchQueryId, persistedCount);

  yield { type: "status", data: { message: "Search complete", progress: 100 } };
  yield {
    type: "complete",
    data: {
      status: "complete",
      companiesFound: rows.length,
      companiesPersisted: persistedCount,
      newCompanies: newCount,
      searchQueryId,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced-stream-compatible generator
// Emits the event shape consumed by client/src/lib/useSearchStream.ts
// (search_created / intent_extracted / adjacent_sector_found / company_found /
//  company_enriched / search_complete). Data comes from company_enrichment.
// ─────────────────────────────────────────────────────────────────────────────
interface EnhancedEvent {
  type: string;
  message?: string;
  data?: any;
  timestamp: string;
}

function emit(type: string, message: string, data?: any): EnhancedEvent {
  return { type, message, data, timestamp: new Date().toISOString() };
}

export async function* runSeedListEnhancedStream(
  query: string,
  searchQueryId: number,
  limit: number = 10,
  signal?: AbortSignal,
  sessionId?: string,
): AsyncGenerator<EnhancedEvent> {
  yield emit("status", "Understanding your query...");

  const filter = await extractEnrichmentFilter(query);
  console.log("[EnrichedSearch] Filter:", JSON.stringify(filter, null, 2));
  yield emit("intent_extracted", `Sectors: ${filter.primarySectors.join(", ") || "any"}`, {
    intent: filterToInferredIntent(filter),
  });

  // Surface AI-suggested adjacent sectors (the universe screen's banner).
  if (filter.adjacentSectors.length > 0) {
    yield emit(
      "adjacent_sector_found",
      `AI suggests ${filter.adjacentSectors.length} adjacent sectors`,
      { adjacentSectors: filter.adjacentSectors },
    );
  }

  if (signal?.aborted) return;

  yield emit("status", "Querying enriched companies...");

  let rows: EnrichedCompanyMatch[] = [];
  try {
    rows = await storage.queryEnrichedCompanies(filter, limit);
    console.log(`[EnrichedSearch] Fetched ${rows.length} enriched rows`);
  } catch (err: any) {
    console.error(`[EnrichedSearch] Query failed: ${err?.message ?? err}`);
    yield emit("error", `Failed to load companies: ${err?.message ?? err}`);
    return;
  }

  if (rows.length === 0) {
    yield emit("search_complete", "No matching companies found", { totalCompanies: 0, searchQueryId });
    return;
  }

  for (const row of rows) {
    if (signal?.aborted) return;
    yield emit("company_found", `Found: ${row.companyName}`, {
      companyName: row.companyName,
      name: row.companyName,
      sector: row.primarySector,
      relevanceType: row.relevanceType,
    });
  }

  let persistedCount = 0;

  for (const row of rows) {
    if (signal?.aborted) return;
    try {
      const companyData = { ...enrichedRowToInsertCompany(row), searchSessionId: sessionId ?? null };
      const { company, isNew } = await storage.upsertCompanyNonDestructive(
        companyData,
        searchQueryId,
        { country: 7, sector: 7 },
      );
      persistedCount++;
      const fallback = applyCoordinateFallback({ city: row.hqCity ?? undefined, country: row.country });
      const streamCompany = {
        id: company.id,
        name: company.name,
        sector: company.sector,
        country: company.country,
        geography: company.region ?? company.country,
        revenue: company.revenue ?? revenueValue(row),
        employees: company.employees,
        website: company.website ?? row.website ?? null,
        summary: company.summary ?? row.businessDescription ?? null,
        latitude: company.latitude ?? (fallback.latitude?.toString() ?? null),
        longitude: company.longitude ?? (fallback.longitude?.toString() ?? null),
        relevanceType: row.relevanceType,
        relevanceRationale: relevanceRationale(row, filter),
        confidenceScore: row.confidence,
        isUserAccepted: false,
        isUserRejected: false,
        executives: [] as Array<{ name: string; title: string }>,
        isNew,
      };
      yield emit("company_enriched", `Classified: ${company.name}`, { company: streamCompany });
    } catch (err: any) {
      console.error(`[EnrichedSearch] Failed to persist "${row.companyName}":`, err?.message ?? err);
    }
  }

  await storage.updateSearchQueryResultCount(searchQueryId, persistedCount);

  yield emit("search_complete", "Search complete", {
    totalCompanies: persistedCount,
    searchQueryId,
  });
}
