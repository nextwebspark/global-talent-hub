import OpenAI from "openai";
import { storage } from "../storage";
import { webSearchService, classifySourceTier, type WebSearchResult, type SourceTierClassification } from "./webSearch";
import { validateCompanyData } from "./discovery";
import { DEFAULT_MODEL, FALLBACK_MODELS, parseOpenRouterError } from "./discovery";
import type { SearchCriteria } from "./discovery";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

export interface RetrievalSource {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  tier: number;
  tierReason: string;
  documentType: string;
}

export interface ExtractedCompany {
  name: string;
  sector?: string;
  businessType?: string;
  country?: string;
  city?: string;
  streetAddress?: string;
  latitude?: number;
  longitude?: number;
  revenue?: number | null;
  revenueCurrency?: string | null;
  revenueFiscalYear?: number | null;
  revenueSource?: string | null;
  employees?: number | null;
  employeesSource?: string | null;
  confidence?: number;
  relevanceReason?: string;
  sourceUrls: string[];
  sourceTier: number;
}

const EXTRACTION_PROMPT = `You are a data extraction expert. Your ONLY job is to extract company information from the provided web search results.

CRITICAL RULES:
1. You can ONLY extract information that is explicitly stated in the provided sources
2. You MUST NOT invent, hallucinate, or guess any company names, revenues, or metrics
3. If a piece of information is not in the sources, set it to null
4. Revenue is ONLY valid if:
   - The source explicitly uses the word "revenue" (not AUM, funding, valuation, contract value)
   - The currency is stated (e.g., USD, AED, SAR)
   - The year is stated (e.g., FY2023, 2024)
   - The source is Tier 1 (annual report, SEC filing) or Tier 2 (reputable business news)
5. For Tier 3 sources (general web), you can ONLY extract the company name - all metrics must be null
6. Include the source URL for every piece of data you extract

OUTPUT FORMAT:
Return a JSON object with a "companies" array. Each company must have:
- name: The exact company name from the source
- sourceUrls: Array of URLs where this company was found
- sourceTier: The best (lowest) tier among sources (1=regulatory, 2=business news, 3=web)
- All other fields should be null unless explicitly found in Tier 1 or Tier 2 sources with proper attribution`;

const VERIFICATION_PROMPT = `You are verifying company financial data from authoritative sources.

Your task: Extract and verify the revenue figure for the specified company from the provided search results.

RULES:
1. Only accept revenue if:
   - The word "revenue" is explicitly used (NOT profit, sales, AUM, valuation, funding)
   - The exact figure is stated with currency (e.g., "$2.5 billion", "AED 23.4 billion")
   - The fiscal year is stated (e.g., FY2023, 2024, fiscal year ended March 2024)
   - The source is credible (annual report, press release, regulatory filing, major news outlet)
2. If multiple figures exist, prefer:
   - More recent year
   - Higher tier source (annual report > news article)
3. If no valid revenue is found, return revenue: null

OUTPUT FORMAT:
{
  "verified": true/false,
  "revenue": number or null,
  "revenueCurrency": "USD"/"AED"/etc or null,
  "revenueFiscalYear": 2023/2024/etc or null,
  "revenueSource": "exact source description" or null,
  "verificationNotes": "explanation of what was found or why verification failed"
}`;

async function callLlmWithRetry(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  schema: any,
  primaryModel: string = DEFAULT_MODEL
): Promise<{ data: any; model: string; retried: boolean }> {
  const models = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)];
  
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isRetry = i > 0;
    
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`[RetrievalDiscovery] Calling ${model} (attempt ${attempt + 1})`);
        
        const response = await openrouter.chat.completions.create({
          model,
          messages,
          max_tokens: 8000,
          temperature: 0.1,
          response_format: schema ? {
            type: "json_schema",
            json_schema: {
              name: "extraction_result",
              strict: true,
              schema
            }
          } : { type: "json_object" }
        });
        
        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("Empty response from LLM");
        }
        
        const data = JSON.parse(content);
        return { data, model, retried: isRetry || attempt > 0 };
        
      } catch (error: any) {
        const parsed = parseOpenRouterError(error);
        console.error(`[RetrievalDiscovery] ${model} failed: ${parsed.code} - ${parsed.message}`);
        
        if (attempt === 0 && parsed.code !== "MODEL_NOT_FOUND") {
          console.log(`[RetrievalDiscovery] Retrying ${model}...`);
          continue;
        }
        
        if (i < models.length - 1) {
          console.log(`[RetrievalDiscovery] Falling back to next model...`);
          break;
        }
        
        throw new Error(`All models failed. Last error: ${parsed.message}`);
      }
    }
  }
  
  throw new Error("No models available");
}

export async function* discoverCompaniesWithRetrieval(
  criteria: SearchCriteria,
  searchQueryId: number,
  selectedModel: string = DEFAULT_MODEL,
  originalQuery: string
): AsyncGenerator<{ type: 'source' | 'company' | 'verification' | 'status' | 'error' | 'complete', data: any }> {
  if (!originalQuery?.trim()) {
    yield { type: 'error', data: { message: 'Original query is required' } };
    return;
  }
  
  const query = originalQuery.trim();
  const limit = criteria.limit || 10;
  
  yield { type: 'status', data: { message: 'Checking web search configuration...', progress: 2 } };
  
  if (!webSearchService.isConfigured()) {
    yield { type: 'status', data: { message: 'Web search not configured - falling back to LLM-only mode', progress: 5, warning: true } };
    return;
  }
  
  yield { type: 'status', data: { message: 'Searching the web for companies...', progress: 5 } };
  
  let searchResults: Array<WebSearchResult & SourceTierClassification>;
  try {
    const rawResults = await webSearchService.searchForCompanies(query, 30);
    searchResults = webSearchService.classifyResults(rawResults);
    
    const insertResults = searchResults.map(r => webSearchService.toInsertFormat(r, searchQueryId));
    await storage.createSearchResults(insertResults);
    
    yield { 
      type: 'source', 
      data: { 
        count: searchResults.length,
        tier1: searchResults.filter(r => r.tier === 1).length,
        tier2: searchResults.filter(r => r.tier === 2).length,
        tier3: searchResults.filter(r => r.tier === 3).length,
      }
    };
    
  } catch (error: any) {
    console.error('[RetrievalDiscovery] Web search failed:', error);
    yield { type: 'error', data: { message: `Web search failed: ${error.message}` } };
    return;
  }
  
  yield { type: 'status', data: { message: 'Extracting company information from sources...', progress: 30 } };
  
  const sourcesForExtraction = searchResults.map(r => ({
    url: r.url,
    title: r.title,
    snippet: r.snippet,
    tier: r.tier,
    tierReason: r.reason,
  }));
  
  const extractionSchema = {
    type: "object" as const,
    properties: {
      companies: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const },
            sector: { type: ["string", "null"] as any },
            businessType: { type: ["string", "null"] as any },
            country: { type: ["string", "null"] as any },
            city: { type: ["string", "null"] as any },
            streetAddress: { type: ["string", "null"] as any },
            latitude: { type: ["number", "null"] as any },
            longitude: { type: ["number", "null"] as any },
            revenue: { type: ["number", "null"] as any },
            revenueCurrency: { type: ["string", "null"] as any },
            revenueFiscalYear: { type: ["integer", "null"] as any },
            revenueSource: { type: ["string", "null"] as any },
            employees: { type: ["integer", "null"] as any },
            employeesSource: { type: ["string", "null"] as any },
            confidence: { type: "integer" as const, minimum: 1, maximum: 10 },
            relevanceReason: { type: "string" as const },
            sourceUrls: { type: "array" as const, items: { type: "string" as const } },
            sourceTier: { type: "integer" as const, minimum: 1, maximum: 3 },
          },
          required: ["name", "relevanceReason", "sourceUrls", "sourceTier", "confidence"]
        }
      }
    },
    required: ["companies"]
  };
  
  let extractedCompanies: ExtractedCompany[];
  try {
    const { data, model, retried } = await callLlmWithRetry(
      [
        { role: "system", content: EXTRACTION_PROMPT },
        { 
          role: "user", 
          content: `ORIGINAL QUERY: "${query}"

SEARCH RESULTS TO EXTRACT FROM:
${JSON.stringify(sourcesForExtraction, null, 2)}

Extract up to ${limit} companies that match the query. Remember:
- ONLY extract information explicitly present in the sources above
- For Tier 3 sources, only extract company names (all metrics = null)
- Revenue requires explicit "revenue" label + currency + year from Tier 1/2 sources
- Include source URLs for attribution`
        }
      ],
      extractionSchema,
      selectedModel
    );
    
    extractedCompanies = data.companies || [];
    
    if (retried) {
      yield { type: 'status', data: { message: 'Used fallback model for extraction', progress: 40 } };
    }
    
  } catch (error: any) {
    yield { type: 'error', data: { message: `Extraction failed: ${error.message}` } };
    return;
  }
  
  yield { type: 'status', data: { message: `Found ${extractedCompanies.length} companies, enforcing tier-based validation...`, progress: 50 } };
  
  // ============================================================================
  // HARD ENFORCEMENT: Tier-based metric validation
  // This runs AFTER LLM extraction to ensure the LLM cannot invent metrics
  // ============================================================================
  
  let processed = 0;
  for (const company of extractedCompanies.slice(0, limit)) {
    processed++;
    const progress = 50 + Math.round((processed / limit) * 40);
    
    yield { type: 'status', data: { message: `Validating ${company.name}...`, progress } };
    
    // ============================================================================
    // TIER-BASED ENFORCEMENT (Code level, not prompt level)
    // ============================================================================
    // Tier 3: Name only - ALL metrics forced to null regardless of what LLM returned
    // Tier 2: Revenue allowed only with currency + year + source
    // Tier 1: Revenue allowed only with currency + year + source
    // ============================================================================
    
    let verifiedRevenue: number | null = null;
    let verifiedCurrency: string | null = null;
    let verifiedYear: number | null = null;
    let verifiedSource: string | null = null;
    let verifiedEmployees: number | null = null;
    let verifiedEmployeesSource: string | null = null;
    
    // HARD RULE: Tier 3 sources = name discovery only
    if (company.sourceTier === 3) {
      console.log(`[RetrievalDiscovery] ${company.name}: Tier 3 source - forcing ALL metrics to null`);
      verifiedRevenue = null;
      verifiedCurrency = null;
      verifiedYear = null;
      verifiedSource = 'Tier 3 source - name discovery only, metrics unavailable';
      verifiedEmployees = null;
      verifiedEmployeesSource = 'Tier 3 source - metrics unavailable';
    } 
    // HARD RULE: Tier 1/2 revenue requires currency + year + explicit source
    else if (company.sourceTier <= 2) {
      // Check if revenue has required metadata
      const hasCurrency = company.revenueCurrency && company.revenueCurrency.length >= 2;
      const hasYear = company.revenueFiscalYear && company.revenueFiscalYear >= 2015 && company.revenueFiscalYear <= 2030;
      const hasSource = company.revenueSource && company.revenueSource.length > 5;
      const hasRevenue = company.revenue && company.revenue > 0;
      
      if (hasRevenue && hasCurrency && hasYear && hasSource) {
        // Revenue passes validation - keep it
        verifiedRevenue = company.revenue!;
        verifiedCurrency = company.revenueCurrency!;
        verifiedYear = company.revenueFiscalYear!;
        verifiedSource = company.revenueSource!;
        console.log(`[RetrievalDiscovery] ${company.name}: Revenue validated (${verifiedCurrency} ${verifiedRevenue} FY${verifiedYear})`);
      } else {
        // Revenue FAILS validation - force to null
        console.log(`[RetrievalDiscovery] ${company.name}: Revenue REJECTED - missing currency(${hasCurrency})/year(${hasYear})/source(${hasSource})`);
        verifiedRevenue = null;
        verifiedCurrency = null;
        verifiedYear = null;
        verifiedSource = `Revenue rejected: missing ${!hasCurrency ? 'currency ' : ''}${!hasYear ? 'year ' : ''}${!hasSource ? 'source' : ''}`.trim();
      }
      
      // Employees from Tier 1/2 are allowed with source
      if (company.employees && company.employees > 0 && company.employeesSource) {
        verifiedEmployees = company.employees;
        verifiedEmployeesSource = company.employeesSource;
      }
    }
    
    // ============================================================================
    // VERIFICATION STEP: Search for additional authoritative sources
    // ============================================================================
    
    if (verifiedRevenue && company.sourceTier <= 2) {
      try {
        const verificationResults = await webSearchService.searchForCompanyVerification(company.name);
        
        if (verificationResults.length > 0) {
          const classifiedVerification = webSearchService.classifyResults(verificationResults);
          const tier1or2 = classifiedVerification.filter(r => r.tier <= 2);
          
          if (tier1or2.length === 0) {
            verifiedRevenue = null;
            verifiedCurrency = null;
            verifiedYear = null;
            verifiedSource = 'Verification search found no Tier 1/2 sources';
            
            yield { 
              type: 'verification', 
              data: { 
                company: company.name, 
                status: 'failed',
                reason: 'No authoritative sources found for verification'
              }
            };
          } else {
            await storage.createSearchResults(
              tier1or2.map(r => webSearchService.toInsertFormat(r, searchQueryId, undefined, true))
            );
            
            yield { 
              type: 'verification', 
              data: { 
                company: company.name, 
                status: 'passed',
                sources: tier1or2.length
              }
            };
          }
        }
      } catch (error: any) {
        console.error(`[RetrievalDiscovery] Verification failed for ${company.name}:`, error);
        verifiedRevenue = null;
        verifiedCurrency = null;
        verifiedYear = null;
        verifiedSource = 'Verification search failed';
      }
    }
    
    const validatedData = validateCompanyData({
      name: company.name,
      sector: company.sector,
      businessType: company.businessType,
      country: company.country,
      city: company.city,
      streetAddress: company.streetAddress,
      latitude: company.latitude,
      longitude: company.longitude,
      revenue: verifiedRevenue,
      revenueCurrency: verifiedCurrency,
      revenueFiscalYear: verifiedYear,
      revenueSource: verifiedSource,
      employees: verifiedEmployees,
      employeesSource: verifiedEmployeesSource,
      confidence: company.confidence || 5,
      relevanceReason: company.relevanceReason,
    });
    
    if (!validatedData) {
      console.log(`[RetrievalDiscovery] Skipping invalid company: ${company.name}`);
      continue;
    }
    
    try {
      const createdCompany = await storage.createCompanyFromDiscovery({
        ...validatedData,
        searchQueryId,
      });
      
      yield { type: 'company', data: { company: createdCompany } };
    } catch (error: any) {
      console.error(`[RetrievalDiscovery] Failed to create company ${company.name}:`, error);
    }
  }
  
  yield { type: 'status', data: { message: 'Search complete', progress: 100 } };
  yield { type: 'complete', data: { total: processed } };
}

export async function discoverCompaniesWithRetrievalSync(
  criteria: SearchCriteria,
  searchQueryId: number,
  selectedModel: string = DEFAULT_MODEL,
  originalQuery: string
): Promise<any[]> {
  const results: any[] = [];
  
  for await (const event of discoverCompaniesWithRetrieval(criteria, searchQueryId, selectedModel, originalQuery)) {
    if (event.type === 'company') {
      results.push(event.data.company);
    } else if (event.type === 'error') {
      throw new Error(event.data.message);
    }
  }
  
  return results;
}
