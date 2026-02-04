import OpenAI from "openai";
import { storage } from "../storage";
import { webSearchService, classifySourceTier, type WebSearchResult, type SourceTierClassification } from "./webSearch";
import { validateCompanyData } from "./discovery";
import { DEFAULT_MODEL, FALLBACK_MODELS, parseOpenRouterError, getApprovedModel } from "./discovery";
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

const EXTRACTION_PROMPT = `You are a data extraction expert. Extract company information from web search results.

CRITICAL: Return ONLY a valid JSON object. Do NOT include any explanatory text, preamble, or markdown. Start your response with { and end with }.

EXTRACTION RULES:
1. ONLY extract information explicitly stated in the provided sources - NO hallucination
2. For Tier 3 sources: ONLY extract company name, set ALL other fields to null
3. For Tier 1/2 sources: Extract as much data as available

REQUIRED OUTPUT FIELDS FOR EACH COMPANY:
- name: Exact company name (REQUIRED)
- sector: Industry sector (e.g., "Banking", "Technology") or null
- businessType: "bank", "corporation", "service_provider", etc. or null
- country: HQ country (e.g., "United Arab Emirates") or null
- city: HQ city (e.g., "Abu Dhabi", "Dubai") or null
- streetAddress: Full address if available or null
- latitude/longitude: GPS coordinates if known, otherwise null
- revenue: Annual revenue as NUMBER (e.g., 15200000000 not "15.2 billion") or null
- revenueCurrency: 3-letter code like "USD", "AED", "EUR" - REQUIRED if revenue is provided
- revenueFiscalYear: Year as integer like 2023, 2024 - REQUIRED if revenue is provided
- revenueSource: Where you found this (e.g., "Annual Report 2023") - REQUIRED if revenue is provided
- employees: Number of employees as integer or null
- employeesSource: Source of employee count or null
- confidence: 1-10 score for data quality (REQUIRED)
- relevanceReason: Why this company matches the query (REQUIRED)
- sourceUrls: Array of URLs where found (REQUIRED)
- sourceTier: Best tier (1=regulatory filing, 2=business news, 3=general web) (REQUIRED)

REVENUE RULES:
- Only accept if source explicitly says "revenue" (NOT profit, AUM, valuation, funding)
- Must include currency code (USD, AED, SAR, etc.)
- Must include fiscal year
- Convert text to numbers: "AED 15.2 billion" → revenue: 15200000000, revenueCurrency: "AED"
- If any part is missing, set revenue to null`;

const VERIFICATION_PROMPT = `You are verifying company financial data from authoritative sources.

CRITICAL: Return ONLY a valid JSON object. Do NOT include any explanatory text, preamble, or markdown. Start your response with { and end with }.

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
        
        // Extract JSON from response - handle markdown, preamble text, etc.
        let cleanContent = content.trim();
        
        // Strip markdown code fences
        if (cleanContent.includes('```json')) {
          const match = cleanContent.match(/```json\s*([\s\S]*?)\s*```/);
          if (match) cleanContent = match[1].trim();
        } else if (cleanContent.includes('```')) {
          const match = cleanContent.match(/```\s*([\s\S]*?)\s*```/);
          if (match) cleanContent = match[1].trim();
        }
        
        // If still not starting with {, try to find JSON object in the text
        if (!cleanContent.startsWith('{') && !cleanContent.startsWith('[')) {
          const jsonMatch = cleanContent.match(/(\{[\s\S]*\})/);
          if (jsonMatch) cleanContent = jsonMatch[1];
        }
        
        const data = JSON.parse(cleanContent);
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
  
  // ========== ENFORCE APPROVED MODELS ==========
  const modelValidation = getApprovedModel(selectedModel);
  const approvedModel = modelValidation.model;
  
  // ========== DISCOVERY STATUS TRACKING ==========
  const degradationReasons: string[] = [];
  let discoveryStatus: 'complete' | 'partial' | 'degraded' = 'complete';
  
  if (modelValidation.wasOverridden) {
    console.warn(`[RetrievalDiscovery] ${modelValidation.reason}`);
    yield { type: 'status', data: { message: `Using approved model: ${approvedModel}`, progress: 1 } };
    degradationReasons.push('Non-approved model overridden');
    discoveryStatus = 'degraded';
  }
  // ========== END MODEL ENFORCEMENT ==========
  
  const query = originalQuery.trim();
  const limit = criteria.limit || 10;
  
  yield { type: 'status', data: { message: 'Checking web search configuration...', progress: 2 } };
  
  if (!webSearchService.isConfigured()) {
    yield { type: 'status', data: { message: 'Web search not configured - falling back to LLM-only mode', progress: 5, warning: true } };
    // Emit complete event with degraded status for robustness
    yield { 
      type: 'complete', 
      data: { 
        total: 0,
        discoveryStatus: 'degraded' as const,
        degradationReasons: ['Web search not configured - using LLM-only mode']
      } 
    };
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
      approvedModel  // Use validated approved model
    );
    
    extractedCompanies = data.companies || [];
    
    if (retried) {
      yield { type: 'status', data: { message: 'Used fallback model for extraction', progress: 40 } };
      // Track fallback model usage as degradation
      degradationReasons.push(`Fallback model used: ${model}`);
      if (discoveryStatus === 'complete') discoveryStatus = 'degraded';
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
  
  // Determine final discovery status based on results
  if (processed < limit && processed > 0 && discoveryStatus === 'complete') {
    discoveryStatus = 'partial';
    degradationReasons.push(`Found ${processed} of ${limit} requested companies`);
  }
  
  yield { type: 'status', data: { message: 'Search complete', progress: 100 } };
  yield { 
    type: 'complete', 
    data: { 
      total: processed,
      discoveryStatus,
      degradationReasons: degradationReasons.length > 0 ? degradationReasons : undefined
    } 
  };
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
