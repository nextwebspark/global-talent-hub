import { storage } from "../../storage";
import type { ISearchProvider, SearchIntent, EnrichedCompany, PipelineResult, CompanyPersistResult } from './types';
import { SerperAdapter, createSerperAdapter } from './serperAdapter';
import { extractCompaniesNonDestructive, extractExecutivesForCompany } from './nonDropExtraction';
import { applyCoordinateFallback } from '../coordinateFallback';
import type { InsertCompany, InsertExecutive } from '@shared/schema';

export interface DiscoveryPipelineConfig {
  searchProvider: ISearchProvider;
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

    const enrichedCompanies = await extractCompaniesNonDestructive(searchContext, query, limit);
    
    if (enrichedCompanies.length === 0) {
      yield { type: 'error', data: { message: 'Could not extract company information', code: 'EXTRACTION_FAILED' } };
      return;
    }

    console.log(`[Pipeline] Extracted ${enrichedCompanies.length} companies (non-drop)`);

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

        if (enriched.summary.value) {
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
