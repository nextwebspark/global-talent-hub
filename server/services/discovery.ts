import OpenAI from "openai";
import { storage } from "../storage";

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// Default model - Claude Sonnet for best factual accuracy in company research
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

export const AVAILABLE_MODELS = [
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (Default)", provider: "Anthropic" },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
  { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3", provider: "DeepSeek" },
  { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku", provider: "Anthropic" },
  { id: "google/gemini-2.5-flash-preview", name: "Gemini 2.5 Flash", provider: "Google" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", provider: "Meta" },
  { id: "mistralai/mistral-large-2411", name: "Mistral Large", provider: "Mistral" },
];

const REGION_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'north america': { lat: 40.7128, lng: -74.0060 },
  'united states': { lat: 40.7128, lng: -74.0060 },
  'usa': { lat: 40.7128, lng: -74.0060 },
  'europe': { lat: 51.5074, lng: -0.1278 },
  'asia': { lat: 35.6762, lng: 139.6503 },
  'middle east': { lat: 25.2048, lng: 55.2708 },
  'uae': { lat: 25.2048, lng: 55.2708 },
  'dubai': { lat: 25.2048, lng: 55.2708 },
  'abu dhabi': { lat: 24.4539, lng: 54.3773 },
  'united arab emirates': { lat: 25.2048, lng: 55.2708 },
  'saudi arabia': { lat: 24.7136, lng: 46.6753 },
  'africa': { lat: -1.2921, lng: 36.8219 },
  'south america': { lat: -23.5505, lng: -46.6333 },
  'latin america': { lat: -23.5505, lng: -46.6333 },
  'australia': { lat: -33.8688, lng: 151.2093 },
  'oceania': { lat: -33.8688, lng: 151.2093 },
  'china': { lat: 31.2304, lng: 121.4737 },
  'india': { lat: 19.0760, lng: 72.8777 },
  'japan': { lat: 35.6762, lng: 139.6503 },
  'germany': { lat: 52.5200, lng: 13.4050 },
  'uk': { lat: 51.5074, lng: -0.1278 },
  'united kingdom': { lat: 51.5074, lng: -0.1278 },
  'france': { lat: 48.8566, lng: 2.3522 },
  'default': { lat: 0, lng: 0 }
};

export interface SearchCriteria {
  roles: string[];
  roleFunction: string;
  roleLevel: string;
  sectors: string[];
  regions: string[];
  minRevenue: number | null;
  maxRevenue: number | null;
  minEmployees: number | null;
  maxEmployees: number | null;
  limit: number;
}

export interface ParsedSearchResult {
  criteria: SearchCriteria;
  interpretation: string;
}

function parseNumber(value: any, defaultValue: number = 0): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,$\s]/g, '').replace(/[BbMmKk]$/, (m) => {
      const multipliers: Record<string, string> = { 'B': '000000000', 'b': '000000000', 'M': '000000', 'm': '000000', 'K': '000', 'k': '000' };
      return multipliers[m] || '';
    });
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && isFinite(parsed)) {
      return parsed;
    }
  }
  return defaultValue;
}

function validateCoordinates(lat: any, lng: any, region?: string, country?: string, city?: string): { lat: number; lng: number } {
  const parsedLat = parseNumber(lat);
  const parsedLng = parseNumber(lng);
  
  if (parsedLat >= -90 && parsedLat <= 90 && parsedLng >= -180 && parsedLng <= 180 && 
      (parsedLat !== 0 || parsedLng !== 0)) {
    return { lat: parsedLat, lng: parsedLng };
  }
  
  const lookupKey = (city || country || region || 'default').toLowerCase().trim();
  const fallback = REGION_COORDINATES[lookupKey] || REGION_COORDINATES['default'];
  
  const offset = () => (Math.random() - 0.5) * 0.1;
  return { lat: fallback.lat + offset(), lng: fallback.lng + offset() };
}

const VALID_BUSINESS_TYPES = ['distributor', 'retailer', 'manufacturer', 'wholesaler', 'service_provider'];

function normalizeBusinessType(rawType: string): string {
  const normalized = rawType.toLowerCase().trim();
  if (VALID_BUSINESS_TYPES.includes(normalized)) {
    return normalized;
  }
  if (normalized.includes('distribut')) return 'distributor';
  if (normalized.includes('retail')) return 'retailer';
  if (normalized.includes('manufactur') || normalized.includes('producer')) return 'manufacturer';
  if (normalized.includes('wholesale')) return 'wholesaler';
  if (normalized.includes('service') || normalized.includes('provider')) return 'service_provider';
  return normalized || 'unknown';
}

function validateCompanyData(data: any): any {
  const name = String(data.name || data.companyName || 'Unknown Company').trim();
  const sector = String(data.sector || data.industry || 'Unknown').trim();
  const rawBusinessType = String(data.businessType || data.business_type || data.type || '').trim();
  const businessType = normalizeBusinessType(rawBusinessType);
  const region = String(data.region || data.area || 'Unknown').trim();
  const country = String(data.country || data.location || region).trim();
  const city = String(data.city || data.headquarters || data.hq || '').trim();
  const relevanceReason = String(data.relevanceReason || data.relevance_reason || data.whyIncluded || '').trim();
  
  const coords = validateCoordinates(data.latitude || data.lat, data.longitude || data.lng || data.lon, region, country, city);
  
  let revenue = parseNumber(data.revenue || data.revenue_usd || data.revenueUSD);
  let employees = Math.round(parseNumber(data.employees || data.employeeCount || data.headcount));
  
  if (revenue === 0 || revenue < 1000000) {
    console.warn(`[Discovery] Warning: ${name} has zero/low revenue, using minimum default`);
    revenue = 50000000;
  }
  if (employees === 0 || employees < 10) {
    console.warn(`[Discovery] Warning: ${name} has zero/low employees, using minimum default`);
    employees = 100;
  }
  
  let confidence = parseNumber(data.confidence || data.score, 5);
  confidence = Math.max(1, Math.min(10, confidence));
  
  const revenueSource = String(data.revenueSource || data.revenue_source || 'Unknown').trim();
  const isLikelyPublic = /annual report|10-k|sec filing|quarterly report|investor relations/i.test(revenueSource);
  
  if (revenue > 0 && employees > 0) {
    const revenuePerEmployee = revenue / employees;
    const MAX_REASONABLE_RATIO = 3000000;
    
    if (revenuePerEmployee > MAX_REASONABLE_RATIO) {
      console.warn(`[Discovery] Warning: ${name} has unusually high revenue/employee ratio`);
      confidence = Math.min(confidence, 3);
    }
  }
  
  const MAX_PRIVATE_COMPANY_REVENUE = 30000000000;
  if (revenue > MAX_PRIVATE_COMPANY_REVENUE && !isLikelyPublic) {
    console.warn(`[Discovery] Warning: Private company ${name} has very high revenue`);
    confidence = Math.min(confidence, 4);
  }
  
  const rawExecutives = Array.isArray(data.executives) ? data.executives : [];
  const executives = rawExecutives.map(validateExecutiveData).filter((e: any) => e !== null);
  
  return {
    name,
    sector,
    businessType,
    region,
    country,
    city,
    streetAddress: String(data.streetAddress || data.street_address || data.address || '').trim(),
    latitude: coords.lat,
    longitude: coords.lng,
    revenue,
    revenueSource,
    employees,
    employeesSource: String(data.employeesSource || data.employees_source || 'Unknown').trim(),
    confidence,
    relevanceReason,
    executives
  };
}

function validateExecutiveData(data: any): any {
  if (!data || typeof data !== 'object') {
    return null;
  }
  
  const name = String(data.name || data.fullName || data.executive_name || '').trim();
  const title = String(data.title || data.position || data.role || '').trim();
  
  if (!name || name === 'Unknown' || !title) {
    return null;
  }
  
  let confidence = parseNumber(data.confidence || data.score, 5);
  confidence = Math.max(1, Math.min(10, confidence));
  
  return {
    name,
    title,
    email: data.email || null,
    linkedin: data.linkedin || data.linkedIn || null,
    profileUrl: data.profileUrl || data.profile_url || data.linkedin || null,
    imageUrl: data.imageUrl || data.image_url || null,
    source: data.source || 'discovery',
    confidence
  };
}

function extractJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {}
    }
    
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {}
    }
    
    return null;
  }
}

function extractLimitFromQuery(query: string): number {
  const match = query.match(/(?:top|first|leading|biggest|largest|best)\s*(\d+)/i);
  if (match) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 50) {
      return num;
    }
  }
  return 10;
}

export async function parseSearchQuery(query: string, selectedModel: string = DEFAULT_MODEL): Promise<ParsedSearchResult> {
  const limit = extractLimitFromQuery(query);
  
  const criteria: SearchCriteria = {
    roles: [],
    roleFunction: 'all',
    roleLevel: 'all',
    sectors: [],
    regions: [],
    minRevenue: null,
    maxRevenue: null,
    minEmployees: null,
    maxEmployees: null,
    limit
  };
  
  return {
    criteria,
    interpretation: query
  };
}

export async function fetchAvailableModels(): Promise<any[]> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });
    
    if (!response.ok) {
      console.error("[Discovery] Failed to fetch models from OpenRouter");
      return AVAILABLE_MODELS;
    }
    
    const data = await response.json();
    const models = data.data?.map((model: any) => ({
      id: model.id,
      name: model.name || model.id,
      provider: model.id.split('/')[0] || 'Unknown',
      contextLength: model.context_length,
      pricing: model.pricing
    })) || [];
    
    const hasDeepseek = models.some((m: any) => m.id === DEFAULT_MODEL);
    const sortedModels = hasDeepseek ? models : [
      { id: DEFAULT_MODEL, name: "DeepSeek V3 (Default)", provider: "DeepSeek" },
      ...models
    ];
    return sortedModels;
  } catch (error) {
    console.error("[Discovery] Error fetching models:", error);
    return AVAILABLE_MODELS;
  }
}

export function generateSearchUniqueKey(query: string): string {
  const normalizedQuery = query.toLowerCase().trim().replace(/\s+/g, ' ');
  const timestamp = Date.now();
  return `${normalizedQuery}|${timestamp}`;
}

const WORLD_CLASS_SEARCH_PROMPT = `You are an expert market research analyst for an executive search firm. Your job is to find REAL companies that PRECISELY match what the user is looking for.

===== CRITICAL INSTRUCTIONS =====

1. READ THE QUERY CAREFULLY: Pay attention to EVERY word, especially:
   - Business type specifications (distributor, retailer, manufacturer, wholesaler, etc.)
   - Explicit EXCLUSIONS (phrases like "not retailers", "excluding manufacturers", "only distributors")
   - Geographic constraints (specific countries, regions, cities)
   - Industry/sector focus (FMCG, technology, healthcare, etc.)
   - Size requirements (revenue ranges, employee counts)

2. SELF-VERIFICATION: Before including ANY company, you MUST mentally verify:
   - Does this company's PRIMARY business match what was asked for?
   - If the query says "distributors not retailers", is this company PRIMARILY a distributor?
   - Does this company operate in the specified region?
   - Is this a real, established company (not fictional)?

3. BUSINESS TYPE CLASSIFICATION:
   - DISTRIBUTOR: Buys products from manufacturers and sells to retailers/businesses (B2B wholesale)
   - RETAILER: Sells directly to consumers (B2C)
   - MANUFACTURER: Produces/makes the products
   - WHOLESALER: Bulk seller to businesses (similar to distributor)
   - SERVICE_PROVIDER: Provides services rather than physical goods

4. EXCLUSION HANDLING:
   - If query says "not retailers" → EXCLUDE any company whose primary business is retail
   - If query says "only distributors" → INCLUDE ONLY companies whose primary business is distribution
   - Even if a company does some distribution, if they're primarily a retailer, EXCLUDE them

===== OUTPUT FORMAT =====

Return a JSON object with this EXACT structure:
{
  "companies": [
    {
      "name": "Exact Legal Company Name",
      "businessType": "distributor|retailer|manufacturer|wholesaler|service_provider",
      "relevanceReason": "Why this company matches the query - be specific about how they fit the criteria",
      "sector": "Industry Sector (e.g., FMCG, Consumer Goods, Food & Beverage)",
      "region": "Geographic Region (e.g., Middle East, GCC)",
      "country": "Country Name",
      "city": "Headquarters City",
      "streetAddress": "Exact street address of headquarters",
      "latitude": 25.2048,
      "longitude": 55.2708,
      "revenue": 500000000,
      "revenueSource": "How you determined this (e.g., 'Industry estimate based on market position', 'Annual report 2024')",
      "employees": 3000,
      "employeesSource": "How you determined this (e.g., 'LinkedIn company size indicator')",
      "confidence": 7,
      "executives": [
        {
          "name": "Full Name",
          "title": "Exact Current Title",
          "source": "Where you found this (Company Website, LinkedIn, Press Release)",
          "linkedin": "https://linkedin.com/in/username",
          "confidence": 7
        }
      ]
    }
  ]
}

===== DATA QUALITY REQUIREMENTS =====

1. ONLY include companies you are confident are REAL and currently operating
2. Revenue/Employees: Use best available data, never return 0
   - For private companies: Use industry estimates, LinkedIn data, press mentions
   - Clearly state the source of your estimate
3. GPS Coordinates: Must be accurate for the actual headquarters location
4. Executives: Must be current employees with accurate titles
5. Confidence scoring:
   - 8-10: Verified from official sources (annual reports, company website)
   - 5-7: Industry data, LinkedIn, news articles
   - 1-4: Rough estimates, limited verification

===== RANKING =====

Rank companies by:
1. Relevance to the exact query (most important)
2. Revenue/market position (within relevant companies)
3. Data confidence/reliability`;

export async function* discoverCompaniesStreaming(
  criteria: SearchCriteria,
  searchQueryId: number,
  selectedModel: string = DEFAULT_MODEL,
  originalQuery: string
): AsyncGenerator<{ type: 'company' | 'status' | 'error' | 'complete', data: any }> {
  if (!originalQuery || originalQuery.trim().length === 0) {
    yield { type: 'error', data: { message: 'Original query is required for accurate search results' } };
    return;
  }
  
  const limit = criteria.limit || 10;
  const query = originalQuery.trim();
  
  const client = openrouter;
  const modelName = selectedModel || DEFAULT_MODEL;
  
  console.log(`[Discovery Streaming] Starting for ${limit} companies with model: ${modelName}`);
  console.log(`[Discovery Streaming] Original query: "${query}"`);
  
  yield { type: 'status', data: { message: 'Analyzing your search request...', progress: 5 } };
  
  const messages = [
    {
      role: "system" as const,
      content: WORLD_CLASS_SEARCH_PROMPT
    },
    {
      role: "user" as const,
      content: `USER SEARCH QUERY: "${query}"

Find exactly ${limit} companies that match this query.

IMPORTANT: 
- Read the query carefully for any business type specifications or exclusions
- Each company MUST have a "relevanceReason" explaining WHY it matches the query
- Only include companies that PRECISELY match what was asked for

Return ONLY the JSON object, no additional text.`
    }
  ];

  const requestOptions: any = {
    model: modelName,
    messages,
    max_tokens: 8000,
    temperature: 0.1
  };

  yield { type: 'status', data: { message: 'Researching companies...', progress: 15 } };

  let response;
  try {
    response = await client.chat.completions.create(requestOptions);
  } catch (apiError: any) {
    console.error("[Discovery Streaming] LLM API error:", apiError.message);
    yield { type: 'error', data: { message: `AI model error: ${apiError.message}` } };
    return;
  }

  const content = response.choices[0]?.message?.content || "{}";
  console.log("[Discovery Streaming] LLM response received, length:", content.length);
  
  yield { type: 'status', data: { message: 'Processing results...', progress: 40 } };
  
  const data = extractJSON(content);
  if (!data) {
    console.error("[Discovery Streaming] Failed to parse LLM response as JSON");
    console.error("[Discovery Streaming] Raw content:", content.substring(0, 500));
    yield { type: 'error', data: { message: 'Failed to parse AI response' } };
    return;
  }
  
  let companiesData: any[] = [];
  if (Array.isArray(data)) {
    companiesData = data;
  } else if (data.companies && Array.isArray(data.companies)) {
    companiesData = data.companies;
  } else if (data.results && Array.isArray(data.results)) {
    companiesData = data.results;
  } else if (data.data && Array.isArray(data.data)) {
    companiesData = data.data;
  } else {
    const arrayProp = Object.values(data).find(v => Array.isArray(v));
    if (arrayProp) {
      companiesData = arrayProp as any[];
    }
  }
  
  if (companiesData.length === 0) {
    console.warn("[Discovery Streaming] No companies found in LLM response");
    yield { type: 'complete', data: { total: 0 } };
    return;
  }

  console.log(`[Discovery Streaming] Processing ${companiesData.length} companies`);
  let processed = 0;
  
  for (const rawCompanyData of companiesData) {
    try {
      const validatedData = validateCompanyData(rawCompanyData);
      
      if (!validatedData.name || validatedData.name === 'Unknown Company') {
        console.warn("[Discovery Streaming] Skipping company with invalid name");
        continue;
      }
      
      const company = await storage.createCompanyFromDiscovery({
        name: validatedData.name,
        sector: validatedData.sector,
        businessType: validatedData.businessType || null,
        region: validatedData.region,
        country: validatedData.country,
        streetAddress: validatedData.streetAddress || null,
        latitude: String(validatedData.latitude),
        longitude: String(validatedData.longitude),
        revenue: String(validatedData.revenue),
        revenueSource: validatedData.revenueSource,
        employees: validatedData.employees,
        employeesSource: validatedData.employeesSource,
        confidence: validatedData.confidence,
        relevanceReason: validatedData.relevanceReason || null,
        color: "#1e3a8a",
        searchQueryId
      });

      const executives = [];
      for (const rawExec of validatedData.executives) {
        try {
          const validatedExec = validateExecutiveData(rawExec);
          if (!validatedExec) continue;
          
          const executive = await storage.createExecutiveFromDiscovery({
            companyId: company.id,
            name: validatedExec.name,
            title: validatedExec.title,
            email: validatedExec.email,
            linkedin: validatedExec.linkedin,
            profileUrl: validatedExec.profileUrl,
            imageUrl: validatedExec.imageUrl,
            source: validatedExec.source || 'discovery',
            confidence: validatedExec.confidence
          });
          executives.push(executive);
        } catch (execError: any) {
          console.warn("[Discovery Streaming] Failed to create executive:", execError.message);
        }
      }

      processed++;
      const progress = 40 + Math.round((processed / companiesData.length) * 55);
      
      yield { 
        type: 'company', 
        data: { 
          company: { ...company, executives },
          progress,
          current: processed,
          total: companiesData.length
        } 
      };
      
    } catch (companyError: any) {
      console.warn("[Discovery Streaming] Failed to create company:", companyError.message);
    }
  }

  console.log(`[Discovery Streaming] Complete: ${processed} companies created`);
  yield { type: 'complete', data: { total: processed } };
}

export async function discoverCompaniesAndExecutives(
  criteria: SearchCriteria,
  searchQueryId: number,
  selectedModel: string = DEFAULT_MODEL,
  originalQuery: string
): Promise<any[]> {
  if (!originalQuery || originalQuery.trim().length === 0) {
    throw new Error('Original query is required for accurate search results');
  }
  const results: any[] = [];
  
  for await (const event of discoverCompaniesStreaming(criteria, searchQueryId, selectedModel, originalQuery)) {
    if (event.type === 'company') {
      results.push(event.data.company);
    } else if (event.type === 'error') {
      throw new Error(event.data.message);
    }
  }
  
  return results;
}

export async function researchCompanyDetails(companyName: string, selectedModel: string = DEFAULT_MODEL): Promise<any> {
  console.log(`[Discovery] Researching company details for: ${companyName}`);
  
  const client = openrouter;
  const modelName = selectedModel || DEFAULT_MODEL;
  
  const messages = [
    {
      role: "system" as const,
      content: `You are a company research expert. Given a company name, find accurate details about the company including:
- Exact headquarters location (street address, city, country, GPS coordinates)
- Estimated annual revenue in USD
- Estimated employee count
- Primary industry/sector
- Business type (manufacturer, distributor, retailer, service_provider, etc.)

Return ONLY a JSON object with this structure:
{
  "name": "Official Company Name",
  "sector": "Industry Sector",
  "businessType": "distributor|retailer|manufacturer|wholesaler|service_provider",
  "region": "Geographic Region",
  "country": "Country",
  "city": "Headquarters City",
  "streetAddress": "123 Main Street",
  "latitude": 25.2048,
  "longitude": 55.2708,
  "revenue": 500000000,
  "revenueSource": "Source of revenue estimate",
  "employees": 1000,
  "employeesSource": "Source of employee count"
}`
    },
    {
      role: "user" as const,
      content: `Research and provide details for this company: "${companyName}"`
    }
  ];

  try {
    const response = await client.chat.completions.create({
      model: modelName,
      messages,
      max_tokens: 1000,
      temperature: 0.1
    });
    
    const content = response.choices[0]?.message?.content || "{}";
    const data = extractJSON(content);
    
    if (data) {
      return validateCompanyData(data);
    }
    
    return null;
  } catch (error: any) {
    console.error("[Discovery] Company research error:", error.message);
    return null;
  }
}
