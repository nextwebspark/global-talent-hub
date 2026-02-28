import { storage } from "../../storage";
import type { ISearchProvider, SearchIntent, EnrichedCompany, PipelineResult, CompanyPersistResult } from './types';
import { SerperAdapter, createSerperAdapter } from './serperAdapter';
import { extractCompaniesNonDestructive, extractCompaniesFromSearchResults, extractExecutivesForCompany } from './nonDropExtraction';
import { applyCoordinateFallback } from '../coordinateFallback';
import type { InsertCompany, InsertExecutive } from '@shared/schema';

export interface DiscoveryPipelineConfig {
  searchProvider: ISearchProvider;
}

function mergeLlmIntoHeuristic(
  heuristic: EnrichedCompany[],
  llm: EnrichedCompany[],
  limit: number
): EnrichedCompany[] {
  const merged = new Map<string, EnrichedCompany>();

  for (const company of llm) {
    const key = company.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '');
    merged.set(key, company);
  }

  for (const company of heuristic) {
    const key = company.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!merged.has(key)) {
      merged.set(key, company);
    } else {
      const existing = merged.get(key)!;
      if (!existing.country.value && company.country.value) existing.country = company.country;
      if (!existing.sector.value && company.sector.value) existing.sector = company.sector;
      if (!existing.revenue.value && company.revenue.value) existing.revenue = company.revenue;
      if (!existing.employees.value && company.employees.value) existing.employees = company.employees;
      if (!existing.website.value && company.website.value) existing.website = company.website;
      if (existing.sourceUrls.length === 0 && company.sourceUrls.length > 0) existing.sourceUrls = company.sourceUrls;
    }
  }

  return Array.from(merged.values()).slice(0, limit);
}

export class DiscoveryPipeline {
  private searchProvider: ISearchProvider;

  constructor(config: DiscoveryPipelineConfig) {
    this.searchProvider = config.searchProvider;
  }

  async *execute(
    query: string,
    limit: number,
    searchQueryId: number
  ): AsyncGenerator<any> {
    const intent: SearchIntent = {
      originalQuery: query,
      limit,
      entityType: 'company',
      rankingCriteria: ['revenue', 'relevance'],
    };

    yield { type: 'status', data: { message: 'Starting search...', progress: 5 } };

    let searchResponse;
    try {
      searchResponse = await this.searchProvider.searchWithAnswer?.(query, 15);
      if (!searchResponse) {
        throw new Error('Search provider does not support searchWithAnswer');
      }
      console.log(`[Pipeline] Search returned ${searchResponse.results.length} results`);
    } catch (error: any) {
      console.error('[Pipeline] Search failed:', error);
      yield { 
        type: 'error', 
        data: { message: error.message || 'Search failed', code: 'SEARCH_FAILED' } 
      };
      return;
    }

    if (searchResponse.results.length === 0) {
      yield { type: 'error', data: { message: 'No search results found', code: 'NO_RESULTS' } };
      return;
    }

    yield { 
      type: 'source', 
      data: { count: searchResponse.results.length } 
    };

    yield { type: 'status', data: { message: 'Extracting company information...', progress: 30 } };

    const heuristicCompanies = extractCompaniesFromSearchResults(
      searchResponse.results, query, limit, searchResponse.answer
    );

    let searchContext = '';
    if (searchResponse.answer) {
      searchContext += `=== AI ANALYSIS ===\n${searchResponse.answer}\n\n`;
    }
    searchContext += '=== SOURCE DETAILS ===\n';
    searchContext += searchResponse.results.map((r, i) => {
      let content = `[${i + 1}] ${r.title}\nURL: ${r.url}\nSummary: ${r.snippet}`;
      if (r.rawContent && r.rawContent.length > 100) {
        content += `\nContent:\n${r.rawContent.substring(0, 2000)}`;
      }
      return content;
    }).join('\n\n');

    let enrichedCompanies: EnrichedCompany[] = heuristicCompanies;
    let llmAvailable = true;

    try {
      const llmCompanies = await extractCompaniesNonDestructive(searchContext, query, limit);
      if (llmCompanies.length > 0) {
        console.log(`[Pipeline] LLM enriched ${llmCompanies.length} companies, merging with ${heuristicCompanies.length} heuristic results`);
        enrichedCompanies = mergeLlmIntoHeuristic(heuristicCompanies, llmCompanies, limit);
      }
    } catch (llmError: any) {
      llmAvailable = false;
      console.warn(`[Pipeline] LLM extraction unavailable (${llmError.message}), using heuristic results only`);
    }

    if (enrichedCompanies.length === 0) {
      yield { type: 'error', data: { message: 'Could not extract company information', code: 'EXTRACTION_FAILED' } };
      return;
    }

    console.log(`[Pipeline] Final: ${enrichedCompanies.length} companies (LLM ${llmAvailable ? 'available' : 'unavailable'})`);

    yield { type: 'status', data: { message: 'Persisting companies...', progress: 60 } };

    const persistedCompanies: CompanyPersistResult[] = [];
    let newCount = 0;

    for (const enriched of enrichedCompanies) {
      try {
        const companyData = await this.transformToInsertCompany(enriched);
        
        const { company, isNew } = await storage.upsertCompanyNonDestructive(
          companyData,
          searchQueryId
        );

        if (isNew) newCount++;

        persistedCompanies.push({
          id: company.id,
          isNew,
          company: {
            name: company.name,
            country: company.country,
            sector: company.sector,
          }
        });

        yield { 
          type: 'company', 
          data: { 
            id: company.id,
            name: company.name,
            country: company.country,
            sector: company.sector,
            revenue: company.revenue,
            employees: company.employees,
            latitude: company.latitude,
            longitude: company.longitude,
            isNew,
          } 
        };

        if (llmAvailable) {
          try {
            const executives = await this.extractAndPersistExecutives(
              company.id, 
              enriched.canonicalName, 
              searchContext
            );
            
            if (executives.length > 0) {
              yield { 
                type: 'executives', 
                data: { 
                  companyId: company.id,
                  count: executives.length,
                } 
              };
            }
          } catch (execError: any) {
            llmAvailable = false;
            console.warn(`[Pipeline] Executive extraction failed, skipping remaining: ${execError.message}`);
          }
        }

      } catch (error) {
        console.error(`[Pipeline] Failed to persist company "${enriched.canonicalName}":`, error);
      }
    }

    await storage.updateSearchQueryResultCount(searchQueryId, persistedCompanies.length);

    yield { type: 'status', data: { message: 'Search complete', progress: 100 } };

    yield { 
      type: 'complete', 
      data: { 
        status: 'complete',
        companiesFound: enrichedCompanies.length,
        companiesPersisted: persistedCompanies.length,
        newCompanies: newCount,
        searchQueryId,
      } 
    };
  }

  private async transformToInsertCompany(enriched: EnrichedCompany): Promise<InsertCompany> {
    let latitude = enriched.latitude.value;
    let longitude = enriched.longitude.value;
    let locationPrecision = 'unknown';

    if (latitude && longitude) {
      locationPrecision = 'exact';
    } else {
      const fallback = applyCoordinateFallback({
        city: enriched.city.value || undefined,
        country: enriched.country.value || undefined,
      });
      latitude = fallback.latitude || null;
      longitude = fallback.longitude || null;
      locationPrecision = fallback.locationPrecision;
    }

    return {
      name: enriched.canonicalName,
      sector: enriched.sector.value,
      businessType: enriched.businessType.value,
      country: enriched.country.value,
      streetAddress: enriched.streetAddress.value,
      latitude: latitude?.toString() || null,
      longitude: longitude?.toString() || null,
      locationPrecision,
      revenue: enriched.revenue.value?.toString() || null,
      revenueCurrency: enriched.revenue.currency,
      revenueFiscalYear: enriched.revenue.fiscalYear,
      employees: enriched.employees.value,
      website: enriched.website.value,
      summary: enriched.summary.value,
      confidence: enriched.overallConfidence,
    };
  }

  private async extractAndPersistExecutives(
    companyId: number,
    companyName: string,
    searchContext: string
  ): Promise<any[]> {
    try {
      const executives = await extractExecutivesForCompany(companyName, searchContext);
      const persisted = [];

      for (const exec of executives) {
        if (!exec.name || exec.name.length < 2) continue;

        const executiveData: InsertExecutive = {
          companyId,
          name: exec.name,
          title: exec.title || 'Unknown',
          source: exec.sourceUrl || 'discovery',
          confidence: exec.confidence,
        };

        try {
          const newExec = await storage.createExecutiveFromDiscovery(executiveData);
          persisted.push(newExec);
        } catch (error) {
          console.warn(`[Pipeline] Failed to persist executive "${exec.name}":`, error);
        }
      }

      return persisted;
    } catch (error) {
      console.error(`[Pipeline] Executive extraction failed for "${companyName}":`, error);
      return [];
    }
  }
}

export function createDiscoveryPipeline(): DiscoveryPipeline | null {
  const searchProvider = createSerperAdapter();
  if (!searchProvider) {
    return null;
  }
  return new DiscoveryPipeline({ searchProvider });
}

export async function* runDiscoveryPipeline(
  query: string,
  limit: number,
  searchQueryId: number
): AsyncGenerator<any> {
  const pipeline = createDiscoveryPipeline();
  if (!pipeline) {
    yield { type: 'error', data: { message: 'Search not configured', code: 'NOT_CONFIGURED' } };
    return;
  }

  yield* pipeline.execute(query, limit, searchQueryId);
}
