import { storage, type CompanySeedRow } from "../../storage";
import type { InferredIntent, InsertCompany } from "@shared/schema";
import { applyCoordinateFallback } from "../coordinateFallback";
import { extractQueryIntent, type QueryIntent } from "./queryIntent";

function seedRowToInsertCompany(row: CompanySeedRow): InsertCompany {
  const fallback = applyCoordinateFallback({ country: row.country });
  return {
    name: row.name,
    sector: row.sector,
    businessType: null,
    country: row.country,
    streetAddress: null,
    latitude: fallback.latitude?.toString() ?? null,
    longitude: fallback.longitude?.toString() ?? null,
    locationPrecision: fallback.locationPrecision,
    revenue: null,
    revenueCurrency: "USD",
    revenueFiscalYear: null,
    employees: null,
    website: row.website ?? null,
    summary: row.description ?? null,
    confidence: 6,
  };
}

export async function* runSeedListSearch(
  query: string,
  limit: number,
  searchQueryId: number,
): AsyncGenerator<any> {
  yield { type: "status", data: { message: "Capturing intent...", progress: 5 } };

  let intent: QueryIntent | null = null;
  try {
    intent = await extractQueryIntent(query);
    console.log("[SeedList] Intent:", JSON.stringify(intent, null, 2));
    yield {
      type: "status",
      data: {
        message: `Intent: ${intent.entityType}/${intent.commercialRole}`,
        progress: 15,
        intent,
      },
    };
  } catch (err: any) {
    console.warn(`[SeedList] Intent extraction failed, continuing with mock sample: ${err?.message ?? err}`);
    yield { type: "status", data: { message: "Intent skipped (mock mode)", progress: 15 } };
  }

  // TODO(phase-2): translate QueryIntent -> SQL filter (country IN intent.countries,
  //                sector ILIKE intent.sector, etc.). For now: blind first-N sample.
  yield { type: "status", data: { message: "Fetching seed sample...", progress: 30 } };

  let rows: CompanySeedRow[] = [];
  try {
    rows = await storage.getCompanySeedSample(limit);
    console.log(`[SeedList] Fetched ${rows.length} seed rows`);
  } catch (err: any) {
    console.error(`[SeedList] Seed fetch failed: ${err?.message ?? err}`);
    yield {
      type: "error",
      data: { message: `Failed to load seed companies: ${err?.message ?? err}`, code: "SEED_FETCH_FAILED" },
    };
    return;
  }

  if (rows.length === 0) {
    yield {
      type: "error",
      data: { message: "company_seed_list is empty", code: "SEED_EMPTY" },
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
          const companyData = seedRowToInsertCompany(row);
          const { company, isNew } = await storage.upsertCompanyNonDestructive(
            companyData,
            searchQueryId,
            { country: 7, sector: 7 },
          );
          return { company, isNew };
        } catch (err: any) {
          console.error(`[SeedList] Failed to persist "${row.name}":`, err?.message ?? err);
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
// (search_created / intent_extracted / company_found / company_enriched /
//  search_complete). No web search — all rows come from company_seed_list.
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

function queryIntentToInferredIntent(qi: QueryIntent): InferredIntent {
  return {
    primarySectors: qi.sector ? [qi.sector] : [],
    adjacentSectors: [],
    inferredSectors: [],
    targetGeographies: qi.countries ?? [],
    commercialRole: qi.commercialRole ?? "any",
    searchRationale: qi.validResultDescription ?? "",
    confidenceScore: 0.8,
    keyInclusions: qi.includeTypes ?? [],
    keyExclusions: qi.excludeTypes ?? [],
  };
}

export async function* runSeedListEnhancedStream(
  query: string,
  searchQueryId: number,
  limit: number = 10,
  signal?: AbortSignal,
  sessionId?: string,
): AsyncGenerator<EnhancedEvent> {
  yield emit("status", "Capturing intent...");

  let intent: QueryIntent | null = null;
  try {
    intent = await extractQueryIntent(query);
    console.log("[SeedList] Intent:", JSON.stringify(intent, null, 2));
    yield emit("intent_extracted", `Intent: ${intent.entityType}/${intent.commercialRole}`, {
      intent: queryIntentToInferredIntent(intent),
    });
  } catch (err: any) {
    console.warn(`[SeedList] Intent extraction failed, continuing with mock sample: ${err?.message ?? err}`);
    yield emit("status", "Intent skipped (mock mode)");
  }

  if (signal?.aborted) return;

  // TODO(phase-2): translate QueryIntent -> SQL filter (country IN intent.countries, sector ILIKE ...)
  yield emit("status", "Fetching seed sample...");

  let rows: CompanySeedRow[] = [];
  try {
    rows = await storage.getCompanySeedSample(limit);
    console.log(`[SeedList] Fetched ${rows.length} seed rows`);
  } catch (err: any) {
    console.error(`[SeedList] Seed fetch failed: ${err?.message ?? err}`);
    yield emit("error", `Failed to load seed companies: ${err?.message ?? err}`);
    return;
  }

  if (rows.length === 0) {
    yield emit("error", "company_seed_list is empty");
    return;
  }

  for (const row of rows) {
    if (signal?.aborted) return;
    yield emit("company_found", `Found: ${row.name}`, {
      companyName: row.name,
      name: row.name,
      sector: row.sector,
      relevanceType: "Direct",
    });
  }

  let persistedCount = 0;

  for (const row of rows) {
    if (signal?.aborted) return;
    try {
      const companyData = { ...seedRowToInsertCompany(row), searchSessionId: sessionId ?? null };
      const { company, isNew } = await storage.upsertCompanyNonDestructive(
        companyData,
        searchQueryId,
        { country: 7, sector: 7 },
      );
      persistedCount++;
      const fallback = applyCoordinateFallback({ country: row.country });
      const streamCompany = {
        id: company.id,
        name: company.name,
        sector: company.sector,
        country: company.country,
        geography: company.country,
        revenue: company.revenue,
        employees: company.employees,
        website: company.website ?? row.website ?? null,
        summary: company.summary ?? row.description ?? null,
        latitude: company.latitude ?? (fallback.latitude?.toString() ?? null),
        longitude: company.longitude ?? (fallback.longitude?.toString() ?? null),
        relevanceType: "Direct" as const,
        relevanceRationale: "Seeded from company_seed_list (mock mode)",
        confidenceScore: 0.6,
        isUserAccepted: false,
        isUserRejected: false,
        executives: [] as Array<{ name: string; title: string }>,
        isNew,
      };
      yield emit("company_enriched", `Classified: ${company.name}`, { company: streamCompany });
    } catch (err: any) {
      console.error(`[SeedList] Failed to persist "${row.name}":`, err?.message ?? err);
    }
  }

  await storage.updateSearchQueryResultCount(searchQueryId, persistedCount);

  yield emit("search_complete", "Search complete", {
    totalCompanies: persistedCount,
    searchQueryId,
  });
}
