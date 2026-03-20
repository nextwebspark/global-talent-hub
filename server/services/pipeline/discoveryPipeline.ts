import { storage } from "../../storage";
import type { ISearchProvider, SearchIntent, EnrichedCompany, PipelineResult, CompanyPersistResult } from './types';
import { SerperAdapter, createSerperAdapter } from './serperAdapter';
import { extractCompaniesNonDestructive, extractCompaniesFromSearchResults, extractExecutivesForCompany, preProcessListArticles, fetchAndClassifyPages } from './nonDropExtraction';
import { extractQueryIntent, checkCompanyAgainstIntent, checkCompaniesAgainstIntentBatch } from './queryIntent';
import type { QueryIntent } from './queryIntent';
import { applyCoordinateFallback } from '../coordinateFallback';
import type { InsertCompany, InsertExecutive } from '@shared/schema';

function extractCountriesFromRawQuery(query: string): string[] {
  const lower = query.toLowerCase();
  const found: string[] = [];
  const countryNames: Array<[string, string]> = [
    ['saudi arabia', 'Saudi Arabia'], ['saudi', 'Saudi Arabia'],
    ['united arab emirates', 'United Arab Emirates'], ['uae', 'United Arab Emirates'],
    ['qatar', 'Qatar'], ['kuwait', 'Kuwait'], ['bahrain', 'Bahrain'],
    ['oman', 'Oman'], ['egypt', 'Egypt'], ['jordan', 'Jordan'],
    ['lebanon', 'Lebanon'], ['iraq', 'Iraq'], ['turkey', 'Turkey'],
    ['united kingdom', 'United Kingdom'], ['uk', 'United Kingdom'],
    ['united states', 'United States'], ['usa', 'United States'],
    ['germany', 'Germany'], ['france', 'France'], ['india', 'India'],
    ['china', 'China'], ['japan', 'Japan'], ['singapore', 'Singapore'],
    ['australia', 'Australia'], ['canada', 'Canada'],
    ['south africa', 'South Africa'], ['nigeria', 'Nigeria'],
    ['brazil', 'Brazil'], ['mexico', 'Mexico'],
  ];
  const seen = new Set<string>();
  for (const [kw, name] of countryNames) {
    if (lower.includes(kw) && !seen.has(name)) {
      seen.add(name);
      found.push(name);
    }
  }
  return found;
}

function extractSectorFromRawQuery(query: string): string {
  const lower = query.toLowerCase();
  if (lower.includes('fashion') || lower.includes('luxury retail')) return 'luxury fashion';
  if (lower.includes('luxury') && (lower.includes('watch') || lower.includes('jewel'))) return 'luxury goods';
  if (lower.includes('luxury')) return 'luxury';
  if (lower.includes('fmcg') || lower.includes('consumer goods')) return 'FMCG';
  if (lower.includes('pharma')) return 'pharmaceutical';
  if (lower.includes('power generation') || lower.includes('energy')) return 'energy';
  if (lower.includes('technology') || lower.includes('tech')) return 'technology';
  if (lower.includes('automotive')) return 'automotive';
  if (lower.includes('real estate')) return 'real estate';
  if (lower.includes('food') || lower.includes('beverage')) return 'food and beverage';
  if (lower.includes('healthcare')) return 'healthcare';
  return 'general';
}

export interface DiscoveryPipelineConfig {
  searchProvider: ISearchProvider;
}

const REGION_EXPANSION: Record<string, string[]> = {
  'middle east': ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Egypt', 'Jordan', 'Lebanon'],
  'gcc': ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman'],
  'mena': ['United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Kuwait', 'Bahrain', 'Oman', 'Egypt', 'Jordan', 'Lebanon', 'Morocco', 'Tunisia'],
  'europe': ['United Kingdom', 'Germany', 'France', 'Switzerland', 'Italy', 'Spain', 'Netherlands'],
  'asia': ['China', 'Japan', 'Singapore', 'Hong Kong', 'India', 'South Korea', 'Malaysia', 'Thailand', 'Indonesia'],
  'asia pacific': ['China', 'Japan', 'Singapore', 'Hong Kong', 'India', 'South Korea', 'Australia', 'Malaysia', 'Thailand'],
  'southeast asia': ['Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'Philippines', 'Vietnam'],
  'north america': ['United States', 'Canada'],
  'latin america': ['Brazil', 'Mexico', 'Argentina', 'Colombia', 'Chile'],
  'africa': ['South Africa', 'Nigeria', 'Kenya', 'Egypt', 'Morocco'],
};

const COUNTRY_TO_REGION: Record<string, string> = {
  'united arab emirates': 'Middle East', 'saudi arabia': 'Middle East', 'qatar': 'Middle East',
  'kuwait': 'Middle East', 'bahrain': 'Middle East', 'oman': 'Middle East',
  'egypt': 'Middle East', 'jordan': 'Middle East', 'lebanon': 'Middle East',
  'iraq': 'Middle East', 'morocco': 'Middle East', 'tunisia': 'Middle East',
  'united kingdom': 'Europe', 'germany': 'Europe', 'france': 'Europe',
  'switzerland': 'Europe', 'italy': 'Europe', 'spain': 'Europe', 'netherlands': 'Europe',
  'china': 'Asia', 'japan': 'Asia', 'singapore': 'Asia', 'hong kong': 'Asia',
  'india': 'Asia', 'south korea': 'Asia', 'malaysia': 'Asia', 'thailand': 'Asia',
  'indonesia': 'Asia', 'philippines': 'Asia', 'vietnam': 'Asia', 'taiwan': 'Asia',
  'australia': 'Asia Pacific', 'new zealand': 'Asia Pacific',
  'united states': 'North America', 'canada': 'North America',
  'brazil': 'Latin America', 'mexico': 'Latin America', 'argentina': 'Latin America',
  'colombia': 'Latin America', 'chile': 'Latin America',
  'south africa': 'Africa', 'nigeria': 'Africa', 'kenya': 'Africa',
  'turkey': 'Europe',
};

function splitIntoRegionGroups(countries: string[]): string[][] {
  if (countries.length <= 1) return [countries];

  const broadRegions = countries.filter(c => REGION_EXPANSION[c.toLowerCase()]);
  const specificCountries = countries.filter(c => !REGION_EXPANSION[c.toLowerCase()]);

  if (broadRegions.length > 0) {
    const groups: string[][] = [];
    for (const region of broadRegions) {
      groups.push([region]);
    }
    if (specificCountries.length > 0) {
      const regionMap = new Map<string, string[]>();
      for (const country of specificCountries) {
        const region = COUNTRY_TO_REGION[country.toLowerCase()] || 'Other';
        const existingGroup = groups.find(g => {
          const groupRegion = REGION_EXPANSION[g[0]?.toLowerCase()];
          return groupRegion && groupRegion.some(c => c.toLowerCase() === country.toLowerCase());
        });
        if (!existingGroup) {
          if (!regionMap.has(region)) regionMap.set(region, []);
          regionMap.get(region)!.push(country);
        }
      }
      for (const [, countryList] of regionMap) {
        groups.push(countryList);
      }
    }
    return groups;
  }

  const regionMap = new Map<string, string[]>();
  for (const country of countries) {
    const region = COUNTRY_TO_REGION[country.toLowerCase()] || 'Other';
    if (!regionMap.has(region)) regionMap.set(region, []);
    regionMap.get(region)!.push(country);
  }

  if (regionMap.size <= 1) return [countries];
  return Array.from(regionMap.values());
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

  private buildRegionFocusedQuery(originalQuery: string, regionCountries: string[], allIntentCountries: string[]): string {
    let focused = originalQuery;
    const keepTerms = new Set(regionCountries.map(c => c.toLowerCase()));

    const geographyTermsToRemove = [
      ...Object.keys(REGION_EXPANSION),
      ...allIntentCountries.map(c => c.toLowerCase()),
    ].filter(term => !keepTerms.has(term));

    for (const term of geographyTermsToRemove) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      focused = focused.replace(regex, '');
    }
    focused = focused.replace(/,\s*,/g, ',').replace(/,\s*and\s*,/g, ',')
      .replace(/\band\s+and\b/gi, 'and').replace(/,\s*$/g, '')
      .replace(/^\s*,/g, '').replace(/\s+/g, ' ').trim();
    focused = focused.replace(/\s*,\s*and\s*$/i, '').replace(/\s*,\s*$/g, '').trim();
    return focused;
  }

  private async searchAndExtractForRegion(
    query: string,
    regionIntent: QueryIntent,
    regionLabel: string,
    regionLimit: number,
    allIntentCountries: string[] = [],
  ): Promise<{ companies: EnrichedCompany[]; searchContext: string; llmAvailable: boolean }> {
    const focusedQuery = this.buildRegionFocusedQuery(query, regionIntent.countries, allIntentCountries);
    console.log(`[Pipeline:${regionLabel}] Searching with limit=${regionLimit}, countries=${regionIntent.countries.join(', ')}, query="${focusedQuery}"`);

    let searchResponse;
    try {
      searchResponse = await this.searchProvider.searchWithAnswer?.(focusedQuery, 15, regionIntent);
      if (!searchResponse) throw new Error('Search provider does not support searchWithAnswer');
      console.log(`[Pipeline:${regionLabel}] Search returned ${searchResponse.results.length} results`);
    } catch (error: any) {
      console.error(`[Pipeline:${regionLabel}] Search failed:`, error.message);
      return { companies: [], searchContext: '', llmAvailable: true };
    }

    if (searchResponse.results.length === 0) {
      return { companies: [], searchContext: '', llmAvailable: true };
    }

    const [preExtractedNames, fetchedPages] = await Promise.all([
      preProcessListArticles(searchResponse.results, query, regionIntent)
        .then(names => {
          if (names.length > 0) console.log(`[Pipeline:${regionLabel}] Pre-extracted: ${names.join(', ')}`);
          return names;
        })
        .catch((preError: any) => {
          console.warn(`[Pipeline:${regionLabel}] Pre-processing failed: ${preError.message}`);
          return [] as string[];
        }),
      fetchAndClassifyPages(searchResponse.results, 8)
        .then(pages => {
          console.log(`[Pipeline:${regionLabel}] Fetched ${pages.length} pages for extraction`);
          return pages;
        })
        .catch((fetchError: any) => {
          console.warn(`[Pipeline:${regionLabel}] Page fetching failed: ${fetchError.message}`);
          return [] as Array<{ url: string; content: string; sourceType: string; score: number }>;
        }),
    ]);

    const heuristicCompanies = extractCompaniesFromSearchResults(
      searchResponse.results,
      query,
      regionIntent,
      regionLimit,
      searchResponse.answer,
      preExtractedNames
    );

    let searchContext = '';
    if (preExtractedNames.length > 0) {
      searchContext += `=== KNOWN COMPANIES FROM ARTICLES ===\n${preExtractedNames.join('\n')}\n\n`;
    }
    if (searchResponse.answer) {
      searchContext += `=== AI ANALYSIS ===\n${searchResponse.answer}\n\n`;
    }
    searchContext += '=== SOURCE DETAILS ===\n';
    searchContext += searchResponse.results.map((r: any, i: number) => {
      let content = `[${i + 1}] ${r.title}\nURL: ${r.url}\nSource type: ${r.sourceType || 'unknown'}\nScore: ${r.score || 1}\nSummary: ${r.snippet}`;
      if (r.rawContent && r.rawContent.length > 100) {
        content += `\nContent:\n${r.rawContent.substring(0, 2000)}`;
      }
      return content;
    }).join('\n\n');

    let enrichedCompanies: EnrichedCompany[] = heuristicCompanies;
    let llmAvailable = true;

    try {
      const llmCompanies = await extractCompaniesNonDestructive(searchContext, focusedQuery, regionIntent, regionLimit, fetchedPages);
      if (llmCompanies.length > 0) {
        console.log(`[Pipeline:${regionLabel}] LLM found ${llmCompanies.length}, merging with ${heuristicCompanies.length} heuristic`);
        enrichedCompanies = mergeLlmIntoHeuristic(heuristicCompanies, llmCompanies, regionLimit);
      }
    } catch (llmError: any) {
      llmAvailable = false;
      console.warn(`[Pipeline:${regionLabel}] LLM unavailable: ${llmError.message}`);
    }

    console.log(`[Pipeline:${regionLabel}] Extracted ${enrichedCompanies.length} companies`);
    return { companies: enrichedCompanies, searchContext, llmAvailable };
  }

  async *execute(
    query: string,
    limit: number,
    searchQueryId: number
  ): AsyncGenerator<any> {

    yield { type: 'status', data: { message: 'Understanding your search...', progress: 5 } };

    let intent: QueryIntent;
    try {
      intent = await extractQueryIntent(query);
      console.log(`[Pipeline] Intent: ${intent.validResultDescription}`);
      console.log(`[Pipeline] Sector: ${intent.sector} | Role: ${intent.commercialRole}`);
      console.log(`[Pipeline] Include: ${intent.includeTypes.join('; ')}`);
      console.log(`[Pipeline] Exclude: ${intent.excludeTypes.join('; ')}`);
    } catch (intentError: any) {
      console.warn(`[Pipeline] Intent extraction failed, using heuristic defaults: ${intentError.message}`);
      const heuristicCountries = extractCountriesFromRawQuery(query);
      const heuristicSector = extractSectorFromRawQuery(query);
      intent = {
        entityType: 'company',
        commercialRole: 'any',
        sector: heuristicSector,
        countries: heuristicCountries,
        includeTypes: [],
        excludeTypes: [],
        exampleInclusions: [],
        exampleExclusions: [],
        executiveRole: null,
        validResultDescription: 'A company relevant to the query',
        invalidResultDescription: 'A company not relevant to the query',
      };
    }

    const regionGroups = splitIntoRegionGroups(intent.countries);
    const isMultiRegion = regionGroups.length > 1;

    if (isMultiRegion) {
      console.log(`[Pipeline] Multi-region search detected: ${regionGroups.length} region groups: ${regionGroups.map(g => g.join('/')).join(' | ')}`);
    }

    yield { type: 'status', data: { message: 'Searching...', progress: 10 } };

    let allEnrichedCompanies: EnrichedCompany[] = [];
    let combinedSearchContext = '';
    let llmAvailable = true;

    if (isMultiRegion) {
      const perRegionLimit = Math.max(3, Math.ceil(limit / regionGroups.length));
      let progressBase = 10;
      const progressPerRegion = Math.floor(40 / regionGroups.length);

      for (let i = 0; i < regionGroups.length; i++) {
        const group = regionGroups[i];
        const regionLabel = group.join('/');
        const regionIntent: QueryIntent = {
          ...intent,
          countries: group,
        };

        yield { type: 'status', data: { message: `Searching ${regionLabel}...`, progress: progressBase + (i * progressPerRegion) } };

        const result = await this.searchAndExtractForRegion(query, regionIntent, regionLabel, perRegionLimit, intent.countries);
        allEnrichedCompanies.push(...result.companies);
        if (result.searchContext) combinedSearchContext += `\n=== REGION: ${regionLabel} ===\n${result.searchContext}\n`;
        if (!result.llmAvailable) llmAvailable = false;
      }

      const deduped = new Map<string, EnrichedCompany>();
      for (const company of allEnrichedCompanies) {
        const key = company.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!deduped.has(key) || (company.overallConfidence > (deduped.get(key)?.overallConfidence ?? 0))) {
          deduped.set(key, company);
        }
      }
      allEnrichedCompanies = Array.from(deduped.values()).slice(0, limit);
      console.log(`[Pipeline] Multi-region merged: ${allEnrichedCompanies.length} unique companies from ${regionGroups.length} regions`);

    } else {
      const result = await this.searchAndExtractForRegion(query, intent, intent.countries.join('/') || 'global', limit);
      allEnrichedCompanies = result.companies;
      combinedSearchContext = result.searchContext;
      llmAvailable = result.llmAvailable;
    }

    yield { type: 'source', data: { count: allEnrichedCompanies.length } };

    if (intent.excludeTypes.length > 0 && llmAvailable) {
      yield { type: 'status', data: { message: 'Validating results...', progress: 55 } };

      const highConfidence: EnrichedCompany[] = [];
      const toValidate: EnrichedCompany[] = [];
      for (const company of allEnrichedCompanies) {
        if (company.overallConfidence >= 7) {
          highConfidence.push(company);
        } else {
          toValidate.push(company);
        }
      }

      if (toValidate.length > 0) {
        try {
          const validationResults = await checkCompaniesAgainstIntentBatch(
            toValidate.map(c => c.canonicalName),
            intent
          );
          for (const company of toValidate) {
            const isValid = validationResults.get(company.canonicalName) ?? true;
            if (isValid) {
              highConfidence.push(company);
            } else {
              console.log(`[Pipeline] Final validation rejected: ${company.canonicalName}`);
            }
          }
        } catch {
          highConfidence.push(...toValidate);
        }
      }

      allEnrichedCompanies = highConfidence;
    }

    if (allEnrichedCompanies.length === 0) {
      yield { type: 'error', data: { message: 'Could not extract company information', code: 'EXTRACTION_FAILED' } };
      return;
    }

    console.log(`[Pipeline] Final: ${allEnrichedCompanies.length} companies`);

    yield { type: 'status', data: { message: 'Saving results...', progress: 60 } };

    const persistedCompanies: CompanyPersistResult[] = [];
    const persistedWithContext: Array<{ companyId: number; canonicalName: string; country?: string }> = [];
    let newCount = 0;

    const PERSIST_BATCH_SIZE = 5;
    for (let i = 0; i < allEnrichedCompanies.length; i += PERSIST_BATCH_SIZE) {
      const batch = allEnrichedCompanies.slice(i, i + PERSIST_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (enriched) => {
          try {
            const companyData = await this.transformToInsertCompany(enriched);

            const fieldConfidences: Record<string, number> = {};
            if (enriched.revenue.confidence > 0) fieldConfidences['revenue'] = enriched.revenue.confidence;
            if (enriched.employees.confidence > 0) fieldConfidences['employees'] = enriched.employees.confidence;
            if (enriched.country.confidence > 0) fieldConfidences['country'] = enriched.country.confidence;
            if (enriched.sector.confidence > 0) fieldConfidences['sector'] = enriched.sector.confidence;
            if (enriched.summary.confidence > 0) fieldConfidences['summary'] = enriched.summary.confidence;
            if (enriched.website.confidence > 0) fieldConfidences['website'] = enriched.website.confidence;

            const { company, isNew } = await storage.upsertCompanyNonDestructive(
              companyData,
              searchQueryId,
              fieldConfidences
            );

            return { company, isNew, enriched, error: null as Error | null };
          } catch (error: any) {
            console.error(`[Pipeline] Failed to persist "${enriched.canonicalName}":`, error);
            return { company: null, isNew: false, enriched, error };
          }
        })
      );

      for (const result of batchResults) {
        if (!result.company || result.error) continue;
        const { company, isNew, enriched } = result;

        if (isNew) newCount++;

        persistedCompanies.push({
          id: company.id,
          isNew,
          company: { name: company.name, country: company.country, sector: company.sector }
        });

        persistedWithContext.push({
          companyId: company.id,
          canonicalName: enriched.canonicalName,
          country: enriched.country.value || undefined,
        });

        yield {
          type: 'company',
          data: {
            id: company.id, name: company.name, country: company.country,
            sector: company.sector, revenue: company.revenue, employees: company.employees,
            latitude: company.latitude, longitude: company.longitude, isNew,
          }
        };
      }
    }

    if (llmAvailable && persistedWithContext.length > 0) {
      yield { type: 'status', data: { message: 'Finding executives...', progress: 75 } };

      const EXEC_BATCH_SIZE = 4;
      for (let i = 0; i < persistedWithContext.length; i += EXEC_BATCH_SIZE) {
        const batch = persistedWithContext.slice(i, i + EXEC_BATCH_SIZE);
        const execResults = await Promise.all(
          batch.map(async (ctx) => {
            try {
              const executives = await this.extractAndPersistExecutives(
                ctx.companyId,
                ctx.canonicalName,
                combinedSearchContext,
                intent,
                ctx.country
              );
              return { companyId: ctx.companyId, count: executives.length };
            } catch (execError: any) {
              console.warn(`[Pipeline] Executive extraction failed for "${ctx.canonicalName}": ${execError.message}`);
              return { companyId: ctx.companyId, count: 0 };
            }
          })
        );

        for (const result of execResults) {
          if (result.count > 0) {
            yield { type: 'executives', data: { companyId: result.companyId, count: result.count } };
          }
        }
      }
    }

    await storage.updateSearchQueryResultCount(searchQueryId, persistedCompanies.length);

    yield { type: 'status', data: { message: 'Search complete', progress: 100 } };
    yield {
      type: 'complete',
      data: {
        status: 'complete',
        companiesFound: allEnrichedCompanies.length,
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

    const safeInt = (v: any): number | null => {
      if (v === null || v === undefined) return null;
      const n = typeof v === 'number' ? v : parseInt(String(v));
      return isNaN(n) || !isFinite(n) ? null : n;
    };

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
      revenueFiscalYear: safeInt(enriched.revenue.fiscalYear),
      employees: safeInt(enriched.employees.value),
      website: enriched.website.value,
      summary: enriched.summary.value,
      confidence: safeInt(enriched.overallConfidence) ?? 5,
    };
  }

  private async extractAndPersistExecutives(
    companyId: number,
    companyName: string,
    searchContext: string,
    intent: QueryIntent,
    country?: string
  ): Promise<any[]> {
    try {
      const executives = await extractExecutivesForCompany(companyName, searchContext, intent, country);
      const persisted = [];

      for (const exec of executives) {
        if (!exec.name || exec.name.length < 2) continue;
        const executiveData: InsertExecutive = {
          companyId,
          name: exec.name,
          title: exec.title || 'Unknown',
          linkedin: exec.linkedinUrl || null,
          source: exec.sourceUrl || 'discovery',
          confidence: exec.confidence,
          gender: exec.gender || null,
          genderConfidence: exec.genderConfidence || null,
          ethnicity: exec.ethnicity || null,
          ethnicityConfidence: exec.ethnicityConfidence || null,
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
  if (!searchProvider) return null;
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